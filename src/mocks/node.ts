import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** Same fake backend for Vitest. */
export const server = setupServer(...handlers);
