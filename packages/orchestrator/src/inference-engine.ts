/**
 * Inference engine config and health check for local LLM backends
 * (llama-cpp, Ollama, TensorRT, or generic OpenAI-compatible).
 */
import path from 'node:path';
import { logger } from './logger.js';

export type InferenceEngineType = 'llama-cpp' | 'ollama' | 'tensorrt' | 'generic';

export interface InferenceEngineConfig {
  type: InferenceEngineType;
  apiBase: string;
  healthEndpoint: string;
}

export interface InferenceHealthResult {
  healthy: boolean;
  available: string[];
  missing: string[];
}

/** llama-server often reports model ids with `.gguf`; LOCAL_LLM_MODEL is usually the file stem. */
function normalizeModelId(id: string): string {
  return id.replace(/\.gguf$/i, '').trim();
}

function isRequiredModelPresent(required: string, availableIds: string[]): boolean {
  const r = normalizeModelId(required);
  return availableIds.some((a) => normalizeModelId(a) === r);
}

/** Derive model id from MODEL_PATH (file stem) so it matches what the inference engine reports. */
function deriveModelIdFromModelPath(): string | undefined {
  const p = process.env.MODEL_PATH?.trim();
  if (!p) return undefined;
  const base = path.basename(p);
  return base.replace(/\.gguf$/i, '') || undefined;
}

/** Model id for local inference: LOCAL_LLM_MODEL, or derived from MODEL_PATH (file stem), or fallback. */
export function getLocalLlmModel(): string {
  return (
    process.env.LOCAL_LLM_MODEL?.trim() ||
    deriveModelIdFromModelPath() ||
    'mistral:7b'
  );
}

export function getInferenceConfig(): InferenceEngineConfig | null {
  const apiBase = process.env.LOCAL_LLM_API_BASE?.trim();
  if (!apiBase) return null;
  const type = (process.env.LOCAL_LLM_ENGINE?.trim() || 'llama-cpp') as InferenceEngineType;
  const base = apiBase.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
  return {
    type,
    apiBase,
    healthEndpoint: `${base}/health`,
  };
}

export async function checkInferenceHealth(
  config: InferenceEngineConfig,
  requiredModels: string[],
): Promise<InferenceHealthResult> {
  try {
    const res = await fetch(config.healthEndpoint);
    if (!res.ok)
      return { healthy: false, available: [], missing: requiredModels };
    const data = (await res.json()) as Record<string, unknown>;
    // llama-server returns { status: "ok", slots_idle, slots_processing }; Ollama/others may use ok or model_loaded
    const healthy =
      data?.ok !== false || data?.status === 'ok';
    let available: string[];
    let missing: string[];
    if (data?.model_loaded === true) {
      available = requiredModels.length > 0 ? [...requiredModels] : ['loaded'];
      missing = [];
    } else if (Array.isArray(data?.data)) {
      available = (data.data as { id?: string }[]).map((m) => m.id ?? '');
      missing = requiredModels.filter((m) => !isRequiredModelPresent(m, available));
    } else if (healthy && requiredModels.length > 0) {
      // llama-server health has no model list; optionally fetch /v1/models for logging (apiBase is .../v1)
      try {
        const modelsUrl = `${config.apiBase.replace(/\/$/, '')}/models`;
        const modelsRes = await fetch(modelsUrl);
        if (modelsRes.ok) {
          const modelsData = (await modelsRes.json()) as { data?: { id?: string }[] };
          const ids = (modelsData?.data ?? []).map((m) => m.id ?? '');
          available = ids.length > 0 ? ids : requiredModels;
          missing = requiredModels.filter((m) => !isRequiredModelPresent(m, available));
        } else {
          available = requiredModels;
          missing = [];
        }
      } catch {
        available = requiredModels;
        missing = [];
      }
    } else {
      available = [];
      missing = requiredModels;
    }
    return { healthy, available, missing };
  } catch (err) {
    logger.warn('Inference health check failed', {
      error: String(err),
      apiBase: config.apiBase,
    });
    return { healthy: false, available: [], missing: requiredModels };
  }
}

const HEALTH_CHECK_RETRY_DELAY_MS = 2000;
const HEALTH_CHECK_RETRY_ATTEMPTS = 5;

/** Retry health check with delay so inference server has time to be ready after parallel startup. */
export async function checkInferenceHealthWithRetry(
  config: InferenceEngineConfig,
  requiredModels: string[],
  onResult: (result: InferenceHealthResult) => void,
): Promise<void> {
  for (let attempt = 1; attempt <= HEALTH_CHECK_RETRY_ATTEMPTS; attempt++) {
    const result = await checkInferenceHealth(config, requiredModels);
    if (result.healthy) {
      onResult(result);
      return;
    }
    if (attempt < HEALTH_CHECK_RETRY_ATTEMPTS) {
      logger.debug('Inference not ready, retrying', {
        attempt,
        nextInMs: HEALTH_CHECK_RETRY_DELAY_MS,
        healthEndpoint: config.healthEndpoint,
      });
      await new Promise((r) => setTimeout(r, HEALTH_CHECK_RETRY_DELAY_MS));
    } else {
      onResult(result);
    }
  }
}
