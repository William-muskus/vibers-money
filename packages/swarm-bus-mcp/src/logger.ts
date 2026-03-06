/**
 * Structured logger for Swarm Bus. Set LOG_LEVEL=debug for verbose output.
 * Set LOG_JSON=1 for one-JSON-object-per-line output (for log shippers).
 */
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
const level = (LEVELS[process.env.LOG_LEVEL as keyof typeof LEVELS] ?? LEVELS.info) as number;
const jsonMode = process.env.LOG_JSON === '1' || process.env.LOG_JSON === 'true';

function log(lvl: keyof typeof LEVELS, msg: string, data?: Record<string, unknown>): void {
  if (LEVELS[lvl] < level) return;
  const ts = new Date().toISOString();
  if (jsonMode) {
    console.log(JSON.stringify({ ts, level: lvl, service: 'swarm-bus', message: msg, ...data }));
  } else {
    const payload = data ? ` ${JSON.stringify(data)}` : '';
    console.log(`[${ts}] [swarm-bus] [${lvl.toUpperCase()}] ${msg}${payload}`);
  }
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => log('debug', msg, data),
  info: (msg: string, data?: Record<string, unknown>) => log('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log('error', msg, data),
};
