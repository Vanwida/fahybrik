import 'server-only';

import { recordLlmInvocation } from '@/lib/observability/llm-cost';

/**
 * Coach IA LLM wiring — compartido por suggest-workout y suggest-week.
 *
 * Brain rule: NEVER hardcode model/provider. Alex picks via env.
 * Si no hay env → isCoachIaLlmConfigured() devuelve false → fallback heurístico
 * (no LLM-impostor: siempre seleccionamos templates reales del catálogo).
 *
 * Wire genérico OpenRouter-compatible (fetch directo, sin SDKs extra).
 * El mismo wiring vive duplicado en `weekly-evaluation.ts` por compat; cuando se
 * unifique, ese módulo importará desde aquí.
 */

export function isCoachIaLlmConfigured(): boolean {
  const model = (process.env.COACH_IA_MODEL ?? process.env.PABLO_IA_MODEL)?.trim() ?? process.env.LLM_CHAT_MODEL?.trim();
  const key =
    (process.env.COACH_IA_API_KEY ?? process.env.PABLO_IA_API_KEY)?.trim() ??
    process.env.LLM_API_KEY?.trim() ??
    process.env.OPENROUTER_API_KEY?.trim();
  return Boolean(model && key);
}

export class CoachIaLlmError extends Error {
  constructor(
    public readonly code: 'unconfigured' | 'http' | 'empty' | 'invalid_json',
    message: string,
  ) {
    super(message);
    this.name = 'CoachIaLlmError';
  }
}

interface CallArgs {
  system: string;
  user: string;
  temperature?: number;
  max_tokens?: number;
  /**
   * Cost-telemetry context (A7). Best-effort: when present, the call's token
   * usage is recorded in `llm_invocations`. Omit it and nothing is logged.
   */
  meta?: {
    surface: string;
    athlete_id?: number | bigint | null;
    coach_id?: number | bigint | null;
  };
}

export async function callCoachIaLlmJson(args: CallArgs): Promise<unknown> {
  if (!isCoachIaLlmConfigured()) {
    throw new CoachIaLlmError('unconfigured', 'Coach IA LLM no configurado');
  }

  const provider = ((process.env.COACH_IA_PROVIDER ?? process.env.PABLO_IA_PROVIDER) ?? process.env.LLM_PROVIDER ?? 'openrouter')
    .trim()
    .toLowerCase();
  const model = ((process.env.COACH_IA_MODEL ?? process.env.PABLO_IA_MODEL) ?? process.env.LLM_CHAT_MODEL)!.trim();
  const apiKey = (
    (process.env.COACH_IA_API_KEY ?? process.env.PABLO_IA_API_KEY) ??
    process.env.LLM_API_KEY ??
    process.env.OPENROUTER_API_KEY
  )!.trim();

  const baseUrl =
    process.env.LLM_BASE_URL?.trim() ??
    (provider === 'openai' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1');
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
    const title = process.env.OPENROUTER_APP_TITLE?.trim();
    if (referer) headers['HTTP-Referer'] = referer;
    if (title) headers['X-Title'] = title;
  }

  const body = {
    model,
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ],
    temperature: args.temperature ?? 0.35,
    max_tokens: args.max_tokens ?? 2048,
    response_format: { type: 'json_object' },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.LLM_CHAT_TIMEOUT_MS ?? 120_000)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new CoachIaLlmError(
      'http',
      `Coach IA LLM request failed (${res.status}): ${text || res.statusText}`,
    );
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };

  // Best-effort cost telemetry (A7). Fire-and-forget — never blocks or throws.
  if (args.meta && json.usage) {
    void recordLlmInvocation({
      surface: args.meta.surface,
      model,
      usage: json.usage,
      athlete_id: args.meta.athlete_id ?? null,
      coach_id: args.meta.coach_id ?? null,
    });
  }

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new CoachIaLlmError('empty', 'Coach IA LLM response empty');

  return parseJsonLenient(content);
}

