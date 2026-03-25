/**
 * Load monorepo root `.env` so `CDP_*` and `COMPUTER_USE_*` apply when cwd is `packages/computer-use-mcp`.
 * Must be imported before any module that reads those env vars.
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
config({ path: path.join(repoRoot, '.env') });
