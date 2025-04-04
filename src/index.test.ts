import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { expect, it, describe, afterAll, afterEach, beforeAll } from 'vitest';

import { AdapterResponse, createFliptAdapter, __resetClientForTesting, getProviderData } from '.';

const defaultFlags = [
  {
    key: 'new-feature',
    name: 'new-feature',
    description: 'This is a new feature',
    enabled: true,
    type: 'BOOLEAN_FLAG_TYPE',
    createdAt: '2024-03-25T20:44:58.462Z',
    updatedAt: '2024-03-25T20:44:58.462Z',
    rules: [],
    rollouts: [],
  },
  {
    key: 'user-theme',
    name: 'user-theme',
    description: 'This is a user theme',
    enabled: true,
    type: 'VARIANT_FLAG_TYPE',
    createdAt: '2024-03-25T20:44:58.462Z',
    updatedAt: '2024-03-25T20:44:58.462Z',
    rules: [
      {
        id: 'test-rule-1',
        segments: [],
        rank: 1,
        segmentOperator: 'OR_SEGMENT_OPERATOR',
        distributions: [
          {
            id: 'dist-1',
            ruleId: 'test-rule-1',
            variantId: 'variant-1',
            variantKey: 'dark',
            variantAttachment: '{"style":"modern"}',
            rollout: 100,
          },
        ],
      },
    ],
    rollouts: [],
    defaultVariant: {
      id: 'variant-1',
      key: 'dark',
      attachment: '{"style":"modern"}',
    },
  },
];

const testFlags = [
  {
    key: 'test-feature',
    name: 'test-feature',
    description: 'This is a test feature',
    enabled: true,
    type: 'BOOLEAN_FLAG_TYPE',
    createdAt: '2024-03-25T20:44:58.462Z',
    updatedAt: '2024-03-25T20:44:58.462Z',
    rules: [],
    rollouts: [],
  },
];

const restHandlers = [
  http.get(
    'http://localhost:8080/internal/v1/evaluation/snapshot/namespace/default',
    ({ request }) => {
      return HttpResponse.json({
        namespace: {
          key: 'default',
        },
        flags: defaultFlags,
        digest: 'test-digest-123',
      });
    },
  ),
  http.get(
    'http://localhost:8080/internal/v1/evaluation/snapshot/namespace/test',
    ({ request }) => {
      return HttpResponse.json({
        namespace: {
          key: 'test',
        },
        flags: testFlags,
        digest: 'test-digest-456',
      });
    },
  ),
];

const server = setupServer(...restHandlers);

let adapter: AdapterResponse | null = null;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

beforeEach(() => {
  adapter = createFliptAdapter({
    url: 'http://localhost:8080',
    namespace: 'default',
    authentication: {
      clientToken: 'test-token',
    },
  });
});

afterEach(() => {
  server.resetHandlers();
  adapter = null;
  __resetClientForTesting();
});

describe('createFliptAdapter', () => {
  describe('boolean flags', () => {
    it('should evaluate boolean flag', async () => {
      const booleanAdapter = adapter!.boolean((result) => result.enabled);

      const result = await booleanAdapter.decide({
        key: 'new-feature',
        entities: {
          id: 'user-123',
          email: 'user@example.com',
          country: 'US',
        },
        headers: {} as any,
        cookies: {} as any,
      });

      expect(result).toBe(true);
    });

    it('should throw error when context is missing', async () => {
      const booleanAdapter = adapter!.boolean((result) => result.enabled);

      await expect(
        booleanAdapter.decide({
          key: 'new-feature',
          headers: {} as any,
          cookies: {} as any,
        }),
      ).rejects.toThrow('vercel-flipt-adapter: Invalid or missing context from identify');
    });

    it('should throw error when context has no id', async () => {
      const booleanAdapter = adapter!.boolean((result) => result.enabled);

      await expect(
        booleanAdapter.decide({
          key: 'new-feature',
          entities: {
            email: 'user@example.com',
          } as any,
          headers: {} as any,
          cookies: {} as any,
        }),
      ).rejects.toThrow('vercel-flipt-adapter: Invalid or missing context from identify');
    });
  });

  describe('variant flags', () => {
    it('should evaluate variant flag', async () => {
      const variantAdapter = adapter!.variant((result) => ({
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
        cookies: {} as any,
      });

      expect(result).toEqual({
        theme: 'dark',
        style: 'modern',
      });
    });

    it('should throw error when context is missing', async () => {
      const variantAdapter = adapter!.variant((result) => result.variantKey);

      await expect(
        variantAdapter.decide({
          key: 'user-theme',
          headers: {} as any,
          cookies: {} as any,
        }),
      ).rejects.toThrow('vercel-flipt-adapter: Invalid or missing context from identify');
    });

    it('should handle missing variant attachment', async () => {
      // Override the handler before creating the adapter
      server.use(
        http.get('http://localhost:8080/internal/v1/evaluation/snapshot/namespace/default', () => {
          return HttpResponse.json({
            namespace: {
              key: 'default',
            },
            flags: [
              {
                key: 'user-theme',
                name: 'user-theme',
                description: '',
                enabled: true,
                type: 'VARIANT_FLAG_TYPE',
                createdAt: '2024-03-25T20:44:58.462Z',
                updatedAt: '2024-03-25T20:44:58.462Z',
                rules: [
                  {
                    id: 'test-rule-1',
                    segments: [],
                    rank: 1,
                    segmentOperator: 'OR_SEGMENT_OPERATOR',
                    distributions: [
                      {
                        id: 'dist-1',
                        ruleId: 'test-rule-1',
                        variantId: 'variant-1',
                        variantKey: 'dark',
                        variantAttachment: '',
                        rollout: 100,
                      },
                    ],
                  },
                ],
                rollouts: [],
                defaultVariant: {
                  id: 'variant-1',
                  key: 'dark',
                  attachment: '',
                },
              },
            ],
            digest: 'test-digest-789',
          });
        }),
      );

      // Create adapter after setting up the mock
      adapter = createFliptAdapter({
        url: 'http://localhost:8080',
        namespace: 'default',
        authentication: {
          clientToken: 'test-token',
        },
      });

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
        cookies: {} as any,
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
      const client1 = await adapter!.initialize();
      const client2 = await adapter!.initialize();

      expect(client1).toBe(client2);
    });
  });

  describe('getProviderData', () => {
    it('should return flag definitions', async () => {
      const data = await getProviderData({
        url: 'http://localhost:8080',
        namespace: 'default',
        authentication: {
          clientToken: 'test-token',
        },
      });

      expect(data.definitions).toEqual({
        'new-feature': {
          origin: 'http://localhost:8080/#/namespaces/default/flags/new-feature',
          description: 'This is a new feature',
          options: [
            { value: true, label: 'Enabled' },
            { value: false, label: 'Disabled' },
          ],
        },
        'user-theme': {
          origin: 'http://localhost:8080/#/namespaces/default/flags/user-theme',
          description: 'This is a user theme',
          options: [],
        },
      });
    });

    it('should return error hint when request fails', async () => {
      server.use(
        http.get('http://localhost:8080/internal/v1/evaluation/snapshot/namespace/default', () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const data = await getProviderData({
        url: 'http://localhost:8080',
        namespace: 'default',
        authentication: {
          clientToken: 'test-token',
        },
      });

      expect(data.hints).toContainEqual({
        key: 'flipt/failed-to-fetch',
        text: expect.stringContaining('Failed to fetch Flipt flags'),
      });
    });
  });
});
