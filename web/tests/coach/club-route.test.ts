/**
 * Rutas /api/coach/club: sesión obligatoria, coach_id de la sesión,
 * Zod en el PATCH. El logo no se escribe por aquí.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/coach/club-skin', () => ({
  getClubSkin: vi.fn(),
  updateClubSkin: vi.fn(),
}));
vi.mock('@/lib/coach/club-logo', () => ({
  reserveClubLogoUpload: vi.fn(),
  confirmClubLogo: vi.fn(),
  removeClubLogo: vi.fn(),
}));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { getClubSkin, updateClubSkin } = await import('@/lib/coach/club-skin');
const { confirmClubLogo, removeClubLogo, reserveClubLogoUpload } = await import(
  '@/lib/coach/club-logo'
);
const { GET, PATCH } = await import('@/app/api/coach/club/route');
const { POST: postSubida } = await import('@/app/api/coach/club/logo/subida/route');
const { POST: postConfirmar } = await import('@/app/api/coach/club/logo/confirmar/route');
const { DELETE: deleteLogo } = await import('@/app/api/coach/club/logo/route');

const empty = { name: null, logo_url: null, accent_hex: null, notify_email: null };

function session(coach_id: bigint) {
  return { coach_id } as Awaited<ReturnType<typeof getCoachSession>>;
}

function jsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/coach/club', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset();
    vi.mocked(getClubSkin).mockReset();
    vi.mocked(updateClubSkin).mockReset();
  });

  test('sin sesión: 401 y no lee', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getClubSkin).not.toHaveBeenCalled();
  });

  test('lee solo el coach_id de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(42)));
    vi.mocked(getClubSkin).mockResolvedValue(empty);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(getClubSkin).toHaveBeenCalledWith(BigInt(42));
    const body = (await res.json()) as { club: typeof empty };
    expect(body.club).toEqual(empty);
  });
});

describe('PATCH /api/coach/club', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset();
    vi.mocked(getClubSkin).mockReset();
    vi.mocked(updateClubSkin).mockReset();
  });

  test('sin sesión: 401 y no escribe', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    const res = await PATCH(
      jsonReq('http://localhost/api/coach/club', 'PATCH', { name: 'X' }),
    );
    expect(res.status).toBe(401);
    expect(updateClubSkin).not.toHaveBeenCalled();
  });

  test('JSON inválido: 400', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(1)));
    const res = await PATCH(
      new Request('http://localhost/api/coach/club', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    );
    expect(res.status).toBe(400);
    expect(updateClubSkin).not.toHaveBeenCalled();
  });

  test('cuerpo vacío: 400', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(1)));
    const res = await PATCH(jsonReq('http://localhost/api/coach/club', 'PATCH', {}));
    expect(res.status).toBe(400);
    expect(updateClubSkin).not.toHaveBeenCalled();
  });

  test('rechaza logo_url y coach_id en el cuerpo', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(1)));
    const withLogo = await PATCH(
      jsonReq('http://localhost/api/coach/club', 'PATCH', {
        name: 'X',
        logo_url: 'https://imagedelivery.net/a/b',
      }),
    );
    const withId = await PATCH(
      jsonReq('http://localhost/api/coach/club', 'PATCH', { name: 'X', coach_id: 99 }),
    );
    expect(withLogo.status).toBe(422);
    expect(withId.status).toBe(422);
    expect(updateClubSkin).not.toHaveBeenCalled();
  });

  test('guarda nombre y color del coach de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(7)));
    vi.mocked(updateClubSkin).mockResolvedValue({
      name: 'North Box',
      logo_url: null,
      accent_hex: '#112233',
      notify_email: null,
    });
    const res = await PATCH(
      jsonReq('http://localhost/api/coach/club', 'PATCH', {
        name: 'North Box',
        accent_hex: '#112233',
      }),
    );
    expect(res.status).toBe(200);
    expect(updateClubSkin).toHaveBeenCalledWith(BigInt(7), {
      name: 'North Box',
      accent_hex: '#112233',
    });
  });

  test('guarda el correo de avisos del coach de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(7)));
    vi.mocked(updateClubSkin).mockResolvedValue({
      name: null,
      logo_url: null,
      accent_hex: null,
      notify_email: 'avisos@northbox.test',
    });
    const res = await PATCH(
      jsonReq('http://localhost/api/coach/club', 'PATCH', {
        notify_email: '  Avisos@NorthBox.test  ',
      }),
    );
    expect(res.status).toBe(200);
    expect(updateClubSkin).toHaveBeenCalledWith(BigInt(7), {
      notify_email: 'avisos@northbox.test',
    });
  });

  test('vaciar el correo de avisos es null, no un fallback', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(7)));
    vi.mocked(updateClubSkin).mockResolvedValue({
      name: null,
      logo_url: null,
      accent_hex: null,
      notify_email: null,
    });
    const res = await PATCH(
      jsonReq('http://localhost/api/coach/club', 'PATCH', { notify_email: '' }),
    );
    expect(res.status).toBe(200);
    expect(updateClubSkin).toHaveBeenCalledWith(BigInt(7), { notify_email: null });
  });

  test('correo de avisos que no vale: 422 y no escribe', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(7)));
    const res = await PATCH(
      jsonReq('http://localhost/api/coach/club', 'PATCH', { notify_email: 'hola' }),
    );
    expect(res.status).toBe(422);
    expect(updateClubSkin).not.toHaveBeenCalled();
  });
});

describe('logo /api/coach/club/logo*', () => {
  beforeEach(() => {
    vi.mocked(getCoachSession).mockReset();
    vi.mocked(reserveClubLogoUpload).mockReset();
    vi.mocked(confirmClubLogo).mockReset();
    vi.mocked(removeClubLogo).mockReset();
  });

  test('subida, confirmar y borrar exigen sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(null);
    expect(
      (await postSubida(jsonReq('http://localhost/api/coach/club/logo/subida', 'POST', { filename: 'a.png' }))).status,
    ).toBe(401);
    expect(
      (
        await postConfirmar(
          jsonReq('http://localhost/api/coach/club/logo/confirmar', 'POST', {
            image_id: '76b484a7-fa1a-45be-678c-d86c53e33600',
          }),
        )
      ).status,
    ).toBe(401);
    expect((await deleteLogo()).status).toBe(401);
    expect(reserveClubLogoUpload).not.toHaveBeenCalled();
    expect(confirmClubLogo).not.toHaveBeenCalled();
    expect(removeClubLogo).not.toHaveBeenCalled();
  });

  test('confirmar exige image_id uuid — nunca una URL', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(3)));
    const res = await postConfirmar(
      jsonReq('http://localhost/api/coach/club/logo/confirmar', 'POST', {
        logo_url: 'https://imagedelivery.net/a/b',
      }),
    );
    expect(res.status).toBe(400);
    expect(confirmClubLogo).not.toHaveBeenCalled();
  });

  test('confirmar escribe con el coach_id de la sesión', async () => {
    vi.mocked(getCoachSession).mockResolvedValue(session(BigInt(3)));
    vi.mocked(confirmClubLogo).mockResolvedValue({
      logo_url: 'https://imagedelivery.net/acct/76b484a7-fa1a-45be-678c-d86c53e33600',
    });
    const image_id = '76b484a7-fa1a-45be-678c-d86c53e33600';
    const res = await postConfirmar(
      jsonReq('http://localhost/api/coach/club/logo/confirmar', 'POST', { image_id }),
    );
    expect(res.status).toBe(200);
    expect(confirmClubLogo).toHaveBeenCalledWith({ coach_id: BigInt(3), image_id });
  });
});
