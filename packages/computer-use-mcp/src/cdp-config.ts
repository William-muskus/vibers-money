/** CDP connection target (read after repo-root `.env` is loaded via `load-env.ts`). */
export const CDP_HOST = process.env.CDP_HOST || 'localhost';
export const CDP_PORT = Number(process.env.CDP_PORT) || 9222;
