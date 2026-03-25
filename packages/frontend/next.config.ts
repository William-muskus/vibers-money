import type { NextConfig } from 'next';
import { loadEnvConfig } from '@next/env';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSentryConfig } from '@sentry/nextjs';

// Monorepo: Next only auto-loads env from packages/frontend; secrets live in repo-root .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvConfig(path.resolve(__dirname, '../..'));

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Do not rewrite /api/orchestrator/* to the raw orchestrator: App Router route handlers
  // must run first (auth + SSE proxy). A blanket rewrite can bypass them and break streaming.
};

export default process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
    })
  : nextConfig;
