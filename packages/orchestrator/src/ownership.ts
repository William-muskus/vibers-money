/**
 * In-memory map of businessId -> founder_session_id for access control.
 * Normalize keys so "dog-meme-newsletter" and "dog-meme-newsletter-" resolve to the same founder.
 */
function normalizeBusinessId(id: string): string {
  return id.replace(/^-+|-+$/g, '').replace(/-+/g, '-');
}

const businessFounder = new Map<string, string>();

export function setBusinessFounder(businessId: string, founderSessionId: string): void {
  businessFounder.set(normalizeBusinessId(businessId), founderSessionId);
}

export function getBusinessFounder(businessId: string): string | undefined {
  const n = normalizeBusinessId(businessId);
  const exact = businessFounder.get(n);
  if (exact !== undefined) return exact;
  if (n === businessId) return undefined;
  return businessFounder.get(businessId);
}

/** Find founder by normalized id (e.g. stored as "dog-meme-newsletter-" still matches "dog-meme-newsletter"). */
export function getBusinessFounderNormalized(businessId: string): string | undefined {
  const n = normalizeBusinessId(businessId);
  const exact = businessFounder.get(n);
  if (exact !== undefined) return exact;
  for (const [key, sessionId] of businessFounder) {
    if (normalizeBusinessId(key) === n) return sessionId;
  }
  return undefined;
}

export function canAccess(businessId: string, sessionId: string): boolean {
  const founder = getBusinessFounderNormalized(businessId);
  return founder !== undefined && founder === sessionId;
}

/** Only for tests: clear all state. */
export function clearForTesting(): void {
  businessFounder.clear();
}
