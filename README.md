# Vercel Flags Adapter for Flipt

A Vercel Flags adapter for [Flipt](https://flipt.io).

## Installation

```bash
npm install @flipt-io/vercel-adapter
```

## Prerequisites

- A Flipt instance ([self-hosted](https://docs.flipt.io/installation/overview) or [Flipt Cloud](https://docs.flipt.io/cloud/overview))
- A Vercel project

## Usage

### Basic Setup

```typescript
import { createFliptAdapter } from '@flipt-io/vercel-adapter';

const adapter = createFliptAdapter({
  url: process.env.FLIPT_URL,
  namespace: process.env.FLIPT_NAMESPACE,
});
```

### Flipt Cloud Setup

```typescript
import { createFliptAdapter } from '@flipt-io/vercel-adapter';

const adapter = createFliptAdapter({
  url: process.env.FLIPT_URL, // Your Flipt Cloud instance URL (e.g. https://{your-flipt-cloud-instance}.flipt.cloud)
  namespace: process.env.FLIPT_NAMESPACE, // Optional, defaults to `default`
  authentication: {
    clientToken: process.env.FLIPT_CLIENT_TOKEN, // Your Flipt Cloud API key
  },
});
```

### Using with Vercel Flags

```typescript
import { flag, dedupe } from 'flags/next';
import { createFliptAdapter } from '@flipt-io/vercel-adapter';

const adapter = createFliptAdapter({
  url: process.env.FLIPT_URL,
  namespace: process.env.FLIPT_NAMESPACE,
  authentication: {
    clientToken: process.env.FLIPT_CLIENT_TOKEN ?? '',
  },
});

// Example identify function that gets the current user
const identify = dedupe(async () => {
  // In a real app, this would get the user from your auth system
  return {
    id: 'user-123',
    email: 'user@example.com',
  };
});

// Boolean flag example
export const marketingGate = flag<boolean>({
  key: 'marketing_gate',
  identify,
  adapter: adapter.boolean((result) => result.enabled),
});

// Variant flag example with custom type
interface ThemeConfig {
  theme: string;
  style: string;
}

export const userTheme = flag<ThemeConfig>({
  key: 'user_theme',
  identify,
  adapter: adapter.variant((result) => ({
    theme: result.variantKey,
    style: result.attachment ? JSON.parse(result.attachment).style : 'default',
  })),
});

// Using the flags in your application
async function example() {
  const isMarketingEnabled = await marketingGate();
  const theme = await userTheme();

  console.log('Marketing enabled:', isMarketingEnabled); // true/false
  console.log('User theme:', theme); // { theme: 'dark', style: 'modern' }
}
```

### Configuration

The adapter accepts the following configuration options:

- `url`: The URL of your Flipt instance (defaults to `http://localhost:8080`)
- `namespace`: The namespace to use for flag evaluation (defaults to `default`)
- `updateInterval`: The interval (in seconds) to check for flag changes (defaults to 5 seconds in development)
- `authentication`: Authentication configuration
  - `clientToken`: The client token to use for authentication

You can provide these options when creating the adapter, or they will be read from environment variables:

- `FLIPT_URL`
- `FLIPT_NAMESPACE`
- `FLIPT_CLIENT_TOKEN`

## Development

```bash
npm install
npm test
```

## License

MIT
