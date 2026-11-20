# fe-fake-hospital: frontend plan

Frontend for the fake-hospital backend (`~/Documents/PersonalProject/fake-hospital`).
Goal: a working staff app AND learning frontend from zero, so every slice teaches a few new concepts.

## 1. What the backend gives us

- One entry point: the **gateway** (`/api/<service>/<path>`). The frontend only ever talks to it.
- Auth: `POST /api/identity/auth/login` returns a JWT access token (15 min) + refresh token (12 h, rotated on every refresh). `auth/refresh`, `auth/logout`, `me`.
- Roles: doctor, nurse, lab_tech, pharmacist, receptionist, admin. Each role sees a different app (a doctor only their own patients, lab only work items, admin no clinical data). Unauthorized patient = 404.
- Live updates: the `live` service streams SSE events.
- Files: upload/download with presigned S3 URLs (browser talks to S3 directly), printing returns PDFs.
- Status: gateway status endpoint says which features are degraded, so the UI can show a banner instead of breaking.

## 2. Stack (and why)

| Piece | Choice | Why |
|---|---|---|
| Language | TypeScript | You already know it from the backend |
| UI library | React 19 | Most used, most jobs, biggest ecosystem |
| Build tool | Vite | Fast dev server, almost no config |
| Routing | TanStack Router | Type-safe routes and search params; route guards per role |
| Server data | TanStack Query | Fetching, caching, loading/error states, refetch. This is the backend-ish part of frontend |
| Forms | React Hook Form + Zod | You already use Zod for DTOs |
| Styling | Tailwind CSS + shadcn/ui | Ready accessible components (tables, dialogs, forms) you own as code |
| Tests | Vitest + Testing Library, Playwright for e2e | Vitest you know; Playwright clicks through the real app |
| Package manager | pnpm | Same as the backend |
| Serving | nginx in Docker, proxying `/api` to the gateway | Same origin, so no CORS and cookies just work |

Not using Next.js on purpose: it's a staff app behind login, no SEO, no need for server rendering. A plain SPA keeps the concepts few while learning.

## 3. Security rules (hospital data)

- Access token only in memory (a JS variable), never localStorage.
- Refresh token in an **httpOnly, Secure, SameSite=Strict cookie** so JavaScript can't read it. Needs a small backend change (gateway/identity sets the cookie instead of returning it in JSON). **Decision open.**
- Patient data never written to localStorage/sessionStorage/IndexedDB. Query cache is memory only and cleared on logout.
- Auto logout after inactivity (shared ward computers).
- No patient data in URLs beyond ids, no patient data in console logs or error reports.

## 4. Slices

Each slice: concepts to learn → what gets built → done when. Every slice also adds its fake endpoints + fake data to `src/mocks/` and tests on them.

### Slice 0: tools and first page
- Learn: what a SPA is, Vite, JSX, components, props, how the browser runs it, devtools.
- Build: project with pnpm + Vite + React + TS + Tailwind + ESLint/Prettier, a "Hello hospital" page, folder structure.
- Done: `pnpm dev` shows the page, `pnpm build` passes.

### Slice 1: login and app shell
- Learn: state (`useState`), events, forms, `fetch`, routing, React context, protected routes.
- Build: login page, API client (adds the token, refreshes on 401, one retry), `me` call, layout with sidebar that changes per role, logout, inactivity timeout.
- Done: each role logs in and sees its own menu; expired token refreshes silently.

### Slice 2: patients
- Learn: TanStack Query (queries, loading/error states), lists, search with debounce, URL search params, React Hook Form + Zod.
- Build: "my patients" list, search, patient detail page (header with allergies always visible), receptionist registration/edit, contacts.
- Done: doctor sees only their patients; unknown patient shows a 404 page.

### Slice 3: encounters and notes
- Learn: mutations, optimistic vs pessimistic updates, cache invalidation, dialogs, disabled states.
- Build: encounter view, write note, sign / amend / void, diagnoses (add, revise).
- Done: signed notes are read-only in the UI; amend shows history.

