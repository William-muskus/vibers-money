/**
 * Domain allowlist per agent. P0: allow all if not configured.
 */
import { logger } from '../logger.js';

const allowlistByAgent = new Map<string, string[]>();

export function setAllowlist(agentId: string, domains: string[]): void {
  allowlistByAgent.set(agentId, domains.map((d) => d.toLowerCase()));
  logger.debug('allowlist_set', { agentId, domains });
}

export function isAllowed(agentId: string, url: string): boolean {
  const list = allowlistByAgent.get(agentId);
  if (!list || list.length === 0) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const allowed = list.some((d) => host === d || host.endsWith('.' + d));
    if (!allowed) logger.warn('allowlist_denied', { agentId, url, host });
    return allowed;
  } catch {
    logger.warn('allowlist_parse_error', { agentId, url });
    return false;
  }
}
