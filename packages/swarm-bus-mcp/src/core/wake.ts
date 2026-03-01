/**
 * Wake engine: debounced webhook when messages (or other events) arrive for an agent.
 * Calls the agent's wake_endpoint so the orchestrator can unblock the agent (e.g. from
 * idle sleep). Works for both task_based and infinite_loop agents — the CEO (infinite_loop)
 * needs to be woken when department directors send reports so it checks its inbox promptly.
 */
import { getAgent } from './registry.js';

const pendingWakes = new Map<string, ReturnType<typeof setTimeout>>();
const WAKE_DEBOUNCE_MS = 500;

export function scheduleWake(agentId: string): void {
  const agent = getAgent(agentId);
  if (!agent?.wake_endpoint) return;
  if (pendingWakes.has(agentId)) return;

  const handle = setTimeout(async () => {
    pendingWakes.delete(agentId);
    const a = getAgent(agentId);
    if (!a?.wake_endpoint) return;

    try {
      await fetch(a.wake_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(a.wake_payload ?? {}),
      });
    } catch (err) {
      console.error(`[Swarm Bus] Wake webhook failed for ${agentId}:`, err);
    }
  }, WAKE_DEBOUNCE_MS);

  pendingWakes.set(agentId, handle);
}