### Slice 4: medication
- Learn: more complex forms (dynamic fields), confirmation dialogs for dangerous actions.
- Build: prescribe, stop/void, nurse medication round (administrations), allergy warning before prescribing.
- Done: nurse can record an administration; doctor sees it.

### Slice 5: vitals
- Learn: charts (Recharts), date handling.
- Build: record vitals, vitals table + chart over time, void a wrong entry.

### Slice 6: lab
- Learn: role-specific screens, worklists, status badges.
- Build: doctor orders labs; lab tech worklist (collect, enter results, correct); doctor acknowledges results, critical results highlighted.

### Slice 7: admissions, beds, live updates
- Learn: SSE (`EventSource`), pushing live events into the Query cache, reconnects.
- Build: ward board with beds, admit / transfer / discharge (with retry/abort for the saga), board updates live without refresh.
- Done: discharge in one browser shows up in another without reloading.

### Slice 8: documents and printing
- Learn: file upload, presigned URLs, progress bars, opening PDFs.
- Build: upload document, document list, OCR findings review (accept/reject), print prescription / lab report / discharge letter.

### Slice 9: appointments
- Learn: calendar UI, time zones.
- Build: doctor availability, free slots, book / cancel / no-show / complete.

### Slice 10: admin, reports, degraded mode
- Learn: dashboards, error boundaries, handling a service being down.
- Build: admin staff screens (doctor-patient, doctor-nurse assignments, handover), reports (occupancy, critical results...), status page + "lab is down" banner while the rest keeps working.

### Slice 11: quality and shipping
- Learn: component tests, e2e tests, accessibility basics, production build, Docker.
- Build: Vitest tests for key components, Playwright flows (login, prescribe, discharge), Dockerfile (build → nginx), added to the backend's docker compose, README with screenshots.

## 5. How we work

- For each slice: I explain the new concepts with a small example first, then we build the slice.
- Write the core first, run it against the real backend (Docker) when needed, asking first.
- Commit on main, simple messages, push only when asked.

## 6. Decisions (2026-11-20)

1. Refresh token in an httpOnly cookie. Done in the backend: identity sets `refresh_token` (httpOnly, Secure, SameSite=Strict, Path=/api/identity/auth) and no longer returns it in JSON; refresh/logout read the cookie; gateway forwards several Set-Cookie headers correctly; k6 sends the cookie by hand.
2. Separate repo (this folder), never inside the backend.
3. Run locally (`pnpm dev`, Node 24 via `.nvmrc`) until everything is done; Docker (nginx) is the last step.
4. Still open: who types the code (default for now: I write and explain).
5. Fake backend first (2026-11-20): every screen runs on fake data from MSW (Mock Service Worker) until the whole app is done, so we can see how it looks. The fake endpoints copy the real backend's URLs, bodies and error codes. At the end: `pnpm dev:backend` against the real gateway and fix what differs.

## 7. Backend gaps found while building the frontend

The fake backend has these already, marked `NOT IN THE BACKEND YET` in `src/mocks/handlers/`. The real backend needs them before the switch:

1. **Doctors directory for the front desk**: `GET /api/identity/staff/doctors` (cards only: id, name, license). The receptionist must pick a doctor to see/book appointments, but `GET /staff` is admin only.
2. **Patient names in a doctor's schedule**: `GET /api/admissions/doctors/:id/appointments` returns only `patientId`. The front desk would need one request per patient, and a doctor can't look up patients who aren't assigned to them yet (first visits), so the schedule should include `patient: { mrn, firstName, lastName }`.
3. **Lab test catalog for the UI**: `GET /api/clinical/lab-tests` (code, name, unit, ref and critical limits). The order form, the worklist names and the live flag preview while typing results need it.

## 8. Progress

