/**
 * Frontend load test (k6 + k6/browser). Real Chromium tabs click through the app like staff do,
 * while plain HTTP traffic downloads the app files. The app is the production build WITH the fake
 * backend (`pnpm build:demo`), so this measures the frontend: page loads, Web Vitals, how fast
 * screens appear, the discharge saga. Not the real backend (that has its own k6 test).
 *
 * Run: `pnpm load-test` (builds, serves on :4173, runs, writes load-tests/results/).
 * Live dashboard while it runs: http://localhost:5665
 */
import { browser } from 'k6/browser';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { textSummary } from './lib/vendor/k6-summary.js';
import { htmlReport } from './lib/vendor/k6-reporter.js';

const BASE = __ENV.BASE_URL || 'http://localhost:4173';
const MINUTES = Number(__ENV.DURATION_MIN || 30);
const RESULTS = __ENV.RESULTS_DIR || 'load-tests/results';
const PASSWORD = 'demo-password';
const USERS = {
  doctor: 'ana.kovac@hospital.test',
  nurse: 'ivan.horvat@hospital.test',
  reception: 'luka.juric@hospital.test',
  admin: 'tomislav.peric@hospital.test',
  discharge: 'ana.kovac@hospital.test',
};
const fakeId = (n) => `0193b000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const JOSIP = fakeId(2001); // Internal medicine, room 101, bed A

// How long the user waits for each screen (click -> the screen shows what it should)
const uiLogin = new Trend('ui_login_ms', true);
const uiPatients = new Trend('ui_patients_list_ms', true);
const uiNextPage = new Trend('ui_next_page_ms', true);
const uiChart = new Trend('ui_chart_open_ms', true);
const uiWard = new Trend('ui_ward_board_ms', true);
const uiMove = new Trend('ui_move_bed_ms', true);
const uiSearch = new Trend('ui_search_ms', true);
const uiReports = new Trend('ui_reports_ms', true);
const dischargeSaga = new Trend('ui_discharge_saga_ms', true);
const flowErrors = new Counter('ui_flow_errors');
const jsErrors = new Counter('ui_js_errors');

// steady load = MINUTES - 2 ramp up - 2 ramp down
const ramp = (target) => [
  { duration: '2m', target },
  { duration: `${Math.max(MINUTES - 4, 1)}m`, target },
  { duration: '2m', target: 0 },
];
const ui = (exec, target) => ({
  executor: 'ramping-vus',
  exec,
  startVUs: 0,
  stages: ramp(target),
  gracefulRampDown: '30s',
  gracefulStop: '30s',
  options: { browser: { type: 'chromium' } },
});

export const options = {
  scenarios: {
    doctor: ui('doctor', 2),
    nurse: ui('nurse', 2),
    reception: ui('reception', 1),
    reports: ui('reports', 1),
    // one doctor discharging patients all the time (the saga with its steps)
    discharge: {
      executor: 'constant-vus',
      exec: 'discharge',
      vus: 1,
      duration: `${MINUTES}m`,
      gracefulStop: '30s',
      options: { browser: { type: 'chromium' } },
    },
    // people opening the app: index.html + every JS/CSS file (what the web server serves)
    static: {
      executor: 'ramping-arrival-rate',
      exec: 'staticFiles',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 10,
      maxVUs: 40,
      stages: ramp(10),
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    ui_flow_errors: ['count<5'],
    ui_js_errors: ['count==0'],
    // Google's "good" Web Vitals limits, at the 75th percentile like they measure it
    browser_web_vital_lcp: ['p(75)<2500'],
    browser_web_vital_fcp: ['p(75)<1800'],
    browser_web_vital_cls: ['p(75)<0.1'],
    browser_web_vital_inp: ['p(75)<200'],
    ui_login_ms: ['p(95)<3000'],
    ui_patients_list_ms: ['p(95)<2000'],
    ui_next_page_ms: ['p(95)<500'],
    ui_chart_open_ms: ['p(95)<2000'],
    ui_ward_board_ms: ['p(95)<2000'],
    ui_move_bed_ms: ['p(95)<2000'],
    ui_search_ms: ['p(95)<2000'],
    ui_reports_ms: ['p(95)<3000'],
    ui_discharge_saga_ms: ['p(95)<8000'],
    'http_req_failed{scenario:static}': ['rate<0.01'],
    'http_req_duration{scenario:static}': ['p(95)<300'],
  },
};

/** The app files listed in index.html (hashed names change on every build) */
export function setup() {
  const index = http.get(`${BASE}/`);
  if (index.status !== 200) throw new Error(`app not served at ${BASE}`);
  const files = [...index.body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
    (m) => m[1],
  );
  return { files };
}

const time = async (trend, fn) => {
  const t0 = Date.now();
  await fn();
  trend.add(Date.now() - t0);
};

/** A fresh browser profile = a new person at a new computer (empty localStorage = fresh fake data) */
async function session(user, fn) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // JS errors are collected inside the page and read at the end (k6's page.on('console')
  // listener blocks the page in k6 2.3, so it can't be used)
  await context.addInitScript(`
    window.__errors = [];
    addEventListener('error', (e) => window.__errors.push(String(e.message)));
    addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));
  `);
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/login`);
    await time(uiLogin, async () => {
      await page.getByLabel('Email').fill(USERS[user]);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Log in' }).click();
      await page.getByRole('button', { name: 'Log out' }).waitFor();
    });
    await fn(page, context);
    const errors = await page.evaluate(() => window.__errors);
    for (const e of errors) {
      jsErrors.add(1);
      console.warn(`[${user}] JS error: ${e}`);
    }
  } catch (e) {
    flowErrors.add(1, { user });
    console.warn(`[${user}] ${e}`);
  } finally {
    await context.close();
  }
}