// ── Image-capable variant ────────────────────────────────────────────────────
// Same OpenRouter-compatible wire, but the user turn carries multimodal content
// parts: a text instruction + an `image_url` block with a data: URI (base64).
// Used by the workout-capture vision feature (athlete uploads a screenshot of
// another app's summary). The MODEL is passed in by the caller (read from env,
// NEVER hardcoded) so a single multimodal model (text+image) serves it.
//
// Provider/base/key resolution mirrors callCoachIaLlmJson exactly (OpenRouter by
// default: LLM_BASE_URL + OPENROUTER_API_KEY). `fetchImpl` is injectable for tests.
export async function callLlmJsonWithImage(args: {
  model: string;
  system: string;
  user: string;
  image_base64: string; // raw base64 (no data: prefix)
  mime_type: string; // e.g. image/jpeg
  temperature?: number;
  max_tokens?: number;
  meta?: {
    surface: string;
    athlete_id?: number | bigint | null;
    coach_id?: number | bigint | null;
  };
  fetchImpl?: typeof fetch;
}): Promise<unknown> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const provider = ((process.env.COACH_IA_PROVIDER ?? process.env.PABLO_IA_PROVIDER) ?? process.env.LLM_PROVIDER ?? 'openrouter')
    .trim()
    .toLowerCase();
  const apiKey = (
    (process.env.COACH_IA_API_KEY ?? process.env.PABLO_IA_API_KEY) ??
    process.env.LLM_API_KEY ??
    process.env.OPENROUTER_API_KEY ??
    ''
  ).trim();
  if (!apiKey) throw new CoachIaLlmError('unconfigured', 'LLM API key no configurada');

  const baseUrl =
    process.env.LLM_BASE_URL?.trim() ??
    (provider === 'openai' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1');
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
    const title = process.env.OPENROUTER_APP_TITLE?.trim();
    if (referer) headers['HTTP-Referer'] = referer;
    if (title) headers['X-Title'] = title;
  }

  const dataUri = `data:${args.mime_type};base64,${args.image_base64}`;
  const body = {
    model: args.model,
    messages: [
      { role: 'system', content: args.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: args.user },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      },
    ],
    temperature: args.temperature ?? 0.1,
    max_tokens: args.max_tokens ?? 2048,
    response_format: { type: 'json_object' },
  };

  const res = await fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.LLM_VISION_TIMEOUT_MS ?? 90_000)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new CoachIaLlmError(
      'http',
      `LLM vision request failed (${res.status}): ${text || res.statusText}`,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };

  if (args.meta && json.usage) {
    void recordLlmInvocation({
      surface: args.meta.surface,
      model: args.model,
      usage: json.usage,
      athlete_id: args.meta.athlete_id ?? null,
      coach_id: args.meta.coach_id ?? null,
    });
  }

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new CoachIaLlmError('empty', 'LLM vision response empty');

  return parseJsonLenient(content);
}

/**
 * Algunos modelos (deepseek, llamas finetune) ignoran `response_format`
 * y devuelven JSON envuelto en markdown fences o con preámbulo/epílogo.
 * Intentamos parse directo, luego strip fences, luego extracción del primer
 * objeto/array JSON balanceado.
 */
export function parseJsonLenient(content: string): unknown {
  const tryParse = (s: string): unknown | null => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  const direct = tryParse(content);
  if (direct !== null) return direct;

  const trimmed = content.trim();

  // Strip ```json ... ``` o ``` ... ```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    const fenced = tryParse(fenceMatch[1]!);
    if (fenced !== null) return fenced;
  }

  // Extrae el primer objeto JSON balanceado (entre llaves).
  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) {
    const obj = tryParse(objMatch[0]);
    if (obj !== null) return obj;
  }

  throw new CoachIaLlmError('invalid_json', 'Coach IA LLM JSON inválido');
}
