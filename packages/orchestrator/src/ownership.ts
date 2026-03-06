/**
 * In-memory map of businessId -> founder_session_id for access control.
 */
const businessFounder = new Map<string, string>();

function key(businessId: string): string {
  return businessId.trim();
}

export function setBusinessFounder(businessId: string, founderSessionId: string): void {
  businessFounder.set(key(businessId), founderSessionId);
}

export function getBusinessFounder(businessId: string): string | undefined {
  return businessFounder.get(key(businessId));
}

export function getBusinessFounderNormalized(businessId: string): string | undefined {
  return businessFounder.get(key(businessId));
}

export function canAccess(businessId: string, sessionId: string): boolean {
  const founder = getBusinessFounderNormalized(businessId);
  return founder !== undefined && founder === sessionId;
}

/** Only for tests: clear all state. */
export function clearForTesting(): void {
  businessFounder.clear();
}
