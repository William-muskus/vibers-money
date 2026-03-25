/**
 * Runs once on Node server startup. Loads monorepo root `.env` so `AUTH_SECRET` etc. exist
 * before any route or RSC runs (Next only auto-loads env from `packages/frontend/`).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { loadRootEnv } = await import('./lib/load-root-env');
    loadRootEnv();
  }
}
