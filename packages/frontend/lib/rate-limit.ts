/**
 * Rate limiter: max N requests per second (sliding window).
 * Acquire() returns a Promise that resolves when a slot is available.
 * Use before each request so we stay under the limit and avoid 429/timeouts.
 */

const MAX_PER_SECOND = 6;
const WINDOW_MS = 1000;

const timestamps: number[] = [];

function prune(now: number): void {
  const cutoff = now - WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until we have capacity for one more request (≤ MAX_PER_SECOND in the last second). */
export function acquire(): Promise<void> {
  return new Promise((resolve) => {
    function run() {
      const now = Date.now();
      prune(now);
      if (timestamps.length < MAX_PER_SECOND) {
        timestamps.push(now);
        resolve();
        return;
      }
      const waitMs = Math.max(50, timestamps[0] + WINDOW_MS - now);
      setTimeout(run, waitMs);
    }
    run();
  });
}

/** Delays for retries (after timeout/429/5xx). Each attempt still goes through acquire(). */
export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
export const MAX_RETRIES = 3;

export type FetchWithRetryOptions = {
  timeoutMs: number;
  retries?: number;
  retryDelaysMs?: number[];
};

function isRetryable(res: Response | null, err: unknown): boolean {
  if (err && (err as Error).name === 'AbortError') return true; // timeout
  if (res) {
    if (res.status === 429) return true;
    if (res.status >= 500 && res.status < 600) return true;
  }
  return false;
}

/**
 * Fetch with rate limit + timeout + retry.
 * Acquires a rate-limit slot before each attempt; on timeout/429/5xx retries after a delay (also rate-limited).
 */
export async function fetchWithRateLimitAndRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions,
): Promise<Response> {
  const { timeoutMs, retries = MAX_RETRIES, retryDelaysMs = RETRY_DELAYS_MS } = options;
  let lastRes: Response | null = null;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delay = retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)] ?? 2000;
      await sleep(delay);
    }
    await acquire();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const signal = controller.signal;

    try {
      const res = await fetch(url, { ...init, signal });
      clearTimeout(timeoutId);
      lastRes = res;
      lastErr = null;

      if (!isRetryable(res, null) || attempt === retries) {
        return res;
      }
    } catch (e) {
      clearTimeout(timeoutId);
      lastErr = e;
      lastRes = null;
      if (!isRetryable(null, e) || attempt === retries) {
        throw e;
      }
    }
  }

  if (lastErr) throw lastErr;
  return lastRes!;
}
