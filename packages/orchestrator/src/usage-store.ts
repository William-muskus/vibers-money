/**
 * Per-business API/token usage for cost management. In-memory for now; can be backed by Redis (P1-1).
 * When using cloud inference (Mistral/Bedrock), call recordUsage from a layer that sees token counts.
 */

const usageByBusiness = new Map<string, { tokensUsed: number; lastUpdated: string }>();

export function recordUsage(businessId: string, tokensDelta: number): void {
  const key = businessId.trim();
  const cur = usageByBusiness.get(key) ?? { tokensUsed: 0, lastUpdated: new Date().toISOString() };
  cur.tokensUsed += tokensDelta;
  cur.lastUpdated = new Date().toISOString();
  usageByBusiness.set(key, cur);
}

export function getUsage(businessId: string): { tokensUsed: number; lastUpdated: string } {
  const key = businessId.trim();
  const cur = usageByBusiness.get(key);
  return cur ?? { tokensUsed: 0, lastUpdated: new Date().toISOString() };
}

export function getAllUsage(): Record<string, { tokensUsed: number; lastUpdated: string }> {
  const out: Record<string, { tokensUsed: number; lastUpdated: string }> = {};
  for (const [k, v] of usageByBusiness) {
    out[k] = { ...v };
  }
  return out;
}
