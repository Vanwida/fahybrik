// Ingestion pipeline. Chunks raw text, generates embeddings, persists rows
// transactionally. Used by the upload + paste-text routes.

import { sql as defaultSql } from '@/lib/db';
import { chunkDocument } from './chunk';
import { generateEmbeddings, LlmConfigError } from './llm';
import {
  EMBEDDING_DIM,
  type MethodologySourceType,
} from './schema';

export class IngestError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'empty_content'
      | 'llm_unconfigured'
      | 'llm_failure'
      | 'persist_failure',
  ) {
    super(message);
    this.name = 'IngestError';
  }
}

export interface IngestInput {
  coach_id: bigint;
  title: string;
  source_type: MethodologySourceType;
  raw_content: string;
  file_url?: string | null;
  mime_type?: string | null;
  byte_size?: number | null;
}

export interface IngestResult {
  document_id: bigint;
  chunk_count: number;
  model_tag: string;
}

type SqlClient = typeof defaultSql;

export async function ingestDocument(
  input: IngestInput,
  sqlClient: SqlClient = defaultSql,
): Promise<IngestResult> {
  const trimmed = input.raw_content.trim();
  if (!trimmed) {
    throw new IngestError('Document is empty', 'empty_content');
  }

  const chunks = chunkDocument(trimmed);
  if (chunks.length === 0) {
    throw new IngestError(
      'Chunker returned 0 chunks (input collapsed after normalization)',
      'empty_content',
    );
  }

  let embeddings: number[][];
  let model_tag: string;
  try {
    const result = await generateEmbeddings(chunks);
    embeddings = result.embeddings;
    model_tag = `${result.provider}:${result.model}`;
  } catch (err) {
    if (err instanceof LlmConfigError) {
      throw new IngestError(err.message, 'llm_unconfigured');
    }
    throw new IngestError(
      err instanceof Error ? err.message : 'Embeddings failed',
      'llm_failure',
    );
  }

  if (embeddings.length !== chunks.length) {
    throw new IngestError(
      `Embedding count mismatch: ${embeddings.length} embeddings for ${chunks.length} chunks`,
      'llm_failure',
    );
  }

  const document_id = await sqlClient.begin(async (tx) => {
    const inserted = await tx<Array<{ id: string }>>`
      insert into methodology_documents (
        coach_id, source_type, title, raw_content,
        file_url, mime_type, byte_size, chunk_count
      ) values (
        ${input.coach_id as unknown as number},
        ${input.source_type},
        ${input.title},
        ${trimmed},
        ${input.file_url ?? null},
        ${input.mime_type ?? null},
        ${input.byte_size ?? null},
        ${chunks.length}
      )
      returning id::text as id
    `;

    const document_id = BigInt(inserted[0].id);

    const rows = chunks.map((content, index) => ({
      document_id: document_id as unknown as number,
      chunk_index: index,
      content,
      embedding: vectorLiteral(embeddings[index]),
    }));

    // Batch insert. postgres.js inserts arrays directly when given an array
    // of objects to `tx` — but `embedding` is a pgvector type, which the
    // driver doesn't know about, so we cast via the literal builder.
    for (const row of rows) {
      await tx`
        insert into methodology_chunks (document_id, chunk_index, content, embedding)
        values (
          ${row.document_id},
          ${row.chunk_index},
          ${row.content},
          ${row.embedding}::vector
        )
      `;
    }

    return document_id;
  });

  return {
    document_id,
    chunk_count: chunks.length,
    model_tag,
  };
}

// pgvector accepts text input shaped `[0.1, 0.2, ...]`. We cast to ::vector
// in the SQL literal so the driver doesn't try to interpret it as JSON.
export function vectorLiteral(vec: number[]): string {
  if (vec.length !== EMBEDDING_DIM) {
    throw new IngestError(
      `Vector length ${vec.length} != EMBEDDING_DIM ${EMBEDDING_DIM}`,
      'llm_failure',
    );
  }
  return `[${vec.join(',')}]`;
}
