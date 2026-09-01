// EL ENDPOINT DE LA FICHA — qué deja pasar y qué no.
//
// Lo que se prueba aquí es el PORTERO, no la suma: que un atleta ajeno no
// devuelve una comparación vacía sino un 404, que dos periodos que se pisan se
// rechazan antes de agregar nada (con solape, las mismas semanas se contarían dos
// veces y el número saldría creíble y falso), y que sin fechas contesta con el
// atajo de entrada en vez de con dos calendarios en blanco.
//
// La agregación se sustituye por un doble a propósito: tiene su propio test
// contra base de datos real (`tests/communications/comparativa.db.test.ts`), y
// aquí lo que puede fallar es la validación.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComparePresetDTO } from '@fahybrid/shared/domain/zone-compare';

let session: { coach_id: bigint; user_id: bigint } | null = null;
/** Filas que devuelve la comprobación de propiedad del atleta. */
let propiedad: Array<{ id: string }> = [{ id: '7' }];
/** Con qué se llamó a la suma, para comprobar que NO se llama cuando no toca. */
let pedido: { a_start: string; b_start: string; weeks: number } | null = null;

const PRESETS: ComparePresetDTO[] = [
  {
    key: 'plan',
    label: 'Antes del plan / con el plan',
    a_start: '2026-01-26',
    b_start: '2026-05-04',
    weeks: 14,
    unavailable: null,
  },
  { key: 'alta', label: 'Antes de entrar / después', a_start: null, b_start: null, weeks: null, unavailable: 'No consta cuándo entró.' },
  { key: 'trimestre', label: 'Trimestre anterior / este', a_start: '2026-02-09', b_start: '2026-05-11', weeks: 13, unavailable: null },
];

vi.mock('@/lib/auth/coach-session', () => ({
  getCoachSession: async () => session,
}));

vi.mock('@/lib/db', () => ({
  sql: async () => propiedad,
}));

vi.mock('@/lib/zones/compare', () => ({
  loadComparePresets: async () => ({
    presets: PRESETS,
    contexto: { alta: null, plan: '2026-05-04', hoy: '2026-08-12' },
  }),
  loadZoneComparison: async (args: { a_start: string; b_start: string; weeks: number }) => {
    pedido = { a_start: args.a_start, b_start: args.b_start, weeks: args.weeks };
    return { weeks: args.weeks, a: { week_start: args.a_start }, b: { week_start: args.b_start }, anchor: null };
  },
}));

const { GET } = await import('@/app/api/coach/athletes/[id]/zones/compare/route');

function ctx(id = '7') {
  return { params: Promise.resolve({ id }) };
}

async function pedir(qs: string, id = '7') {
  const res = await GET(new Request(`http://localhost/api/coach/athletes/${id}/zones/compare${qs}`), ctx(id));
  return { res, body: (await res.json()) as Record<string, unknown> };
}

describe('GET /api/coach/athletes/[id]/zones/compare', () => {
  beforeEach(() => {
    session = { coach_id: BigInt(10), user_id: BigInt(1) };
    propiedad = [{ id: '7' }];
    pedido = null;
  });
  afterEach(() => vi.clearAllMocks());

  it('sin sesión no contesta nada', async () => {
    session = null;
    const { res } = await pedir('');
    expect(res.status).toBe(401);
    expect(pedido).toBeNull();
  });

  it('un atleta que no es suyo es un 404, no una comparación vacía', async () => {
    propiedad = [];
    const { res, body } = await pedir('');
    expect(res.status).toBe(404);
    expect((body.error as { code: string }).code).toBe('not_found');
    expect(pedido).toBeNull();
  });

  it('sin fechas contesta con el atajo de entrada, y los atajos viajan siempre', async () => {
    const { res, body } = await pedir('');
    expect(res.status).toBe(200);
    expect(pedido).toEqual({ a_start: '2026-01-26', b_start: '2026-05-04', weeks: 14 });
    expect((body.presets as ComparePresetDTO[]).map((p) => p.key)).toEqual([
      'plan',
      'alta',
      'trimestre',
    ]);
  });

  it('rechaza dos periodos que se pisan ANTES de sumar nada', async () => {
    const { res, body } = await pedir('?a=2026-01-05&b=2026-03-30&weeks=13');
    expect(res.status).toBe(400);
    expect(body.error).toMatchObject({ message: expect.stringMatching(/se pisan/i) });
    expect(pedido).toBeNull();
  });

  it('rechaza una fecha que no es lunes, un largo fuera de rango y medio par', async () => {
    for (const qs of [
      '?a=2026-01-06&b=2026-04-06&weeks=13',
      '?a=2026-01-05&b=2026-04-06&weeks=3',
      '?a=2026-01-05&b=2026-04-06&weeks=27',
      '?a=2026-01-05&weeks=13',
    ]) {
      const { res } = await pedir(qs);
      expect(res.status, qs).toBe(400);
    }
    expect(pedido).toBeNull();
  });

  it('con dos periodos válidos suma exactamente los que se piden', async () => {
    const { res, body } = await pedir('?a=2026-01-05&b=2026-04-06&weeks=13');
    expect(res.status).toBe(200);
    expect(pedido).toEqual({ a_start: '2026-01-05', b_start: '2026-04-06', weeks: 13 });
    expect(body.comparativa).toMatchObject({ weeks: 13 });
    // Los atajos siguen viajando: las pastillas no se vacían al pedir a mano.
    expect((body.presets as ComparePresetDTO[]).length).toBe(3);
  });
});
