/**
 * Maps agent roles to their preferred local model.
 * When LOCAL_LLM_API_BASE is set, the spawner uses this mapping
 * to assign role-specific models instead of one global model.
 *
 * Format: role -> { model: string, alias?: string, temperature?: number }
 * Falls back to LOCAL_LLM_MODEL env var if role not found.
 */

export interface RoleModelConfig {
  model: string;
  alias?: string;
  temperature?: number;
}

const DEFAULT_TEMPERATURE = 0.3;

const ROLE_MODEL_MAP: Record<string, RoleModelConfig> = {
  // === Tier 1: Strategic roles — need strongest reasoning ===
  ceo: { model: 'mistral:7b', temperature: 0.4 },
  'security-director': { model: 'mistral:7b', temperature: 0.2 },

  // === Tier 2: Technical/creative roles — moderate capability ===
  cto: { model: 'mistral:7b', temperature: 0.3 },
  'product-director': { model: 'mistral:7b', temperature: 0.3 },
  'marketing-director': { model: 'mistral:7b', temperature: 0.5 },
  'finance-director': { model: 'mistral:7b', temperature: 0.2 },

  // === Tier 3: Specialist/executor roles — can use smaller models ===
  'community-manager': { model: 'mistral:7b', temperature: 0.6 },
  copywriter: { model: 'mistral:7b', temperature: 0.7 },
};

export function getModelForRole(role: string): RoleModelConfig {
  const envModel = process.env.LOCAL_LLM_MODEL || 'mistral:7b';
  const mapped = ROLE_MODEL_MAP[role];
  if (mapped) return mapped;
  return { model: envModel, temperature: DEFAULT_TEMPERATURE };
}
