import type { NextConfig } from 'next';
import path from 'path';
import { config } from 'dotenv';
import { withSentryConfig } from '@sentry/nextjs';

// Load repo root .env so AUTH_SECRET (and other auth vars) are available when running from monorepo
config({ path: path.resolve(__dirname, '../../.env'), override: false });

const orchestratorUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      // Proxy orchestrator API to avoid CORS (EventSource blocked cross-origin in some browsers)
      { source: '/api/orchestrator/:path*', destination: `${orchestratorUrl}/api/:path*` },
    ];
  },
};

export default process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
    })
  : nextConfig;
