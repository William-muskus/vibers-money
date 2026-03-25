/**
 * Mosaic shows every agent for a business: merge orchestrator processes with Swarm Bus graph
 * (source of truth for org membership; names/slugs are not filtered).
 */
import { getAgentsByBusiness } from './registry.js';

const SWARM_BUS_URL = (process.env.SWARM_BUS_URL || 'http://localhost:3100').replace(/\/$/, '');

async function fetchSwarmGraphAgentIds(businessId: string): Promise<string[]> {
  try {
    const url = `${SWARM_BUS_URL}/api/graph?business_id=${encodeURIComponent(businessId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { nodes?: { id?: string }[] };
    return (data.nodes ?? [])
      .map((n) => n.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

/** Sorted unique agent keys (e.g. `biz--marketing-director`) for UI tiles. */
export async function getMergedAgentKeysForBusiness(businessId: string): Promise<string[]> {
  const id = businessId.trim();
  const local = getAgentsByBusiness(id).map((p) => p.key);
  const swarm = await fetchSwarmGraphAgentIds(id);
  const set = new Set<string>([...local, ...swarm]);
  return [...set].sort((a, b) => a.localeCompare(b));
}
