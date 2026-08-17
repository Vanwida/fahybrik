/**
 * /api/coach/papers: sesión, coach_id de la sesión, source_type lo pone el servidor.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/rag/papers', () => ({
  listPapers: vi.fn(),
  ingestPaper: vi.fn(),
  searchPapers: vi.fn(),
  getPaperDetail: vi.fn(),
  archivePaper: vi.fn(),
}));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { archivePaper, getPaperDetail, ingestPaper, listPapers, searchPapers } =
  await import('@/lib/rag/papers');
const { GET, POST } = await import('@/app/api/coach/papers/route');
const { GET: GET_ONE, DELETE } = await import('@/app/api/coach/papers/[id]/route');
const { POST: SEARCH } = await import('@/app/api/coach/papers/search/route');

function session(coach_id: bigint) {
  return { coach_id } as Awaited<ReturnType<typeof getCoachSession>>;
}

describe('GET /api/coach/papers', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset();
    vi.mocked(listPapers).mockReset();
  });

  test('sin sesión: 401', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listPapers).not.toHaveBeenCalled();
  });

  test('lista solo con el coach_id de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(42)));
    vi.mocked(listPapers).mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(listPapers).toHaveBeenCalledWith(BigInt(42));
    const body = (await res.json()) as { papers: unknown[] };
    expect(body.papers).toEqual([]);
  });
});

describe('POST /api/coach/papers', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset();
    vi.mocked(ingestPaper).mockReset();
  });

  test('sin sesión: 401', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await POST(
      new Request('http://localhost/api/coach/papers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'X', raw_content: 'y' }),
      }),
    );
    expect(res.status).toBe(401);
    expect(ingestPaper).not.toHaveBeenCalled();
  });

  test('JSON: el cliente no elige source_type', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(3)));
    vi.mocked(ingestPaper).mockResolvedValue({
      document_id: BigInt(11),
      chunk_count: 2,
      model_tag: 'test:embed',
    });
    const res = await POST(
      new Request('http://localhost/api/coach/papers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Frente 2025',
          raw_content: 'lactato en stations',
          source_type: 'interview_transcript',
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect(ingestPaper).toHaveBeenCalledWith({
      coach_id: BigInt(3),
      title: 'Frente 2025',
      raw_content: 'lactato en stations',
    });
    const body = (await res.json()) as { document_id: string; chunk_count: number };
    expect(body.document_id).toBe('11');
    expect(body.chunk_count).toBe(2);
  });

  test('multipart sin fichero: 400', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(1)));
    const form = new FormData();
    const res = await POST(
      new Request('http://localhost/api/coach/papers', { method: 'POST', body: form }),
    );
    expect(res.status).toBe(400);
    expect(ingestPaper).not.toHaveBeenCalled();
  });
});

describe('POST /api/coach/papers/search', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset();
    vi.mocked(searchPapers).mockReset();
  });

  test('busca con el coach_id de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(8)));
    vi.mocked(searchPapers).mockResolvedValue([]);
    const res = await SEARCH(
      new Request('http://localhost/api/coach/papers/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'zona 2' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(searchPapers).toHaveBeenCalledWith({
      coach_id: BigInt(8),
      query: 'zona 2',
      top_k: undefined,
    });
  });

  test('query vacía: 400', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(8)));
    const res = await SEARCH(
      new Request('http://localhost/api/coach/papers/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(searchPapers).not.toHaveBeenCalled();
  });
});

describe('GET/DELETE /api/coach/papers/[id]', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset();
    vi.mocked(getPaperDetail).mockReset();
    vi.mocked(archivePaper).mockReset();
  });

  test('un id de método (o de otro coach) es 404', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(2)));
    vi.mocked(getPaperDetail).mockResolvedValue(null);
    const res = await GET_ONE(new Request('http://localhost/api/coach/papers/99'), {
      params: Promise.resolve({ id: '99' }),
    });
    expect(res.status).toBe(404);
    expect(getPaperDetail).toHaveBeenCalledWith({
      coach_id: BigInt(2),
      document_id: BigInt(99),
    });
  });

  test('archivar usa el coach de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(2)));
    vi.mocked(archivePaper).mockResolvedValue({ archived: true });
    const res = await DELETE(new Request('http://localhost/api/coach/papers/5'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(200);
    expect(archivePaper).toHaveBeenCalledWith({
      coach_id: BigInt(2),
      document_id: BigInt(5),
    });
  });
});
