import type { Adapter } from 'flags';
import { FliptEvaluationClient } from '@flipt-io/flipt-client';
import type { FlagDefinitionsType, JsonValue, ProviderData } from 'flags';

interface FliptFlag {
  key: string;
  enabled: boolean;
  type: 'BOOLEAN_FLAG_TYPE' | 'VARIANT_FLAG_TYPE';
}

export interface FliptConfig {
  url?: string;
  namespace?: string;
  authentication?: {
    clientToken: string;
  };
}

type FliptUser = {
  id: string;
  [key: string]: unknown;
};

type AdapterFunction<O> = <T>(
  getValue: (obj: O) => T,
  opts?: { exposureLogging?: boolean }
) => Adapter<T, FliptUser>;

export type AdapterResponse = {
  boolean: AdapterFunction<{ enabled: boolean }>;
  variant: AdapterFunction<{ variantKey: string; attachment?: string }>;
  initialize: () => Promise<FliptEvaluationClient>;
};

let client: FliptEvaluationClient | null = null;

const initialize = async (options?: FliptConfig): Promise<FliptEvaluationClient> => {
  if (client) return client;

  const config = {
    url: options?.url ?? process.env.FLIPT_URL ?? 'http://localhost:8080',
    namespace: options?.namespace ?? process.env.FLIPT_NAMESPACE ?? 'default',
    authentication: options?.authentication ?? {
      clientToken: process.env.FLIPT_CLIENT_TOKEN ?? '',
    },
  };

  client = await FliptEvaluationClient.init(config.namespace, {
    url: config.url,
    authentication: config.authentication,
  });

  return client;
};

const isFliptUser = (user: unknown): user is FliptUser => {
  return user != null && typeof user === 'object' && 'id' in user;
};

async function predecide(user?: FliptUser): Promise<FliptUser> {
  if (!isFliptUser(user)) {
    throw new Error(
      'vercel-flipt-sdk: Invalid or missing user from identify. See https://flags-sdk.dev/concepts/identify',
    );
  }
  return user;
}

export function createFliptAdapter(options?: FliptConfig): AdapterResponse {
  async function getClient(): Promise<FliptEvaluationClient> {
    return initialize(options);
  }

  function boolean<T>(
    getValue: (result: { enabled: boolean }) => T,
    opts?: { exposureLogging?: boolean },
  ): Adapter<T, FliptUser> {
    return {
      decide: async ({ key, entities }: { key: string; entities?: FliptUser }) => {
        const user = await predecide(entities);
        const client = await getClient();
        const result = client.evaluateBoolean(
          key,
          user.id,
          transformContext(user)
        );
        return getValue(result);
      },
    };
  }

  function variant<T>(
    getValue: (result: { variantKey: string; attachment?: string }) => T,
    opts?: { exposureLogging?: boolean },
  ): Adapter<T, FliptUser> {
    return {
      decide: async ({ key, entities }: { key: string; entities?: FliptUser }) => {
        const user = await predecide(entities);
        const client = await getClient();
        const result = client.evaluateVariant(
          key,
          user.id,
          transformContext(user)
        );
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

function transformContext(user: FliptUser): Record<string, string> {
  const context: Record<string, string> = {};
  
  Object.entries(user).forEach(([key, value]) => {
    if (key !== 'id') {
      context[key] = String(value);
    }
  });

  return context;
}

export const fliptAdapter = createFliptAdapter();

// For testing purposes only
export function __resetClientForTesting() {
  client = null;
}

export async function getProviderData(options?: FliptConfig): Promise<ProviderData> {
  const hints: Exclude<ProviderData['hints'], undefined> = [];

  if (!options?.authentication?.clientToken && !process.env.FLIPT_CLIENT_TOKEN) {
    hints.push({
      key: 'flipt/missing-client-token',
      text: 'Missing Flipt Client Token',
    });
  }

  if (!options?.url && !process.env.FLIPT_URL) {
    hints.push({
      key: 'flipt/missing-url',
      text: 'Missing Flipt URL',
    });
  }

  if (hints.length > 0) {
    return { definitions: {}, hints };
  }

  try {
    const client = await initialize(options);
    const flags = (client.listFlags()) as FliptFlag[];

    return {
      definitions: flags.reduce<FlagDefinitionsType>((acc, flag) => {
        acc[flag.key] = {
          origin: `${options?.url ?? process.env.FLIPT_URL}/flags/${flag.key}`,
          options: [
              { value: true, label: 'Enabled' },
              { value: false, label: 'Disabled' }
            ],
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