// Local mirror of methodology RAG validation schemas.
// Mirrors `@fahybrid/shared/schema/methodology.ts` + adds API-layer schemas
// (upload payload, retrieval query). Kept local until #29 cleanup ships.

import { z } from 'zod';

// Embedding dim = 1536 (matches DB column vector(1536) and shared/_primitives).
// If Alex picks an LLM with different dim, migration path:
//   1. add new column embedding_v2 vector(N) on methodology_chunks
//   2. backfill via re-embed job
//   3. swap HNSW index, drop old column
//   4. update EMBEDDING_DIM here + shared/_primitives in same commit
export const EMBEDDING_DIM = 1536;

export const methodologySourceTypeSchema = z.enum([
  'text',
  'interview_transcript',
  'document_upload',
  'voice_note',
  'paper',
]);
export type MethodologySourceType = z.infer<typeof methodologySourceTypeSchema>;

/** Literatura del estudio. No entra en el corpus que imita el método. */
export const PAPER_SOURCE_TYPE = 'paper' as const;

/** Prosa de método: retrieve/list sin filtro de tipo se quedan aquí. */
export const methodologyCorpusSourceTypeSchema = z.enum([
  'text',
  'interview_transcript',
  'document_upload',
  'voice_note',
]);
export type MethodologyCorpusSourceType = z.infer<
  typeof methodologyCorpusSourceTypeSchema
>;

export const METHODOLOGY_CORPUS_SOURCE_TYPES =
  methodologyCorpusSourceTypeSchema.options;

/**
 * Filtro de retrieve/list. Sin pedido → método, nunca papers.
 * Un array vacío es lo mismo que no pedir: un filtro vacío devolvería cero
 * filas y se leería como «no hay corpus».
 */
export function resolveCorpusSourceTypes(
  requested?: readonly MethodologySourceType[],
): MethodologySourceType[] {
  if (requested && requested.length > 0) return [...requested];
  return [...METHODOLOGY_CORPUS_SOURCE_TYPES];
}

const SUPPORTED_MIME = new Set<string>([
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function isSupportedMime(mime: string): boolean {
  return SUPPORTED_MIME.has(mime);
}

export const SUPPORTED_MIME_LIST = Array.from(SUPPORTED_MIME);

// Upload payload (multipart form). The route validates request shape; we
// expose a Zod schema for the JSON-only paste-text path.
export const ingestTextRequestSchema = z.object({
  title: z.string().min(1).max(400),
  source_type: methodologyCorpusSourceTypeSchema,
  raw_content: z.string().min(1).max(2_000_000),
});
export type IngestTextRequest = z.infer<typeof ingestTextRequestSchema>;

/** Paste-text del estudio. El source_type lo pone el servidor (paper). */
export const ingestPaperTextRequestSchema = ingestTextRequestSchema.omit({
  source_type: true,
});
export type IngestPaperTextRequest = z.infer<typeof ingestPaperTextRequestSchema>;

export const retrievalRequestSchema = z.object({
  query: z.string().min(1).max(4_000),
  top_k: z.number().int().positive().max(50).optional(),
  source_types: z.array(methodologySourceTypeSchema).optional(),
});

export const paperSearchRequestSchema = retrievalRequestSchema.omit({
  source_types: true,
});
export type RetrievalRequest = z.infer<typeof retrievalRequestSchema>;

// Tunables — exported so chunker tests can pin them.
export const CHUNK_TARGET_TOKENS = 500;
export const CHUNK_OVERLAP_TOKENS = 100;

// Heuristic: ~4 chars per token (English/Spanish mix). Cheap, no tokenizer
// dependency. Refine if/when Alex picks an LLM with a published tokenizer.
export const APPROX_CHARS_PER_TOKEN = 4;
