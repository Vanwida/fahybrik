// Estudio de papers: el mismo pipeline RAG (chunk + embed + pgvector),
// siempre con source_type = paper. El ajuste de semana y search_methodology
// no pasan por aquí.

import { ingestDocument, type IngestInput, type IngestResult } from './ingest';
import {
  archiveDocument,
  getDocumentDetail,
  listDocuments,
  type DocumentDetail,
  type DocumentSummary,
} from './repository';
import { retrieveRelevant, type RetrievedChunk } from './retrieve';
import { PAPER_SOURCE_TYPE } from './schema';

type SqlClient = Parameters<typeof listDocuments>[1];

export type PaperSummary = DocumentSummary;
export type PaperDetail = DocumentDetail;

export async function listPapers(
  coach_id: bigint,
  sqlClient?: SqlClient,
): Promise<PaperSummary[]> {
  return listDocuments({ coach_id, source_types: [PAPER_SOURCE_TYPE] }, sqlClient);
}

export async function getPaperDetail(
  args: { coach_id: bigint; document_id: bigint },
  sqlClient?: SqlClient,
): Promise<PaperDetail | null> {
  const detail = await getDocumentDetail(args, sqlClient);
  if (!detail || detail.source_type !== PAPER_SOURCE_TYPE) return null;
  return detail;
}

export async function archivePaper(
  args: { coach_id: bigint; document_id: bigint },
  sqlClient?: SqlClient,
): Promise<{ archived: boolean }> {
  const paper = await getPaperDetail(args, sqlClient);
  if (!paper) return { archived: false };
  return archiveDocument(args, sqlClient);
}

export async function ingestPaper(
  input: Omit<IngestInput, 'source_type'>,
  sqlClient?: SqlClient,
): Promise<IngestResult> {
  return ingestDocument({ ...input, source_type: PAPER_SOURCE_TYPE }, sqlClient);
}

export async function searchPapers(
  input: { coach_id: bigint; query: string; top_k?: number },
  sqlClient?: SqlClient,
): Promise<RetrievedChunk[]> {
  return retrieveRelevant(
    { ...input, source_types: [PAPER_SOURCE_TYPE] },
    sqlClient,
  );
}
