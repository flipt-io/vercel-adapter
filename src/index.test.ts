import { expect, it, describe } from 'vitest';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { HttpResponse, http } from 'msw';
import { createFliptAdapter } from '.';

const restHandlers = [
  http.post('http://localhost:8080/evaluate/v1/boolean', () => {
    return HttpResponse.json({
      flagKey: 'new-feature',
      entityId: 'user-123',
      enabled: true,
      reason: 'MATCH_EVALUATION',
      requestDurationMillis: 0.123,
      timestamp: '2024-03-25T20:44:58.462Z',
    });
  }),
  http.post('http://localhost:8080/evaluate/v1/variant', () => {
    return HttpResponse.json({
      flagKey: 'user-theme',
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

describe('createFliptAdapter', () => {
  const adapter = createFliptAdapter({
    url: 'http://localhost:8080',
    namespace: 'default',
    authentication: {
      clientToken: 'test-token',
    },
  });

  describe('boolean flags', () => {
    it('should evaluate boolean flag', async () => {
      const booleanAdapter = adapter.boolean((result) => result.enabled);

      const result = await booleanAdapter.decide({
        key: 'new-feature',
        entities: {
          id: 'user-123',
          email: 'user@example.com',
          country: 'US',
        },
        headers: {} as any,
        cookies: {} as any
      });

      expect(result).toBe(true);
    });

    it('should throw error when user is missing', async () => {
      const booleanAdapter = adapter.boolean((result) => result.enabled);

      await expect(
        booleanAdapter.decide({
          key: 'new-feature',
          headers: {} as any,
          cookies: {} as any
        })
      ).rejects.toThrow('vercel-flipt-sdk: Invalid or missing user from identify');
    });

    it('should throw error when user has no id', async () => {
      const booleanAdapter = adapter.boolean((result) => result.enabled);

      await expect(
        booleanAdapter.decide({
          key: 'new-feature',
          entities: {
            email: 'user@example.com',
          } as any,
          headers: {} as any,
          cookies: {} as any
        })
      ).rejects.toThrow('vercel-flipt-sdk: Invalid or missing user from identify');
    });
  });

  describe('variant flags', () => {
    it('should evaluate variant flag', async () => {
      const variantAdapter = adapter.variant((result) => ({
        theme: result.variantKey,
        style: result.attachment ? JSON.parse(result.attachment).style : undefined,
      }));

      const result = await variantAdapter.decide({
        key: 'user-theme',
        entities: {
          id: 'user-123',
          email: 'user@example.com',
          country: 'US',
        },
        headers: {} as any,
        cookies: {} as any
      });

      expect(result).toEqual({
        theme: 'dark',
        style: 'modern',
      });
    });

    it('should throw error when user is missing', async () => {
      const variantAdapter = adapter.variant((result) => result.variantKey);

      await expect(
        variantAdapter.decide({
          key: 'user-theme',
          headers: {} as any,
          cookies: {} as any
        })
      ).rejects.toThrow('vercel-flipt-sdk: Invalid or missing user from identify');
    });

    it('should handle missing variant attachment', async () => {
      server.use(
        http.post('http://localhost:8080/evaluate/v1/variant', () => {
          return HttpResponse.json({
            flagKey: 'user-theme',
            entityId: 'user-123',
            match: true,
            reason: 'MATCH_EVALUATION',
            variantKey: 'dark',
            requestDurationMillis: 0.123,
            timestamp: '2024-03-25T20:44:58.462Z',
          });
        })
      );

      const variantAdapter = adapter.variant((result) => ({
        theme: result.variantKey,
        style: result.attachment ? JSON.parse(result.attachment).style : 'default',
      }));

      const result = await variantAdapter.decide({
        key: 'user-theme',
        entities: {
          id: 'user-123',
          email: 'user@example.com',
        },
        headers: {} as any,
        cookies: {} as any
      });

      expect(result).toEqual({
        theme: 'dark',
        style: 'default',
      });
    });
  });

  describe('initialization', () => {
    it('should initialize with environment variables', async () => {
      process.env.FLIPT_URL = 'http://localhost:8080';
      process.env.FLIPT_NAMESPACE = 'test';
      process.env.FLIPT_CLIENT_TOKEN = 'env-token';

      const envAdapter = createFliptAdapter();
      await expect(envAdapter.initialize()).resolves.toBeDefined();

      // Clean up
      delete process.env.FLIPT_URL;
      delete process.env.FLIPT_NAMESPACE;
      delete process.env.FLIPT_CLIENT_TOKEN;
    });

    it('should initialize with provided config', async () => {
      const configAdapter = createFliptAdapter({
        url: 'http://localhost:8080',
        namespace: 'test',
        authentication: {
          clientToken: 'test-token',
        },
      });

      await expect(configAdapter.initialize()).resolves.toBeDefined();
    });

    it('should reuse existing client', async () => {
      const client1 = await adapter.initialize();
      const client2 = await adapter.initialize();

      expect(client1).toBe(client2);
    });
  });
}); 