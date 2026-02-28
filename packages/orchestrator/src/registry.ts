/**
 * In-memory registry of running AgentProcess by key and by business.
 * Spawner registers agents here when starting them.
 */
import type { AgentProcess } from './agent-process.js';
import { logger } from './logger.js';

const byKey = new Map<string, AgentProcess>();
const byBusiness = new Map<string, AgentProcess[]>();

export function registerAgent(process: AgentProcess): void {
  byKey.set(process.key, process);
  const list = byBusiness.get(process.businessId) ?? [];
  list.push(process);
  byBusiness.set(process.businessId, list);
  logger.info('registry_register', { key: process.key, businessId: process.businessId, totalAgents: byKey.size });
}

export function unregisterAgent(process: AgentProcess): void {
  byKey.delete(process.key);
  const list = byBusiness.get(process.businessId) ?? [];
  const idx = list.indexOf(process);
  if (idx !== -1) list.splice(idx, 1);
  if (list.length === 0) byBusiness.delete(process.businessId);
  logger.info('registry_unregister', { key: process.key, totalAgents: byKey.size });
}

export function getAgent(key: string): AgentProcess | undefined {
  return byKey.get(key);
}

export function getAgentsByBusiness(businessId: string): AgentProcess[] {
  return byBusiness.get(businessId) ?? [];
}

export function getAllAgents(): AgentProcess[] {
  return [...byKey.values()];
}

export function getBusinessIds(): string[] {
  return [...byBusiness.keys()];
}

/** Only for tests: clear all state. */
export function clearForTesting(): void {
  byKey.clear();
  byBusiness.clear();
}
