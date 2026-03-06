/**
 * Wake engine: debounced webhook when messages (or other events) arrive for an agent.
 */
import { getAgent } from './registry.js';

const pendingWakes = new Map<string, ReturnType<typeof setTimeout>>();
const WAKE_DEBOUNCE_MS = 500;

export function scheduleWake(agentId: string): void {
  if (pendingWakes.has(agentId)) return;
  const handle = setTimeout(async () => {
    pendingWakes.delete(agentId);
    const a = await getAgent(agentId);
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
