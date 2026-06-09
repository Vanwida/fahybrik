// LLM embedding provider. NEVER hardcode a model name — Alex picks via env.
//
// Required env (set in `.env.local`, Vercel env, or `~/.openclaw/credentials/
// vanwida-tokens.env`):
//
//   LLM_PROVIDER          One of: openai | openrouter | azure-openai
//   LLM_EMBEDDING_MODEL   Model id passed to the provider as-is.
//   LLM_API_KEY           Bearer key for the provider.
//
// Optional:
//   LLM_BASE_URL          Override base URL (default depends on provider).
//   LLM_AZURE_API_VERSION Azure REST API version when LLM_PROVIDER=azure-openai.
//
// All providers below speak the OpenAI-compatible /embeddings shape, which
// is the de facto standard. Azure differs only on URL + auth header.
//
// If env is missing or misconfigured, ingest/retrieve raise LlmConfigError
// so the API layer can surface "LLM not configured" to the coach UI.

import { EMBEDDING_DIM } from './schema';

export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmConfigError';
  }
}

export class LlmRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'LlmRequestError';
  }
}

interface LlmConfig {
  provider: 'openai' | 'openrouter' | 'azure-openai';
  model: string;
  api_key: string;
  base_url: string;
  azure_api_version?: string;
}

function readConfig(): LlmConfig {
  const provider = process.env.LLM_PROVIDER?.trim().toLowerCase();
  const model = process.env.LLM_EMBEDDING_MODEL?.trim();
  const api_key = process.env.LLM_API_KEY?.trim();

  if (!provider || !model || !api_key) {
    throw new LlmConfigError(
      'LLM not configured — Alex must set LLM_PROVIDER, LLM_EMBEDDING_MODEL and LLM_API_KEY in env',
    );
  }

  if (provider !== 'openai' && provider !== 'openrouter' && provider !== 'azure-openai') {
    throw new LlmConfigError(
      `LLM_PROVIDER="${provider}" is not supported. Use one of: openai, openrouter, azure-openai.`,
    );
  }

  const base_url =
    process.env.LLM_BASE_URL?.trim() ??
    (provider === 'openai'
      ? 'https://api.openai.com/v1'
      : provider === 'openrouter'
        ? 'https://openrouter.ai/api/v1'
        : '');

  if (provider === 'azure-openai' && !process.env.LLM_BASE_URL) {
    throw new LlmConfigError(
      'LLM_PROVIDER=azure-openai requires LLM_BASE_URL (your deployment endpoint).',
    );
  }

  return {
    provider,
    model,
    api_key,
    base_url,
    azure_api_version: process.env.LLM_AZURE_API_VERSION?.trim(),
  };
}

interface EmbeddingApiResponse {
  data?: Array<{ embedding: number[]; index?: number }>;
  error?: { message?: string };
}

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  provider: string;
}

export async function generateEmbeddings(inputs: string[]): Promise<EmbeddingResult> {
  if (inputs.length === 0) {
    return { embeddings: [], model: '', provider: '' };
  }
  const cfg = readConfig();

  const url = buildEmbeddingsUrl(cfg);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (cfg.provider === 'azure-openai') {
    headers['api-key'] = cfg.api_key;
  } else {
    headers.authorization = `Bearer ${cfg.api_key}`;
  }

  const body: Record<string, unknown> = { input: inputs };
  // Azure puts the deployment in the URL; OpenAI/OpenRouter pass `model`.
  if (cfg.provider !== 'azure-openai') {
    body.model = cfg.model;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new LlmRequestError(
      `Embeddings request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      0,
    );
  }

  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as EmbeddingApiResponse;
      detail = j.error?.message ?? '';
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new LlmRequestError(
      `Embeddings request failed (${res.status}): ${detail || res.statusText}`,
      res.status,
    );
  }

  const json = (await res.json()) as EmbeddingApiResponse;
  if (!json.data || json.data.length === 0) {
    throw new LlmRequestError('Embeddings response missing data field', 502);
  }

  const ordered = [...json.data].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );

  for (const row of ordered) {
    if (!Array.isArray(row.embedding) || row.embedding.length !== EMBEDDING_DIM) {
      throw new LlmRequestError(
        `Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${row.embedding?.length ?? 0}. ` +
          `Schema column is vector(${EMBEDDING_DIM}). Pick a model that matches, ` +
          `or follow the migration path in lib/rag/schema.ts.`,
        502,
      );
    }
  }

  return {
    embeddings: ordered.map((r) => r.embedding),
    model: cfg.model,
    provider: cfg.provider,
  };
}

function buildEmbeddingsUrl(cfg: LlmConfig): string {
  if (cfg.provider === 'azure-openai') {
    const base = cfg.base_url.replace(/\/+$/, '');
    const ver = cfg.azure_api_version ?? '2024-02-15-preview';
    // Convention: LLM_BASE_URL points at the resource;
    // model = deployment id.
    return `${base}/openai/deployments/${encodeURIComponent(cfg.model)}/embeddings?api-version=${encodeURIComponent(ver)}`;
  }
  return `${cfg.base_url.replace(/\/+$/, '')}/embeddings`;
}

export function getEmbeddingModelTag(): string {
  try {
    const cfg = readConfig();
    return `${cfg.provider}:${cfg.model}`;
  } catch {
    return 'unconfigured';
  }
}
