// Retrieval helper. Embeds the query, vector-searches via pgvector cosine
// distance (`<=>`). Returns the top-k chunks with document context.
//
// Used by IA template selection and MCP search_methodology. Without an
// explicit source_types filter this searches the METHOD corpus only —
// never papers. The studio asks for source_types: ['paper'] on purpose.

import { sql as defaultSql } from '@/lib/db';
import { generateEmbeddings, LlmConfigError } from './llm';
import { vectorLiteral, IngestError } from './ingest';
import { resolveCorpusSourceTypes, type MethodologySourceType } from './schema';

export class RetrieveError extends Error {
  constructor(
    message: string,
    public readonly code: 'llm_unconfigured' | 'llm_failure' | 'invalid_query',
  ) {
    super(message);
    this.name = 'RetrieveError';
  }
}

export interface RetrieveInput {
  coach_id: bigint;
  query: string;
  top_k?: number;
  source_types?: MethodologySourceType[];
}

export interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  document_title: string;
  document_source_type: MethodologySourceType;
  chunk_index: number;
  content: string;
  similarity: number;
}

type SqlClient = typeof defaultSql;

export async function retrieveRelevant(
  input: RetrieveInput,
  sqlClient: SqlClient = defaultSql,
): Promise<RetrievedChunk[]> {
  const query = input.query.trim();
  if (!query) {
    throw new RetrieveError('Query is empty', 'invalid_query');
  }
  const top_k = clamp(input.top_k ?? 6, 1, 50);

  let embedding: number[];
  try {
    const result = await generateEmbeddings([query]);
    embedding = result.embeddings[0];
  } catch (err) {
    if (err instanceof LlmConfigError) {
      throw new RetrieveError(err.message, 'llm_unconfigured');
    }
    throw new RetrieveError(
      err instanceof Error ? err.message : 'Embeddings failed',
      'llm_failure',
    );
  }

  let vec: string;
  try {
    vec = vectorLiteral(embedding);
  } catch (err) {
    throw new RetrieveError(
      err instanceof IngestError ? err.message : 'Bad vector',
      'llm_failure',
    );
  }

  const filter_types = resolveCorpusSourceTypes(input.source_types);

  const rows = await sqlClient<
    Array<{
      chunk_id: string;
      document_id: string;
      document_title: string;
      document_source_type: MethodologySourceType;
      chunk_index: number;
      content: string;
      distance: string;
    }>
  >`
    select
      mc.id::text          as chunk_id,
      md.id::text          as document_id,
      md.title             as document_title,
      md.source_type       as document_source_type,
      mc.chunk_index       as chunk_index,
      mc.content           as content,
      (mc.embedding <=> ${vec}::vector)::text as distance
    from methodology_chunks mc
    join methodology_documents md on md.id = mc.document_id
    where md.coach_id = ${input.coach_id as unknown as number}
      and md.archived_at is null
      and mc.embedding is not null
      and md.source_type::text = any(${filter_types}::text[])
    order by mc.embedding <=> ${vec}::vector asc
    limit ${top_k}
  `;

  return rows.map((r) => ({
    chunk_id: r.chunk_id,
    document_id: r.document_id,
    document_title: r.document_title,
    document_source_type: r.document_source_type,
    chunk_index: r.chunk_index,
    content: r.content,
    similarity: 1 - Number(r.distance),
  }));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
