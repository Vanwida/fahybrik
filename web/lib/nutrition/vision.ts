// Photo → macro estimation via a vision LLM.
//
// Brain rule: NEVER hardcode a model. The vision model is read from the NEW env
// `LLM_VISION_MODEL`. If it's unset, the route returns 501 — we never pick a
// default. Provider/base/key are shared with the rest of the stack (OpenRouter
// by default: LLM_BASE_URL + OPENROUTER_API_KEY), mirroring the coach LLM wire.
//
// We reuse the coach module's `parseJsonLenient` (single source for the
// markdown-fence-tolerant JSON parse). The call is multimodal: a text prompt +
// an image_url block carrying a data: URI (base64).

import 'server-only';

import { z } from 'zod';
import { parseJsonLenient } from '@/lib/dashboard/coach/ai/llm';
import { recordLlmInvocation } from '@/lib/observability/llm-cost';

export function getVisionModel(): string | null {
  const m = process.env.LLM_VISION_MODEL?.trim();
  return m ? m : null;
}

export function isVisionConfigured(): boolean {
  return getVisionModel() != null;
}

export class VisionError extends Error {
  constructor(
    public readonly code: 'unconfigured' | 'http' | 'empty' | 'invalid_json',
    message: string,
  ) {
    super(message);
    this.name = 'VisionError';
  }
}

const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kcal: z.coerce.number().finite().min(0).default(0),
  protein_g: z.coerce.number().finite().min(0).default(0),
  carbs_g: z.coerce.number().finite().min(0).default(0),
  fat_g: z.coerce.number().finite().min(0).default(0),
  confidence: z.coerce.number().finite().min(0).max(1).optional(),
});

const responseSchema = z.object({ items: z.array(itemSchema) });

export type EstimatedItem = z.infer<typeof itemSchema>;

const SYSTEM_PROMPT =
  'You are a sports nutritionist. Estimate the foods visible in the photo and ' +
  'their macros for the portion shown. Respond ONLY with JSON of the shape ' +
  '{"items":[{"name":string,"kcal":number,"protein_g":number,"carbs_g":number,' +
  '"fat_g":number,"confidence":number between 0 and 1}]}. Use grams for macros ' +
  'and kcal for energy, for the whole portion shown (not per 100g). If you ' +
  'cannot identify any food, return {"items":[]}.';

/**
 * Calls the vision model with a base64 image and returns the validated items.
 * `fetchImpl` is injectable for tests. Throws VisionError('unconfigured') if
 * the env model is missing — callers should map that to a 501.
 */
export async function estimateMacrosFromImage(args: {
  image_base64: string; // raw base64 (no data: prefix)
  mime_type: string; // e.g. image/jpeg
  athlete_id?: bigint | null;
  fetchImpl?: typeof fetch;
}): Promise<EstimatedItem[]> {
  const model = getVisionModel();
  if (!model) throw new VisionError('unconfigured', 'LLM_VISION_MODEL no configurado');

  const fetchImpl = args.fetchImpl ?? fetch;
  const provider = (process.env.LLM_PROVIDER ?? 'openrouter').trim().toLowerCase();
  const apiKey = (process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY ?? '').trim();
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
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Estimate the foods and macros in this photo.' },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      },
    ],
    temperature: 0.2,
    max_tokens: Number(process.env.LLM_VISION_MAX_TOKENS ?? 1024),
    response_format: { type: 'json_object' },
  };

  const res = await fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.LLM_VISION_TIMEOUT_MS ?? 60_000)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new VisionError('http', `Vision request failed (${res.status}): ${text || res.statusText}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };

  if (json.usage) {
    void recordLlmInvocation({
      surface: 'nutrition_photo',
      model,
      usage: json.usage,
      athlete_id: args.athlete_id ?? null,
      coach_id: null,
    });
  }

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new VisionError('empty', 'Vision response empty');

  let parsed: unknown;
  try {
    parsed = parseJsonLenient(content);
  } catch {
    throw new VisionError('invalid_json', 'Vision JSON inválido');
  }

  const safe = responseSchema.safeParse(parsed);
  if (!safe.success) throw new VisionError('invalid_json', 'Vision JSON con shape inesperado');
  return safe.data.items;
}
