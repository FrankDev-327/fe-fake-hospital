import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/** Fake backend in the browser (pnpm dev). Requests it doesn't know go to the network as usual. */
export const worker = setupWorker(...handlers);
