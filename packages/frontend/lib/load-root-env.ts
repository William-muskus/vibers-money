/**
 * Load repo-root `.env` into `process.env`. Next.js only auto-loads env from `packages/frontend/`.
 * Call from Node-only entrypoints (API routes, instrumentation) — not from Edge middleware.
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let loaded = false;

export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // lib/ -> frontend/ -> packages/ -> repo root
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  config({ path: path.join(repoRoot, '.env') });
}
