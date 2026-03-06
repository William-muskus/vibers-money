import { acquire, fetchWithRateLimitAndRetry } from './rate-limit';
import { getOrCreateFounderSessionId } from './session-id';

// Same-origin proxy: sends cookies and X-Founder-Session-Id (auth user id or anonymous session from cache).
const ORCHESTRATOR_API = '/api/orchestrator';

/** Seamless flow: anonymous session id from cache so app works without login until user funds via Stripe. */
function founderHeaders(): Record<string, string> {
  const id = typeof window === 'undefined' ? '' : getOrCreateFounderSessionId();
  return id ? { 'X-Founder-Session-Id': id } : {};
}

/**
 * Business slug is derived on the backend from the business idea (concept summary).
 * Seamless auth: no sign-up required; account is created/linked when user funds via Stripe (payer email).
 */

const CREATE_BUSINESS_TIMEOUT_MS = 90_000;
const SEND_MESSAGE_TIMEOUT_MS = 25_000;

export async function createBusiness(name: string, founderPrompt?: string): Promise<{ businessId: string; agentKey: string }> {
  try {
    const res = await fetchWithRateLimitAndRetry(
      `${ORCHESTRATOR_API}/business/create`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...founderHeaders() },
        body: JSON.stringify({
          name,
          founder_prompt: founderPrompt || name,
        }),
      },
      { timeoutMs: CREATE_BUSINESS_TIMEOUT_MS },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error || 'Failed to create business');
    }
    return res.json();
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('Request timed out after retries. Creating a business can take a minute — check that the orchestrator and Swarm Bus are running.');
    }
    throw e;
  }
}

export async function sendMessage(businessId: string, content: string): Promise<void> {
  const id = businessId.trim();
  try {
    const res = await fetchWithRateLimitAndRetry(
      `${ORCHESTRATOR_API}/business/${encodeURIComponent(id)}/message`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...founderHeaders() },
        body: JSON.stringify({ content }),
      },
      { timeoutMs: SEND_MESSAGE_TIMEOUT_MS },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error || 'Failed to send message');
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('Request timed out after retries. The service may be busy — try again in a moment.');
    }
    throw e;
  }
}

export function businessStreamUrl(businessId: string): string {
  const id = businessId.trim();
  const base = `${ORCHESTRATOR_API}/business/${encodeURIComponent(id)}/stream`;
  const sid = typeof window === 'undefined' ? '' : getOrCreateFounderSessionId();
  return sid ? `${base}?session_id=${encodeURIComponent(sid)}` : base;
}

/** CEO-only stream for founder chat (no other agents). */
export function ceoStreamUrl(businessId: string): string {
  const id = businessId.trim();
  const base = `${ORCHESTRATOR_API}/agents/${encodeURIComponent(id)}--ceo/stream`;
  const sid = typeof window === 'undefined' ? '' : getOrCreateFounderSessionId();
  return sid ? `${base}?session_id=${encodeURIComponent(sid)}` : base;
}

export async function getBusinessStatus(businessId: string): Promise<{ paused: boolean }> {
  await acquire();
  const id = businessId.trim();
  const res = await fetch(`${ORCHESTRATOR_API}/business/${encodeURIComponent(id)}/status`, { credentials: 'include', headers: founderHeaders() });
  if (!res.ok) return { paused: false };
  return res.json();
}

export async function pauseBusiness(businessId: string): Promise<void> {
  await acquire();
  const id = businessId.trim();
  const res = await fetch(`${ORCHESTRATOR_API}/business/${encodeURIComponent(id)}/pause`, { method: 'POST', credentials: 'include', headers: founderHeaders() });
  if (!res.ok) throw new Error('Failed to pause');
}

export async function resumeBusiness(businessId: string): Promise<void> {
  await acquire();
  const id = businessId.trim();
  const res = await fetch(`${ORCHESTRATOR_API}/business/${encodeURIComponent(id)}/resume`, { method: 'POST', credentials: 'include', headers: founderHeaders() });
  if (!res.ok) throw new Error('Failed to resume');
}

export type TreeEntry = { name: string; kind: 'dir' | 'file'; children?: TreeEntry[] };

export async function getBusinessTree(businessId: string): Promise<TreeEntry[]> {
  await acquire();
  const id = businessId.trim();
  const res = await fetch(`${ORCHESTRATOR_API}/business/${encodeURIComponent(id)}/tree`, { credentials: 'include', headers: founderHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || 'Failed to load tree');
  }
  const data = (await res.json()) as { tree?: TreeEntry[] };
  return data.tree ?? [];
}

const CAN_ACCESS_TIMEOUT_MS = 8000;

export async function canAccessBusinessFromBackend(businessId: string): Promise<boolean> {
  await acquire();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CAN_ACCESS_TIMEOUT_MS);
  try {
    const id = businessId.trim();
    const res = await fetch(`${ORCHESTRATOR_API}/business/${encodeURIComponent(id)}/can-access`, {
      credentials: 'include',
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

/** Get per-business API/token usage for cost dashboard. */
export async function getBusinessUsage(businessId: string): Promise<{ tokensUsed: number; lastUpdated: string | null }> {
  const id = businessId.trim();
  const res = await fetch(`${ORCHESTRATOR_API}/business/${encodeURIComponent(id)}/usage`, { credentials: 'include', headers: founderHeaders() });
  if (!res.ok) return { tokensUsed: 0, lastUpdated: null };
  return res.json();
}

/** Stripe Connect: get whether this business has payouts set up (their own Stripe Express account). */
export async function getStripeConnectStatus(businessId: string): Promise<{
  hasAccount: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}> {
  const id = businessId.trim();
  const res = await fetch(`/api/stripe/connect/status?business_id=${encodeURIComponent(id)}`, { credentials: 'include' });
  if (!res.ok) return { hasAccount: false, chargesEnabled: false, detailsSubmitted: false };
  return res.json();
}

/** Stripe Connect: get balance and recent transactions for a connected account. */
export async function getStripeConnectBalance(businessId: string): Promise<{
  available: number;
  pending: number;
  transactions: Array<{ id: string; amount: number; description: string; timestamp: string }>;
}> {
  const id = businessId.trim();
  const res = await fetch(`/api/stripe/connect/balance?business_id=${encodeURIComponent(id)}`, { credentials: 'include', headers: founderHeaders() });
  if (!res.ok) return { available: 0, pending: 0, transactions: [] };
  return res.json();
}

/** Stripe Connect: start onboarding (add bank/IBAN to receive payments). Returns URL to redirect user to Stripe. */
export async function startStripeConnectOnboarding(businessId: string): Promise<{ url: string }> {
  const id = businessId.trim();
  const res = await fetch('/api/stripe/connect/onboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...founderHeaders() },
    body: JSON.stringify({ business_id: id }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || 'Failed to start payout setup');
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error('No onboarding URL returned');
  return { url: data.url };
}

/** Create Stripe checkout session for funding a business; redirect to returned url. */
export async function createCheckoutSession(businessId: string, options?: { amount_cents?: number }): Promise<{ url: string | null }> {
  const id = businessId.trim();
  const sid = typeof window === 'undefined' ? '' : getOrCreateFounderSessionId();
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...founderHeaders() },
    body: JSON.stringify({
      business_id: id,
      amount_cents: options?.amount_cents ?? 499,
      ...(sid && { founder_session_id: sid }),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || 'Failed to create checkout');
  }
  const data = (await res.json()) as { url?: string | null };
  return { url: data.url ?? null };
}