- Fake backend: `src/mocks/` (data/ = fake records, handlers/ = one file per service, session.ts = fake tokens). On by default in `pnpm dev` (.env.development `VITE_API_MOCK=true`), off with `pnpm dev:backend`, never in the production build. Login page shows demo accounts (one per role, password `demo-password`). Tests use the same handlers (msw/node).
- **Read-only pass for every role (2026-11-20)**, all on fake data, so each user's screens can be seen:
  - doctor: my patients (filter box: name or MRN, accents optional, filtered on screen) → patient chart (details, allergy warning banner, allergies, active medication), ward board (names only for own patients), my appointments (7 days), reports
  - nurse: my patients, chart, ward board, medication round (due/overdue first, "tomorrow" labels)
  - lab tech: worklist with tabs (to collect / collected), urgent first
  - pharmacist: drug catalog search
  - receptionist: patient search (in the URL ?q=), demographics only (no clinical data), appointments of a chosen doctor
  - admin: staff list with role filter, reports (occupancy bars, critical results with "<5")
  - The buttons that CHANGE things (register, prescribe, give a dose, admit, book...) come in the slices below.
- **Slice 2 done (2026-11-20, fake backend)**: receptionist registers patients (form with backend rules: OIB check digit, MBO 9 digits, date of birth 1900..today; duplicate OIB/MBO -> link to the existing record), edits them (only changed fields + version; 409 stale_version -> "someone else changed it, reload"), contacts card (everyone reads, front desk adds).
- **Slice 3 done (2026-11-20, fake backend)**: visits on the chart (list + doctor "Start visit"), visit page `/patients/:id/visits/:visitId`: notes (draft -> sign; own drafts private; save/discard; amend = correction draft that replaces the original when signed; author can mark as error with a reason; empty templates can't be signed), diagnoses (ICD-10 search, primary/secondary, provisional/confirmed; confirm/resolve/mark as error = new version), finish (blocked by unsigned notes) / cancel (only without records). Nurse: nursing notes only, no diagnoses, no finish. Problem list on the chart.
- **Slice 4 done (2026-11-20, fake backend)**: doctor prescribes from the catalog (dose/unit/route/interval or as needed); the backend's safety checks are handled: `prescription_blocked` (allergy match by ATC prefix) -> written override reason, `warnings_need_acknowledgement` (duplicate therapy, text-only allergies) -> "I have checked these"; stop (reason), mark as error (prescriber, no doses given). Nurse records doses given/skipped/refused (idempotency key per dialog so a double tap records once; `dose_too_soon` -> confirm early + note; different amount or skipped -> note required); dose history; Record button in the medication round.
- **Slice 5 done**: record a vitals round (BP, pulse, temperature, SpO2, breathing rate, sugar, pain, weight, height; backend plausibility ranges checked while typing), tiles with the latest values, Recharts line chart per sign (BP = systolic + diastolic, validated colors), readings table with "mark as error".
- **Slice 6 done**: LOINC test catalog (same codes/ranges as the backend), doctor orders tests (routine/urgent) from the visit or chart; nurse "Sample taken" on the ward; lab tech collects and enters results with a live High/Low/Critical preview; results with flags and reference ranges on the chart; unacknowledged critical results stay red with a banner until a doctor acknowledges. Not done yet: correcting a result, importing external results (comes with documents, slice 8).
- Fake backend now has a small database (`src/mocks/db.ts`): changes are saved in localStorage and survive reloads; "Reset demo data" on the login page goes back to the seed. Tests reset it before each test.
- Slice 0 done: Vite + React 19 + TS 6 + Tailwind 4 + ESLint + Prettier + Vitest.
- Slice 1 written: login page (React Hook Form + Zod), API client (access token in memory, single-flight refresh with Web Locks, retry once on 401), AuthProvider (restore session on reload, idle logout 15 min, query cache cleared on logout), TanStack Router with login guard + role guard per section, sidebar per role, placeholder pages. Tests (83 now, incl. one per role page and full register/edit/visit/note/diagnosis flows): api client (one refresh for parallel 401s, etc.), safe redirect, full login/session/role flows on the fake backend; console.error fails a test. Checked in headless Chromium. NOT yet tried against the real backend (that's for the end).
