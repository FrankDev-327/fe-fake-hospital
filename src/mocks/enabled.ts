/** Fake backend on? Set by VITE_API_MOCK (on in .env.development, off with `pnpm dev:backend`). */
export const MOCK_API = import.meta.env.VITE_API_MOCK === 'true';
