/**
 * Request identity from X-Agent-Id and X-Business-Id headers.
 * Set in HTTP handler, read in MCP tool handlers.
 */
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestIdentity {
  /** Role (e.g. "ceo", "marketing-director") from X-Agent-Id */
  role: string;
  /** Business ID from X-Business-Id */
  businessId: string;
  /** Full agent_id = businessId--role */
  agentId: string;
}

export const requestIdentity = new AsyncLocalStorage<RequestIdentity>();

export function getIdentity(): RequestIdentity {
  const id = requestIdentity.getStore();
  if (!id) throw new Error('Missing X-Agent-Id or X-Business-Id headers');
  return id;
}

export function fromHeaders(headers: Record<string, string | string[] | undefined>): RequestIdentity | null {
  const role = headers['x-agent-id'];
  const businessId = headers['x-business-id'];
  const r = typeof role === 'string' ? role : undefined;
  const b = typeof businessId === 'string' ? businessId : undefined;
  if (!r || !b) return null;
  return { role: r, businessId: b, agentId: `${b}--${r}` };
}
