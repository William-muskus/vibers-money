/**
 * Structured logger for Computer Use MCP. Set LOG_LEVEL=debug for verbose output.
 */
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
const level = (LEVELS[process.env.LOG_LEVEL as keyof typeof LEVELS] ?? LEVELS.info) as number;

function log(lvl: keyof typeof LEVELS, msg: string, data?: Record<string, unknown>): void {
  if (LEVELS[lvl] < level) return;
  const ts = new Date().toISOString();
  const payload = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${ts}] [computer-use] [${lvl.toUpperCase()}] ${msg}${payload}`);
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => log('debug', msg, data),
  info: (msg: string, data?: Record<string, unknown>) => log('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log('error', msg, data),
};
