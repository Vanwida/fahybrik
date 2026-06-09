import type { Sql } from 'postgres';

// LLM cost tracking (A7 finding: 0 telemetry → bill-shock risk).
//
// Every LLM call records a row in `llm_invocations` (migration 0026). Recording
// is BEST-EFFORT: a failed insert must never break the user-facing response.
//
// Brain rule: never hardcode the model. The pricing table below is keyed by the
// model id Alex configures via env — if the active model isn't listed, cost_usd
// is stored NULL (we record the call + tokens, we just don't guess the price).

/** Usage shape as returned by OpenRouter / OpenAI chat completions. */
export interface LlmUsage {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  /** OpenAI/OpenRouter prompt cache hits, when the provider reports them. */
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
  /** Some providers report cached prompt tokens at the top level. */
  cached_tokens?: number | null;
}

/** USD per 1M tokens, split prompt vs completion. */
interface ModelPricing {
  prompt_per_million: number;
  completion_per_million: number;
}

const TOKENS_PER_MILLION = 1_000_000;

// Per-model pricing (USD / 1M tokens). Keys are matched against the configured
// model id case-insensitively and also by substring, so both bare ids
// ("deepseek-v4-flash") and provider-prefixed ids ("deepseek/deepseek-v4-flash")
// resolve. Add models here as Alex switches providers — unknown → NULL cost.
const MODEL_PRICING: Record<string, ModelPricing> = {
  // DeepSeek v4 Flash — the documented default in the A7 spec.
  'deepseek-v4-flash': { prompt_per_million: 0.1, completion_per_million: 0.2 },
};

function resolvePricing(model: string): ModelPricing | null {
  const key = model.trim().toLowerCase();
  if (MODEL_PRICING[key]) return MODEL_PRICING[key];
  // Substring match handles provider-prefixed ids ("vendor/model", "model:tag").
  for (const [id, pricing] of Object.entries(MODEL_PRICING)) {
    if (key.includes(id)) return pricing;
  }
  return null;
}

/**
 * Estimate USD cost for a call. Returns null when the model isn't in the
 * pricing table (don't guess) or when token counts are missing.
 */
export function estimateCost(model: string, usage: LlmUsage): number | null {
  const pricing = resolvePricing(model);
  if (!pricing) return null;
  const prompt = usage.prompt_tokens ?? 0;
  const completion = usage.completion_tokens ?? 0;
  if (prompt === 0 && completion === 0) return null;
  const cost =
    (prompt / TOKENS_PER_MILLION) * pricing.prompt_per_million +
    (completion / TOKENS_PER_MILLION) * pricing.completion_per_million;
  // Round to the column scale (numeric(10,6)).
  return Math.round(cost * 1e6) / 1e6;
}

function cachedTokens(usage: LlmUsage): number | null {
  return usage.prompt_tokens_details?.cached_tokens ?? usage.cached_tokens ?? null;
}

export interface RecordLlmInvocationParams {
  /** Logical call site: 'suggest_week' | 'suggest_workout' | 'weekly_eval' | 'coach_chat' | ... */
  surface: string;
  model: string;
  usage: LlmUsage;
  athlete_id?: number | bigint | null;
  coach_id?: number | bigint | null;
  client: Sql;
  /**
   * Optional logger for the (swallowed) failure path. Injected by each app's
   * wrapper so shared stays platform-agnostic (no `console` dependency here —
   * shared compiles against the ES2022 lib only, with no DOM/Node globals).
   */
  onError?: (message: string, detail: { surface: string; model: string; message: string }) => void;
}

/**
 * Record one LLM invocation. BEST-EFFORT — swallows all errors so a logging
 * failure can never break the response the user is waiting on. Returns true if
 * the row was written, false if it was skipped/failed.
 */
export async function recordLlmInvocation(params: RecordLlmInvocationParams): Promise<boolean> {
  const client = params.client;
  try {
    const cost = estimateCost(params.model, params.usage);
    await client`
      insert into llm_invocations (
        athlete_id, coach_id, surface, model,
        prompt_tokens, completion_tokens, cached_tokens, cost_usd
      ) values (
        ${params.athlete_id != null ? Number(params.athlete_id) : null},
        ${params.coach_id != null ? Number(params.coach_id) : null},
        ${params.surface},
        ${params.model},
        ${params.usage.prompt_tokens ?? null},
        ${params.usage.completion_tokens ?? null},
        ${cachedTokens(params.usage)},
        ${cost}
      )
    `;
    return true;
  } catch (err) {
    // Never throw from telemetry. The wrapper passes a structured stderr logger.
    params.onError?.('[llm-cost] failed to record invocation', {
      surface: params.surface,
      model: params.model,
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
