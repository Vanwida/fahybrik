import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/rag/ingest', () => ({ ingestDocument: vi.fn() }));
vi.mock('@/lib/rag/retrieve', () => ({ retrieveRelevant: vi.fn() }));
vi.mock('@/lib/rag/repository', () => ({
  listDocuments: vi.fn(),
  getDocumentDetail: vi.fn(),
  archiveDocument: vi.fn(),
}));

const { ingestDocument } = await import('@/lib/rag/ingest');
const { retrieveRelevant } = await import('@/lib/rag/retrieve');
const { archiveDocument, getDocumentDetail, listDocuments } = await import(
  '@/lib/rag/repository'
);
const { archivePaper, getPaperDetail, ingestPaper, listPapers, searchPapers } =
  await import('@/lib/rag/papers');

const COACH = BigInt(7);
const OTHER_DOC = {
  id: '1',
  coach_id: '7',
  title: 'Entrevista',
  source_type: 'interview_transcript' as const,
  ingested_at: '2026-08-17T00:00:00.000Z',
  chunk_count: 2,
  byte_size: null,
  mime_type: null,
  archived_at: null,
  raw_content: 'método',
  file_url: null,
  chunks: [],
};

describe('papers fuerza source_type paper', () => {
  beforeEach(() => {
    vi.mocked(ingestDocument).mockReset();
    vi.mocked(retrieveRelevant).mockReset();
    vi.mocked(listDocuments).mockReset();
    vi.mocked(getDocumentDetail).mockReset();
    vi.mocked(archiveDocument).mockReset();
  });

  test('ingestPaper sella paper y no deja elegir otro tipo', async () => {
    vi.mocked(ingestDocument).mockResolvedValue({
      document_id: BigInt(9),
      chunk_count: 1,
      model_tag: 'test:embed',
    });
    await ingestPaper({ coach_id: COACH, title: 'Z2', raw_content: 'zona 2' });
    expect(ingestDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        coach_id: COACH,
        title: 'Z2',
        raw_content: 'zona 2',
        source_type: 'paper',
      }),
      undefined,
    );
  });

  test('listPapers y searchPapers piden solo paper', async () => {
    vi.mocked(listDocuments).mockResolvedValue([]);
    vi.mocked(retrieveRelevant).mockResolvedValue([]);
    await listPapers(COACH);
    await searchPapers({ coach_id: COACH, query: 'lactato', top_k: 4 });
    expect(listDocuments).toHaveBeenCalledWith(
      { coach_id: COACH, source_types: ['paper'] },
      undefined,
    );
    expect(retrieveRelevant).toHaveBeenCalledWith(
      { coach_id: COACH, query: 'lactato', top_k: 4, source_types: ['paper'] },
      undefined,
    );
  });

  test('un documento de método no es un paper', async () => {
    vi.mocked(getDocumentDetail).mockResolvedValue(OTHER_DOC);
    expect(await getPaperDetail({ coach_id: COACH, document_id: BigInt(1) })).toBeNull();
    expect(await archivePaper({ coach_id: COACH, document_id: BigInt(1) })).toEqual({
      archived: false,
    });
    expect(archiveDocument).not.toHaveBeenCalled();
  });
});
