import { FliptClient } from '@flipt-io/flipt-client-js';

import type { Adapter, FlagDefinitionsType, ProviderData } from 'flags';

interface FliptFlag {
  key: string;
  enabled: boolean;
  type: 'BOOLEAN_FLAG_TYPE' | 'VARIANT_FLAG_TYPE';
  description?: string;
}

export interface FliptConfig {
  url?: string;
  namespace?: string;
  authentication?: {
    clientToken: string;
  };
  updateInterval?: number;
}

export type EvaluationContext = {
  id: string;
  [key: string]: unknown;
};

type AdapterFunction<O> = <T>(
  getValue: (obj: O) => T,
  opts?: object | undefined,
) => Adapter<T, EvaluationContext>;

export type AdapterResponse = {
  boolean: AdapterFunction<{ enabled: boolean }>;
  variant: AdapterFunction<{ variantKey: string; attachment?: string }>;
  initialize: () => Promise<FliptClient>;
};

let client: FliptClient | null = null;

const initialize = async (options?: FliptConfig): Promise<FliptClient> => {
  if (client) {
    await client.refresh();
    return client;
  }

  const config = {
    url: options?.url ?? process.env.FLIPT_URL ?? 'http://localhost:8080',
    namespace: options?.namespace ?? process.env.FLIPT_NAMESPACE ?? 'default',
    authentication: options?.authentication ?? {
      clientToken: process.env.FLIPT_CLIENT_TOKEN ?? '',
    },
    updateInterval:
      options?.updateInterval ?? (process.env.NODE_ENV === 'development' ? 5 : undefined), // 5 seconds in development if not set
  };

  // set global client for reuse
  client = await FliptClient.init({ ...config });
  return client;
};

const isFliptContext = (context: unknown): context is EvaluationContext => {
  return context != null && typeof context === 'object' && 'id' in context;
};

async function predecide(context?: EvaluationContext): Promise<EvaluationContext> {
  if (!isFliptContext(context)) {
    throw new Error(
      'vercel-flipt-adapter: Invalid or missing context from identify. See https://flags-sdk.dev/concepts/identify',
    );
  }
  return await Promise.resolve(context);
}

export function createFliptAdapter(options?: FliptConfig): AdapterResponse {
  async function getClient(): Promise<FliptClient> {
    return initialize(options);
  }

  function boolean<T>(
    getValue: (result: { enabled: boolean }) => T,
    _opts?: object | undefined,
  ): Adapter<T, EvaluationContext> {
    return {
      decide: async ({ key, entities }: { key: string; entities?: EvaluationContext }) => {
        const context = await predecide(entities);
        const client = await getClient();
        const result = client.evaluateBoolean({
          flagKey: key,
          entityId: context.id,
          context: transformContext(context),
        });
        return getValue(result);
      },
    };
  }

  function variant<T>(
    getValue: (result: { variantKey: string; attachment?: string }) => T,
    _opts?: object | undefined,
  ): Adapter<T, EvaluationContext> {
    return {
      decide: async ({ key, entities }: { key: string; entities?: EvaluationContext }) => {
        const context = await predecide(entities);
        const client = await getClient();
        const result = client.evaluateVariant({
          flagKey: key,
          entityId: context.id,
          context: transformContext(context),
        });
        return getValue({
          variantKey: result.variantKey,
          attachment: result.variantAttachment ?? undefined,
        });
      },
    };
  }

  return {
    boolean,
    variant,
    initialize: () => getClient(),
  };
}

function transformContext(context: EvaluationContext): Record<string, string> {
  const transformedContext: Record<string, string> = {};

  Object.entries(context).forEach(([key, value]) => {
    if (key !== 'id') {
      transformedContext[key] = String(value);
    }
  });

  return transformedContext;
}

export const fliptAdapter = createFliptAdapter();

// For testing purposes only
export function __resetClientForTesting(): void {
  client = null;
}

export async function getProviderData(options?: FliptConfig): Promise<ProviderData> {
  const hints: Exclude<ProviderData['hints'], undefined> = [];

  if (hints.length > 0) {
    return { definitions: {}, hints };
  }

  try {
    const client = await initialize(options);
    const namespace = options?.namespace ?? 'default';
    const flags = client.listFlags() as FliptFlag[];
    const baseUrl = (options?.url ?? process.env.FLIPT_URL ?? 'http://localhost:8080').replace(
      /\/+$/,
      '',
    );

    return {
      definitions: flags.reduce<FlagDefinitionsType>((acc, flag) => {
        const options =
          flag.type === 'BOOLEAN_FLAG_TYPE'
            ? [
                { value: true, label: 'Enabled' },
                { value: false, label: 'Disabled' },
              ]
            : []; // TODO: return variant options once they are returned by Flipt SDK

        acc[flag.key] = {
          description: flag.description,
          origin: `${baseUrl}/#/namespaces/${namespace}/flags/${flag.key}`,
          options,
        };
        return acc;
      }, {}),
      hints,
    };
  } catch (e) {
    return {
      definitions: {},
      hints: [
        {
          key: 'flipt/failed-to-fetch',
          text: `Failed to fetch Flipt flags: ${(e as Error).message}`,
        },
      ],
    };
  }
}
