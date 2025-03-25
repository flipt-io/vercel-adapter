import { expect, it, describe } from 'vitest';
import { flag, dedupe } from 'flags/next';
import { createFliptAdapter } from '.';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { HttpResponse, http } from 'msw';

const restHandlers = [
  http.post('http://localhost:8080/evaluate/v1/boolean', () => {
    return HttpResponse.json({
      flagKey: 'marketing_gate',
      entityId: 'user-123',
      enabled: true,
      reason: 'MATCH_EVALUATION',
      requestDurationMillis: 0.123,
      timestamp: '2024-03-25T20:44:58.462Z',
    });
  }),
  http.post('http://localhost:8080/evaluate/v1/variant', () => {
    return HttpResponse.json({
      flagKey: 'user_theme',
      entityId: 'user-123',
      match: true,
      reason: 'MATCH_EVALUATION',
      variantKey: 'dark',
      variantAttachment: '{"style":"modern"}',
      requestDurationMillis: 0.123,
      timestamp: '2024-03-25T20:44:58.462Z',
    });
  }),
];

const server = setupServer(...restHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe('flag integration', () => {
  const adapter = createFliptAdapter({
    url: 'http://localhost:8080',
    namespace: 'default',
    authentication: {
      clientToken: 'test-token',
    },
  });

  const identify = dedupe(async () => {
    return {
      id: 'user-123',
      email: 'user@example.com',
    };
  });

  describe('boolean flags', () => {
    const marketingGate = flag<boolean>({
      key: 'marketing_gate',
      identify,
      adapter: adapter.boolean((result) => result.enabled),
    });

    it('should evaluate boolean flag', async () => {
      const result = await marketingGate();
      expect(result).toBe(true);
    });
  });

  describe('variant flags', () => {
    const userTheme = flag<{ theme: string; style: string }>({
      key: 'user_theme',
      identify,
      adapter: adapter.variant((result) => ({
        theme: result.variantKey,
        style: result.attachment ? JSON.parse(result.attachment).style : 'default',
      })),
    });

    it('should evaluate variant flag', async () => {
      const result = await userTheme();
      expect(result).toEqual({
        theme: 'dark',
        style: 'modern',
      });
    });
  });
}); 