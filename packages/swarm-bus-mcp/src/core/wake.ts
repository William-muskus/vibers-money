/**
 * Wake engine: debounced webhook when messages (or other events) arrive for an agent.
 * Before POSTing the wake URL, asks the orchestrator whether the agent is mid–Vibe cycle;
 * if so, skips the POST and retries later (no prompt spam — root fix at the wake source).
 *
 * Scope (all use the same `attemptWake` path):
 * - **CEO** — included whenever the bus schedules a wake (e.g. team messages). Same GET /cycle gate + retry.
 * - **Operational roles** (e.g. community manager, growth engineer): `infinite_loop`, may receive wakes from
 *   **inbox events** and from **scheduled rules** (`scheduleWake` from scheduling) — both respect busy-or-retry.
 * - **Task-based specialists** (spawned by department managers): `lifecycle: task_based`; they only become
 *   runnable again via **external** bus events (messages from others, escalations, inject, etc.), not from an
 *   internal “always-on” idle loop inside the specialist. Wakes for them are still message/event-driven here;
 *   they are not a separate code path — the distinction is **who** calls `scheduleWake`, not a different
 *   retry policy.
 */
import { getAgent } from './registry.js';
import { logger } from '../logger.js';

const pendingWakes = new Map<string, ReturnType<typeof setTimeout>>();
const WAKE_DEBOUNCE_MS = 500;
/** When orchestrator reports agent busy, retry after this delay (ms). Default 30s — long tasks should not spam GETs. */
const WAKE_BUSY_RETRY_MS = Number(process.env.WAKE_BUSY_RETRY_MS) || 30_000;

/** Derive GET …/cycle from POST …/wake (same host and agent key). */
export function wakeEndpointToCycleUrl(wakeEndpoint: string): string {
  return wakeEndpoint.replace(/\/wake\/?$/, '/cycle');
}

async function isOrchestratorAgentBusy(wakeEndpoint: string): Promise<boolean> {
  const url = wakeEndpointToCycleUrl(wakeEndpoint);
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
    if (res.status === 404) return false;
    if (!res.ok) return false;
    const j = (await res.json()) as { running?: boolean };
    return j.running === true;
  } catch {
    return false;
  }
}

async function attemptWake(agentId: string): Promise<void> {
  const a = await getAgent(agentId);
  if (!a?.wake_endpoint) return;

  const busy = await isOrchestratorAgentBusy(a.wake_endpoint);
  if (busy) {
    logger.info('wake_skipped_orchestrator_busy', { agentId, retryMs: WAKE_BUSY_RETRY_MS });
    setTimeout(() => {
      void attemptWake(agentId);
    }, WAKE_BUSY_RETRY_MS);
    return;
  }

  try {
    await fetch(a.wake_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(a.wake_payload ?? {}),
    });
  } catch (err) {
    logger.error('wake_webhook_failed', { agentId, error: String((err as Error).message) });
  }
}

export function scheduleWake(agentId: string): void {
  if (pendingWakes.has(agentId)) return;
  const handle = setTimeout(() => {
    pendingWakes.delete(agentId);
    void attemptWake(agentId);
  }, WAKE_DEBOUNCE_MS);
  pendingWakes.set(agentId, handle);
}
