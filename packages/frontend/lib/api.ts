// Use same-origin proxy to avoid CORS (EventSource blocks cross-origin in some browsers)
const ORCHESTRATOR_API = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL
  ? `${process.env.NEXT_PUBLIC_ORCHESTRATOR_URL}/api`
  : '/api/orchestrator';

export async function createBusiness(name: string, founderPrompt?: string): Promise<{ businessId: string; agentKey: string }> {
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const businessId = slug || `business-${Date.now()}`;
  const res = await fetch(`${ORCHESTRATOR_API}/business/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: businessId,
      name,
      founder_prompt: founderPrompt || name,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || 'Failed to create business');
  }
  return res.json();
}

export async function sendMessage(businessId: string, content: string): Promise<void> {
  const res = await fetch(`${ORCHESTRATOR_API}/business/${businessId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || 'Failed to send message');
  }
}

export function businessStreamUrl(businessId: string): string {
  return `${ORCHESTRATOR_API}/business/${businessId}/stream`;
}
