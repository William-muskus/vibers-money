/**
 * Derive a business slug that summarizes the business concept (not the first 5 words of the message).
 * Tries LLM first (local or Mistral API), then falls back to heuristic: strip filler phrases and take up to 5 meaningful words.
 */
import { logger } from './logger.js';

const MAX_SLUG_WORDS = 5;
const SLUG_LLM_TIMEOUT_MS = 8_000;

const FILLER_PATTERNS = [
  /^\s*(?:i want to|i'd like to|let's|lets)\s+(?:launch|build|start|create)\s+/i,
  /^\s*(?:we're|we are|i'm|i am)\s+(?:building|launching|starting)\s+/i,
  /^\s*(?:launch|build|start|create)\s+(?:an?|the)\s+/i,
  /\s+(?:an?|the)\s+(?=[a-z])/gi,
  /\s+for\s+the\s+/gi,
  /\s+in\s+the\s+/gi,
  /\s+for\s+(?:french|us|europe|market)\s+/gi,
];

function heuristicConceptSlug(idea: string): string {
  let t = idea.trim().toLowerCase();
  if (!t) return `business-${Date.now()}`;
  for (const re of FILLER_PATTERNS) {
    t = t.replace(re, ' ');
  }
  const words = t
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 0)
    .slice(0, MAX_SLUG_WORDS);
  const slug = words.join('-');
  return slug || `business-${Date.now()}`;
}

function slugifyLlmReply(content: string): string {
  const oneLine = content.trim().split(/\n/)[0] ?? '';
  const words = oneLine
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .slice(0, MAX_SLUG_WORDS);
  const slug = words.join('-');
  return slug || '';
}

export async function deriveConceptSlug(idea: string): Promise<string> {
  const trimmed = idea.trim();
  if (!trimmed) return `business-${Date.now()}`;

  const localBase = (process.env.LOCAL_LLM_API_BASE ?? '').trim();
  const localModel = (process.env.LOCAL_LLM_MODEL ?? 'mistral:7b').trim();
  const mistralKey = (process.env.MISTRAL_API_KEY ?? '').trim();

  const prompt = `Summarize this business idea in at most ${MAX_SLUG_WORDS} words. Reply with only a hyphenated slug (lowercase, letters and numbers only). No other text.\n\nIdea: ${trimmed}`;

  if (localBase.length > 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SLUG_LLM_TIMEOUT_MS);
      const res = await fetch(`${localBase.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: localModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 40,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
          const slug = slugifyLlmReply(content);
          if (slug) {
            logger.debug('concept_slug_llm', { idea: trimmed.slice(0, 50), slug });
            return slug;
          }
        }
      }
    } catch (e) {
      logger.debug('concept_slug_llm_failed', { error: String((e as Error).message) });
    }
  }

  if (mistralKey.length > 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SLUG_LLM_TIMEOUT_MS);
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mistralKey}`,
        },
        body: JSON.stringify({
          model: 'mistral-small',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 40,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
          const slug = slugifyLlmReply(content);
          if (slug) {
            logger.debug('concept_slug_llm', { idea: trimmed.slice(0, 50), slug });
            return slug;
          }
        }
      }
    } catch (e) {
      logger.debug('concept_slug_llm_failed', { error: String((e as Error).message) });
    }
  }

  const slug = heuristicConceptSlug(trimmed);
  logger.debug('concept_slug_heuristic', { idea: trimmed.slice(0, 50), slug });
  return slug;
}