const nav = (page, name) =>
  page.locator('nav').getByRole('link', { name, exact: true }).click();

/** "Think time" between screens, like a person reading */
const think = (min = 1, max = 3) => sleep(min + Math.random() * (max - min));

export async function doctor() {
  await session('doctor', async (page) => {
    await time(uiPatients, async () => {
      await nav(page, 'Patients');
      await page.getByText('Page 1 of', { exact: false }).waitFor();
    });
    think();
    await time(uiNextPage, async () => {
      await page.getByRole('button', { name: 'Next' }).click();
      await page.getByText('Page 2 of', { exact: false }).waitFor();
    });
    think();
    // a generated patient from page 2, then one of the seeded ones
    const pick = page.locator('tbody tr a').nth(Math.floor(Math.random() * 15));
    await time(uiChart, async () => {
      await pick.click();
      await page.getByText('Hospital stay').waitFor();
      await page.getByText('Vitals', { exact: true }).waitFor();
    });
    check(page, { 'chart shows the back link': (p) => p.url().includes('/patients/') });
    think(2, 5);
    await page.getByText('← Back to patients').click();
    await page.getByText('Page 1 of', { exact: false }).waitFor();
    const seeded = ['Matić, Josip', 'Petrović, Mira', 'Vuković, Kata', 'Horvat, Marija'];
    await time(uiChart, async () => {
      await page
        .getByRole('link', { name: seeded[Math.floor(Math.random() * seeded.length)] })
        .click();
      await page.getByText('Hospital stay').waitFor();
      await page.getByText('Vitals', { exact: true }).waitFor();
    });
    think(2, 5);
    await time(uiWard, async () => {
      await nav(page, 'Ward board');
      await page.getByText('beds free', { exact: false }).waitFor();
    });
    for (const ward of ['Cardiology', 'Neurology']) {
      think();
      await page.getByRole('tab', { name: ward }).click();
      await page
        .getByText(ward === 'Cardiology' ? 'Room 501' : 'Room 601', { exact: true })
        .waitFor();
    }
    think();
  });
}

