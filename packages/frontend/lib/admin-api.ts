const ORCHESTRATOR_API = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL
  ? `${process.env.NEXT_PUBLIC_ORCHESTRATOR_URL}/api`
  : '/api/orchestrator';

export async function getAdminStats(): Promise<{ businessCount: number; agentCount: number }> {
  const res = await fetch(`${ORCHESTRATOR_API}/admin/stats`);
  if (!res.ok) throw new Error('Failed to fetch admin stats');
  return res.json();
}

export async function getAdminAgents(): Promise<{ agents: string[] }> {
  const res = await fetch(`${ORCHESTRATOR_API}/admin/agents`);
  if (!res.ok) throw new Error('Failed to fetch agents');
  return res.json();
}

export async function getAdminBusinesses(): Promise<{ businessIds: string[] }> {
  const res = await fetch(`${ORCHESTRATOR_API}/admin/businesses`);
  if (!res.ok) throw new Error('Failed to fetch businesses');
  return res.json();
}

export function adminStreamUrl(): string {
  return `${ORCHESTRATOR_API}/admin/stream`;
}

export function agentStreamUrl(agentKey: string): string {
  return `${ORCHESTRATOR_API}/agents/${agentKey}/stream`;
}
