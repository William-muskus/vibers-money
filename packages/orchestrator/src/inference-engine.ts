/**
 * Inference engine config and health check for local LLM backends
 * (Ollama, Rust/Candle, TensorRT, or generic OpenAI-compatible).
 */
import { logger } from './logger.js';

export interface InferenceEngineConfig {
  type: 'ollama' | 'rust-candle' | 'tensorrt' | 'generic';
  apiBase: string;
  healthEndpoint: string;
}

export function getInferenceConfig(): InferenceEngineConfig | null {
  const apiBase = process.env.LOCAL_LLM_API_BASE?.trim();
  if (!apiBase) return null;
  const type = (process.env.LOCAL_LLM_ENGINE || 'rust-candle') as InferenceEngineConfig['type'];
  const base = apiBase.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
  return {
    type,
    apiBase,
    healthEndpoint: `${base}/health`,
  };
}

export interface InferenceHealthResult {
  healthy: boolean;
  available: string[];
  missing: string[];
}

export async function checkInferenceHealth(
  config: InferenceEngineConfig,
  requiredModels: string[],
): Promise<InferenceHealthResult> {
  try {
    const res = await fetch(config.healthEndpoint);
    if (!res.ok) return { healthy: false, available: [], missing: requiredModels };
    const data = (await res.json()) as { ok?: boolean; model_loaded?: boolean; data?: Array<{ id: string }> };
    const healthy = data?.ok !== false;
    let available: string[];
    let missing: string[];
    if (data?.model_loaded === true) {
      available = requiredModels.length > 0 ? [...requiredModels] : ['loaded'];
      missing = [];
    } else if (Array.isArray(data?.data)) {
      available = (data.data || []).map((m) => m.id);
      missing = requiredModels.filter((m) => !available.includes(m));
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