export async function nurse() {
  await session('nurse', async (page) => {
    await time(uiWard, async () => {
      await nav(page, 'Ward board');
      await page.getByText('beds free', { exact: false }).waitFor();
    });
    think();
    // move one of my patients to a free bed on the same ward
    await page.getByRole('button', { name: 'Move' }).first().click();
    const dialog = page.locator('[role=dialog]');
    await dialog.locator('select').nth(0).selectOption({ label: 'Internal medicine' });
    const bed = dialog.locator('select').nth(1);
    await dialog.locator('select >> nth=1 >> option >> nth=1').waitFor({ state: 'attached' });
    await bed.selectOption({ index: 1 });
    await time(uiMove, async () => {
      await dialog.locator('button[type=submit]').click();
      await page.getByText('Patient moved').waitFor();
    });
    check(page, { 'nurse moved a patient': () => true });
    think(2, 4);
    // then open a patient's chart from the board
    await time(uiChart, async () => {
      await page.locator('main li a').first().click();
      await page.getByText('Hospital stay').waitFor();
    });
    think(2, 4);
  });
}

export async function reception() {
  await session('reception', async (page) => {
    await nav(page, 'Patients');
    const box = page.getByLabel('Search patients');
    for (const q of ['hor', 'babić', 'kov', 'MRN-240137']) {
      await time(uiSearch, async () => {
        await box.fill(q);
        await page.locator('tbody tr').first().waitFor();
      });
      think();
    }
    await time(uiChart, async () => {
      await page.locator('tbody tr a').first().click();
      await page.getByText('Contacts', { exact: true }).waitFor();
    });
    think(2, 4);
  });
}

export async function reports() {
  await session('admin', async (page) => {
    await time(uiReports, async () => {
      await nav(page, 'Reports');
      await page.getByText('Births', { exact: true }).first().waitFor();
      await page.locator('.recharts-surface').nth(2).waitFor();
    });
    think(3, 6);
  });
}

/**
 * A doctor discharges Josip and follows the saga's steps on his chart, then checks the ward
 * board shows bed 101 A free. (Two tabs + live push is checked with Playwright instead: k6's
 * browser never delivers the pushed SSE messages to the page, see the README.)
 */
export async function discharge() {
  await session('discharge', async (page) => {
    await page.goto(`${BASE}/patients/${JOSIP}`);
    await page.getByText('Internal medicine, room 101, bed A').waitFor();
    think();
    await page.getByRole('button', { name: 'Discharge' }).click();
    const started = Date.now();
    await page.locator('[role=dialog]').getByRole('button', { name: 'Discharge' }).click();
    await page.getByText('Discharge in progress').waitFor();
    await page.getByText('Not in hospital right now.').waitFor({ timeout: 15000 });
    dischargeSaga.add(Date.now() - started);
    think();
    await time(uiWard, async () => {
      await nav(page, 'Ward board');
      await page.getByText('beds free', { exact: false }).waitFor();
    });
    const stillThere = await page.getByText('Matić, Josip').count();
    check(stillThere, { 'bed is free after discharge': (n) => n === 0 });
    think(3, 6);
  });
}

export function staticFiles(data) {
  const res = http.get(`${BASE}/`, { tags: { file: 'index.html' } });
  check(res, { 'index.html 200': (r) => r.status === 200 });
  const batch = [...data.files, '/mockServiceWorker.js'].map((f) => [
    'GET',
    `${BASE}${f}`,
    null,
    { tags: { file: f.endsWith('.css') ? 'css' : 'js' } },
  ]);
  for (const r of http.batch(batch)) check(r, { 'app file 200': (x) => x.status === 200 });
}

export function handleSummary(data) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const text = textSummary(data, { indent: ' ', enableColors: false });
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    [`${RESULTS}/k6-fe-${stamp}-summary.txt`]: text,
    [`${RESULTS}/k6-fe-${stamp}.html`]: htmlReport(data, {
      title: `fe-fake-hospital frontend load test ${stamp}`,
    }),
    [`${RESULTS}/k6-fe-${stamp}.json`]: JSON.stringify(data, null, 2),
  };
}
