import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';

// This file is intentionally empty but required for MSW setup
// The actual server setup is done in each test file to keep the handlers close to their tests

export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers()); 