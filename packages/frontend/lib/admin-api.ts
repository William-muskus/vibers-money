import { acquire } from './rate-limit';
import { getOrCreateFounderSessionId } from './session-id';

function founderHeaders(): Record<string, string> {
  const id = typeof window === 'undefined' ? '' : getOrCreateFounderSessionId();
  return id ? { 'X-Founder-Session-Id': id } : {};
}

/**
 * Browser must use same-origin `/api/orchestrator` so SSE goes through the Next proxy (founder auth).
 * Direct `NEXT_PUBLIC_ORCHESTRATOR_URL` skips the proxy → mosaic worked while chat 401'd.
 */
function orchestratorApiBase(): string {
  if (typeof window !== 'undefined') return '/api/orchestrator';
  const base = process.env.ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL;
  return base ? `${base.replace(/\/$/, '')}/api` : '/api/orchestrator';
}

export async function getAdminStats(): Promise<{ businessCount: number; agentCount: number }> {
  await acquire();
  const res = await fetch(`${orchestratorApiBase()}/admin/stats`);
  if (!res.ok) throw new Error('Failed to fetch admin stats');
  return res.json();
}

export async function getAdminAgents(): Promise<{ agents: string[] }> {
  await acquire();
  const res = await fetch(`${orchestratorApiBase()}/admin/agents`);
  if (!res.ok) throw new Error('Failed to fetch agents');
  return res.json();
}

/** Mosaic: orchestrator + Swarm Bus graph (all agents for this business). */
export async function getBusinessAgentKeys(businessId: string): Promise<{ agents: string[] }> {
  await acquire();
  const res = await fetch(`${orchestratorApiBase()}/business/${encodeURIComponent(businessId)}/agent-keys`, {
    headers: { ...founderHeaders() },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch business agent keys');
  return res.json();
}

export async function getAdminBusinesses(): Promise<{ businessIds: string[] }> {
  await acquire();
  const res = await fetch(`${orchestratorApiBase()}/admin/businesses`);
  if (!res.ok) throw new Error('Failed to fetch businesses');
  return res.json();
}

export function adminStreamUrl(): string {
  return `${orchestratorApiBase()}/admin/stream`;
}

export function agentStreamUrl(agentKey: string): string {
  return `${orchestratorApiBase()}/agents/${agentKey}/stream`;
}
