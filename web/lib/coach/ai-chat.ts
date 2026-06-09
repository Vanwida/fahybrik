// Chat/completions — same provider env as embeddings, separate model var.
// Alex sets LLM_CHAT_MODEL in env (never hardcode a model id here).
//
// OpenRouter-only optional routing:
//   LLM_CHAT_PROVIDER_ORDER=alibaba,deepseek   # comma-separated provider slugs
//   LLM_CHAT_PROVIDER_FALLBACKS=false          # default true

import { LlmConfigError, LlmRequestError } from '@/lib/rag/llm';
import { recordLlmInvocation } from '@/lib/observability/llm-cost';

interface ChatConfig {
  provider: 'openai' | 'openrouter' | 'azure-openai';
  model: string;
  api_key: string;
  base_url: string;
  azure_api_version?: string;
  openrouter_provider?: {
    order: string[];
    allow_fallbacks: boolean;
  };
}

function readChatConfig(): ChatConfig {
  const provider = process.env.LLM_PROVIDER?.trim().toLowerCase();
  const model =
    process.env.LLM_CHAT_MODEL?.trim() ?? process.env.LLM_MODEL?.trim();
  const api_key =
    process.env.LLM_CHAT_API_KEY?.trim() ??
    process.env.LLM_API_KEY?.trim() ??
    (provider === 'openrouter' ? process.env.OPENROUTER_API_KEY?.trim() : undefined);

  if (!provider || !model || !api_key) {
    throw new LlmConfigError(
      'LLM chat not configured — set LLM_PROVIDER, LLM_CHAT_MODEL and LLM_API_KEY (or OPENROUTER_API_KEY)',
    );
  }

  if (provider !== 'openai' && provider !== 'openrouter' && provider !== 'azure-openai') {
    throw new LlmConfigError(`Unsupported LLM_PROVIDER: ${provider}`);
  }

  const base_url =
    process.env.LLM_BASE_URL?.trim() ??
    (provider === 'openai'
      ? 'https://api.openai.com/v1'
      : provider === 'openrouter'
        ? 'https://openrouter.ai/api/v1'
        : '');

  if (provider === 'azure-openai' && !process.env.LLM_BASE_URL) {
    throw new LlmConfigError('azure-openai requires LLM_BASE_URL');
  }

  const orderRaw = process.env.LLM_CHAT_PROVIDER_ORDER?.trim();
  const order = orderRaw
    ? orderRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const fallbacksRaw = process.env.LLM_CHAT_PROVIDER_FALLBACKS?.trim().toLowerCase();
  const allow_fallbacks = fallbacksRaw === 'false' || fallbacksRaw === '0' ? false : true;

  return {
    provider: provider as ChatConfig['provider'],
    model,
    api_key,
    base_url,
    azure_api_version: process.env.LLM_AZURE_API_VERSION?.trim(),
    openrouter_provider:
      provider === 'openrouter' && order.length
        ? { order, allow_fallbacks }
        : undefined,
  };
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function chatCompletion(params: {
  messages: ChatMessage[];
  json_mode?: boolean;
  temperature?: number;
  /** Output token budget. Default LLM_CHAT_MAX_TOKENS or 8192. */
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
}): Promise<string> {
  const cfg = readChatConfig();
  const url = buildChatUrl(cfg);
  const max_tokens =
    params.max_tokens ??
    Number(process.env.LLM_CHAT_MAX_TOKENS ?? 8192);

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.provider === 'azure-openai') {
    headers['api-key'] = cfg.api_key;
  } else {
    headers.authorization = `Bearer ${cfg.api_key}`;
  }
  if (cfg.provider === 'openrouter') {
    const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
    const title = process.env.OPENROUTER_APP_TITLE?.trim();
    if (referer) headers['HTTP-Referer'] = referer;
    if (title) headers['X-Title'] = title;
  }

  const body: Record<string, unknown> = {
    messages: params.messages,
    temperature: params.temperature ?? 0.4,
    max_tokens,
  };
  if (cfg.provider !== 'azure-openai') {
    body.model = cfg.model;
  }
  if (params.json_mode) {
    body.response_format = { type: 'json_object' };
  }
  if (cfg.openrouter_provider) {
    body.provider = cfg.openrouter_provider;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.LLM_CHAT_TIMEOUT_MS ?? 120_000)),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      detail = j.error?.message ?? '';
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new LlmRequestError(
      `Chat request failed (${res.status}): ${detail || res.statusText}`,
      res.status,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };

  // Best-effort cost telemetry (A7). Fire-and-forget — never blocks or throws.
  if (params.meta && json.usage) {
    void recordLlmInvocation({
      surface: params.meta.surface,
      model: cfg.model,
      usage: json.usage,
      athlete_id: params.meta.athlete_id ?? null,
      coach_id: params.meta.coach_id ?? null,
    });
  }

  const choice = json.choices?.[0];
  const text = choice?.message?.content;
  if (choice?.finish_reason === 'length') {
    throw new LlmRequestError(
      `Respuesta truncada por límite de tokens (max_tokens=${max_tokens}). Sube LLM_CHAT_MAX_TOKENS.`,
      502,
    );
  }
  if (!text) throw new LlmRequestError('Chat response empty', 502);
  return text;
}

function buildChatUrl(cfg: ChatConfig): string {
  if (cfg.provider === 'azure-openai') {
    const base = cfg.base_url.replace(/\/+$/, '');
    const ver = cfg.azure_api_version ?? '2024-02-15-preview';
    return `${base}/openai/deployments/${encodeURIComponent(cfg.model)}/chat/completions?api-version=${encodeURIComponent(ver)}`;
  }
  return `${cfg.base_url.replace(/\/+$/, '')}/chat/completions`;
}

export function isChatConfigured(): boolean {
  try {
    readChatConfig();
    return true;
  } catch {
    return false;
  }
}
