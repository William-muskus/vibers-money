/**
 * Optional Sentry init for error tracking. Set SENTRY_DSN to enable.
 */
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  });
}

export function captureException(err: unknown, context?: Record<string, string>): void {
  if (!dsn) return;
  if (context) Sentry.setContext('extra', context);
  Sentry.captureException(err);
}
