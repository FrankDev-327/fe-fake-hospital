import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import '@/i18n';
import { mockDb } from '@/mocks/db';
import { server } from '@/mocks/node';

// jsdom doesn't do layout or scrolling; the router calls scrollTo on navigation
window.scrollTo = () => {};
// charts measure their box with ResizeObserver, which jsdom doesn't have
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Every test talks to the same fake backend as `pnpm dev`.
// 'error': a request with no fake handler fails the test instead of silently hitting the network.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers(); // drop per-test overrides (server.use)
  cleanup();
  localStorage.clear();
  mockDb.reset(); // every test starts from the seed data
});
afterAll(() => server.close());

// React and the router report swallowed errors (like a crashing beforeLoad) with console.error.
// Make them fail the test instead of scrolling by.
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    throw new Error(`console.error in test: ${args.map(String).join(' ')}`);
  });
});
