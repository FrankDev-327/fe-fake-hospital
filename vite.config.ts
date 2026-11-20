import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Where the backend gateway runs locally (docker compose maps it to 3000). */
const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // The browser only ever talks to localhost:5173. Vite forwards /api to the gateway, so for
    // the browser everything is the SAME origin: no CORS, and the refresh cookie just works.
    // In production nginx does the same job.
    proxy: { '/api': { target: GATEWAY_URL, changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
