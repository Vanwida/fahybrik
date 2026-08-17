/**
 * Ruta /api/coach/how-i-work/pdf: sesión obligatoria, coach_id de la sesión,
 * validación del fichero. No toca DB.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/coach/how-i-work', () => ({
  deleteHowIWorkPdf: vi.fn(),
  getHowIWorkPdfBytes: vi.fn(),
  putHowIWorkPdf: vi.fn(),
}));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { deleteHowIWorkPdf, getHowIWorkPdfBytes, putHowIWorkPdf } =
  await import('@/lib/coach/how-i-work');
const { DELETE, GET, POST } = await import('@/app/api/coach/how-i-work/pdf/route');

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

const saved = {
  body_text: null,
  pdf: {
    filename: 'metodo.pdf',
    byte_size: PDF_BYTES.length,
    uploaded_at: '2026-08-17T10:00:00.000Z',
  },
  has_method: true,
  updated_at: '2026-08-17T10:00:00.000Z',
};

function session(coach_id: bigint) {
  return { coach_id } as Awaited<ReturnType<typeof getCoachSession>>;
}

function pdfRequest(file: File | null): Request {
  const form = new FormData();
  if (file) form.set('file', file);
  return new Request('http://localhost/api/coach/how-i-work/pdf', {
    method: 'POST',
    body: form,
  });
}

describe('GET /api/coach/how-i-work/pdf', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset();
    vi.mocked(getHowIWorkPdfBytes).mockReset();
  });

  test('sin sesión: 401', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getHowIWorkPdfBytes).not.toHaveBeenCalled();
  });

  test('lee solo el coach_id de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(42)));
    vi.mocked(getHowIWorkPdfBytes).mockResolvedValue({
      filename: 'metodo.pdf',
      mime: 'application/pdf',
      bytes: PDF_BYTES,
      byte_size: PDF_BYTES.length,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(getHowIWorkPdfBytes).toHaveBeenCalledWith(BigInt(42));
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });

  test('sin PDF: 404', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(1)));
    vi.mocked(getHowIWorkPdfBytes).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });
});

describe('POST /api/coach/how-i-work/pdf', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset();
    vi.mocked(putHowIWorkPdf).mockReset();
  });

  test('sin sesión: 401 y no escribe', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await POST(
      pdfRequest(new File([PDF_BYTES], 'metodo.pdf', { type: 'application/pdf' })),
    );
    expect(res.status).toBe(401);
    expect(putHowIWorkPdf).not.toHaveBeenCalled();
  });

  test('sin file: 400', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(1)));
    const res = await POST(pdfRequest(null));
    expect(res.status).toBe(400);
    expect(putHowIWorkPdf).not.toHaveBeenCalled();
  });

  test('PNG disfrazado: 415 y no escribe', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(7)));
    const res = await POST(
      pdfRequest(new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' })),
    );
    expect(res.status).toBe(415);
    expect(putHowIWorkPdf).not.toHaveBeenCalled();
  });

  test('PDF falso: 422 y no escribe', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(7)));
    const res = await POST(
      pdfRequest(new File([new Uint8Array([1, 2, 3, 4])], 'falso.pdf', { type: 'application/pdf' })),
    );
    expect(res.status).toBe(422);
    expect(putHowIWorkPdf).not.toHaveBeenCalled();
  });

  test('guarda el PDF del coach de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(7)));
    vi.mocked(putHowIWorkPdf).mockResolvedValue(saved);
    const res = await POST(
      pdfRequest(new File([PDF_BYTES], 'Metodo.pdf', { type: 'application/pdf' })),
    );
    expect(res.status).toBe(201);
    expect(putHowIWorkPdf).toHaveBeenCalledWith(BigInt(7), {
      filename: 'Metodo.pdf',
      bytes: PDF_BYTES,
      byte_size: PDF_BYTES.length,
    });
  });
});

describe('DELETE /api/coach/how-i-work/pdf', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset();
    vi.mocked(deleteHowIWorkPdf).mockReset();
  });

  test('sin sesión: 401 y no borra', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await DELETE();
    expect(res.status).toBe(401);
    expect(deleteHowIWorkPdf).not.toHaveBeenCalled();
  });

  test('borra el PDF del coach de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(3)));
    vi.mocked(deleteHowIWorkPdf).mockResolvedValue({
      body_text: 'Primero estaciones',
      pdf: null,
      has_method: true,
      updated_at: '2026-08-17T11:00:00.000Z',
    });
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(deleteHowIWorkPdf).toHaveBeenCalledWith(BigInt(3));
  });
});
