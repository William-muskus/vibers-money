import { getOrCreateFounderSessionId } from './session-id';

// Use same-origin proxy to avoid CORS (EventSource blocks cross-origin in some browsers)
const ORCHESTRATOR_API = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL
  ? `${process.env.NEXT_PUBLIC_ORCHESTRATOR_URL}/api`
  : '/api/orchestrator';

/** Normalize so agent keys are always businessId--role (no leading/trailing dashes, no double-dash from slug). */
export function normalizeBusinessId(id: string): string {
  return id.replace(/^-+|-+$/g, '').replace(/-+/g, '-');
}

function founderHeaders(): Record<string, string> {
  const id = getOrCreateFounderSessionId();
  return id ? { 'X-Founder-Session-Id': id } : {};
}

export async function createBusiness(name: string, founderPrompt?: string): Promise<{ businessId: string; agentKey: string }> {
  const slug = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const businessId = normalizeBusinessId(slug || `business-${Date.now()}`);
  const res = await fetch(`${ORCHESTRATOR_API}/business/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...founderHeaders() },
    body: JSON.stringify({
      business_id: businessId,
      name,
      founder_prompt: founderPrompt || name,
      founder_session_id: getOrCreateFounderSessionId(),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || 'Failed to create business');
  }
  return res.json();
}

export async function sendMessage(businessId: string, content: string): Promise<void> {
  const id = normalizeBusinessId(businessId);
  const res = await fetch(`${ORCHESTRATOR_API}/business/${id}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...founderHeaders() },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || 'Failed to send message');
  }
}

export function businessStreamUrl(businessId: string): string {
  const id = normalizeBusinessId(businessId);
  const base = `${ORCHESTRATOR_API}/business/${id}/stream`;
  const sessionId = getOrCreateFounderSessionId();
  return sessionId ? `${base}?session_id=${encodeURIComponent(sessionId)}` : base;
}

/** CEO-only stream for founder chat (no other agents). */
export function ceoStreamUrl(businessId: string): string {
  const id = normalizeBusinessId(businessId);
  const base = `${ORCHESTRATOR_API}/agents/${id}--ceo/stream`;
  const sessionId = getOrCreateFounderSessionId();
  return sessionId ? `${base}?session_id=${encodeURIComponent(sessionId)}` : base;
}

export async function getBusinessStatus(businessId: string): Promise<{ paused: boolean }> {
  const id = normalizeBusinessId(businessId);
  const res = await fetch(`${ORCHESTRATOR_API}/business/${id}/status`, { headers: founderHeaders() });
  if (!res.ok) return { paused: false };
  return res.json();
}

export async function pauseBusiness(businessId: string): Promise<void> {
  const id = normalizeBusinessId(businessId);
  const res = await fetch(`${ORCHESTRATOR_API}/business/${id}/pause`, { method: 'POST', headers: founderHeaders() });
  if (!res.ok) throw new Error('Failed to pause');
}

export async function resumeBusiness(businessId: string): Promise<void> {
  const id = normalizeBusinessId(businessId);
  const res = await fetch(`${ORCHESTRATOR_API}/business/${id}/resume`, { method: 'POST', headers: founderHeaders() });
  if (!res.ok) throw new Error('Failed to resume');
}

const CAN_ACCESS_TIMEOUT_MS = 8000;

export async function canAccessBusinessFromBackend(businessId: string): Promise<boolean> {
  const sessionId = getOrCreateFounderSessionId();
  if (!sessionId) return false;
  const q = new URLSearchParams({ session_id: sessionId });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CAN_ACCESS_TIMEOUT_MS);
  try {
    const id = normalizeBusinessId(businessId);
    const res = await fetch(`${ORCHESTRATOR_API}/business/${id}/can-access?${q}`, {
      headers: founderHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return false;
    const data = (await res.json()) as { allowed?: boolean };
    return data.allowed === true;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

/** Create Stripe checkout session for funding a business; redirect to returned url. */
export async function createCheckoutSession(businessId: string, options?: { amount_cents?: number }): Promise<{ url: string | null }> {
  const id = normalizeBusinessId(businessId);
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: id,
      founder_session_id: getOrCreateFounderSessionId(),
      amount_cents: options?.amount_cents ?? 499,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || 'Failed to create checkout');
  }
  const data = (await res.json()) as { url?: string | null };
  return { url: data.url ?? null };
}
