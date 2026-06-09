// Read/list/archive helpers for methodology documents. Soft delete only —
// the embeddings remain so we can restore a document if it was archived
// in error.

import { sql as defaultSql } from '@/lib/db';
import type { MethodologySourceType } from './schema';

type SqlClient = typeof defaultSql;

export interface DocumentSummary {
  id: string;
  coach_id: string;
  title: string;
  source_type: MethodologySourceType;
  ingested_at: string;
  chunk_count: number;
  byte_size: number | null;
  mime_type: string | null;
  archived_at: string | null;
}

export interface DocumentDetail extends DocumentSummary {
  raw_content: string;
  file_url: string | null;
  chunks: Array<{
    id: string;
    chunk_index: number;
    content: string;
  }>;
}

export async function listDocuments(
  args: { coach_id: bigint; include_archived?: boolean },
  sqlClient: SqlClient = defaultSql,
): Promise<DocumentSummary[]> {
  const include_archived = args.include_archived ?? false;
  const rows = await sqlClient<Array<DocumentSummary>>`
    select
      id::text          as id,
      coach_id::text    as coach_id,
      title,
      source_type,
      ingested_at::text as ingested_at,
      chunk_count,
      byte_size,
      mime_type,
      archived_at::text as archived_at
    from methodology_documents
    where coach_id = ${args.coach_id as unknown as number}
      and (${include_archived}::boolean is true or archived_at is null)
    order by ingested_at desc
  `;
  return rows;
}

export async function getDocumentDetail(
  args: { coach_id: bigint; document_id: bigint },
  sqlClient: SqlClient = defaultSql,
): Promise<DocumentDetail | null> {
  const docRows = await sqlClient<Array<DocumentSummary & { raw_content: string; file_url: string | null }>>`
    select
      id::text          as id,
      coach_id::text    as coach_id,
      title,
      source_type,
      ingested_at::text as ingested_at,
      chunk_count,
      byte_size,
      mime_type,
      archived_at::text as archived_at,
      raw_content,
      file_url
    from methodology_documents
    where coach_id = ${args.coach_id as unknown as number}
      and id = ${args.document_id as unknown as number}
    limit 1
  `;
  const doc = docRows[0];
  if (!doc) return null;

  const chunks = await sqlClient<Array<{ id: string; chunk_index: number; content: string }>>`
    select id::text as id, chunk_index, content
    from methodology_chunks
    where document_id = ${args.document_id as unknown as number}
    order by chunk_index asc
  `;

  return { ...doc, chunks };
}

export async function archiveDocument(
  args: { coach_id: bigint; document_id: bigint },
  sqlClient: SqlClient = defaultSql,
): Promise<{ archived: boolean }> {
  const rows = await sqlClient<Array<{ id: string }>>`
    update methodology_documents
    set archived_at = now(), updated_at = now()
    where coach_id = ${args.coach_id as unknown as number}
      and id = ${args.document_id as unknown as number}
      and archived_at is null
    returning id::text as id
  `;
  return { archived: rows.length > 0 };
}
