// El editor de Ajustes › Método › Analíticas contra la RUTA y la base REAL:
// lo que el editor confirma (minutos, comas, escaleras) viaja por
// `PUT /api/coach/analytics-method`, se guarda en `coach_analytics_method` y
// vuelve idéntico; las reglas del método se rechazan con su frase y sin tocar
// lo guardado; y los rangos del esquema Zod no discrepan de los CHECK de la
// tabla (un 500 aquí sería un rango que el esquema admite y la tabla no).
// La capa de librería (upsert, reset, CHECK por columna) ya la cubre
// `tests/analytics/metodo-umbrales.db.test.ts`; el editor puro,
// `metodo-analiticas.test.ts`.

import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import {
  ANALYTICS_METHOD_BOUNDS,
  COACH_ANALYTICS_METHOD_INTEGER_KEYS,
  COACH_ANALYTICS_METHOD_LIST_KEYS,
  COACH_ANALYTICS_METHOD_NUMERIC_KEYS,
  defaultCoachAnalyticsMethod,
  validarMetodoAnalitico,
  type CoachAnalyticsMethod,
} from '@fahybrid/shared/domain/analytics/metodo';
import { FAMILIAS } from '@fahybrid/shared/domain/analytics/lectura';
import { alternarFamilia, candidatoDe, draftOf } from '@/components/v2/ajustes/metodo-analiticas/modelo';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
const { getCoachSession } = await import('@/lib/auth/coach-session');
const route = await import('@/app/api/coach/analytics-method/route');

type Setting = { method: CoachAnalyticsMethod; is_custom: boolean; defaults: CoachAnalyticsMethod; list_keys: string[] };
type Fallo = { error: { code: string; message: string } };

const req = (method: string, body: unknown) =>
  new Request('http://x', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describeWithDb('Ajustes › Método › Analíticas · ruta y base reales', () => {
  const sql = getTestSql();
  let a: Fixture;
  let b: Fixture;
  const como = (fx: Fixture) => vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(fx.coachId) } as never);
  const put = (body: unknown) => route.PUT(req('PUT', body));
  const leer = async (): Promise<Setting> => (await route.GET()).json();
  const filas = async (fx: Fixture): Promise<number> => {
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from coach_analytics_method where coach_id = ${fx.coachId}`;
    return row!.n;
  };
  const guardar = async (m: CoachAnalyticsMethod): Promise<Setting> => {
    const res = await put({ method: m });
    expect(res.status).toBe(200);
    return res.json();
  };

  beforeAll(async () => {
    a = await makeCoachAndAthlete(sql);
    b = await makeCoachAndAthlete(sql);
  });

  beforeEach(async () => {
    await sql`delete from coach_analytics_method where coach_id in (${a.coachId}, ${b.coachId})`;
    como(a);
  });

  afterAll(async () => {
    await sql`delete from coach_analytics_method where coach_id in (${a.coachId}, ${b.coachId})`;
    await a.cleanup();
    await b.cleanup();
    await closeTestSql();
  });

  test('sin fila: los defectos, «no es suyo», y el contrato que lee el editor', async () => {
    const s = await leer();
    expect(s.is_custom).toBe(false);
    expect(s.method).toEqual(defaultCoachAnalyticsMethod());
    expect(s.defaults).toEqual(defaultCoachAnalyticsMethod());
    expect(s.list_keys).toEqual([...COACH_ANALYTICS_METHOD_LIST_KEYS]);
    expect(await filas(a)).toBe(0);
  });

  test('lo que confirma el editor (minutos y comas) se guarda en las unidades del método y vuelve idéntico', async () => {
    const vigente = (await leer()).method;
    const candidato = candidatoDe(
      { cs_min_duration_s: '3', cs_max_duration_s: '12,5', fuerza_coeficiente: '1,25', cambio_sueno_horas: '0,5' },
      vigente,
    );
    expect(candidato.ok).toBe(true);
    if (!candidato.ok) return;

    const guardado = await guardar(candidato.method);
    expect(guardado.is_custom).toBe(true);
    expect([guardado.method.cs_min_duration_s, guardado.method.cs_max_duration_s]).toEqual([180, 750]);
    expect([guardado.method.fuerza_coeficiente, guardado.method.cambio_sueno_horas]).toEqual([1.25, 0.5]);
    for (const clave of COACH_ANALYTICS_METHOD_NUMERIC_KEYS) expect(typeof guardado.method[clave], clave).toBe('number');
    expect(await filas(a)).toBe(1);

    // Lo que la base devuelve, vuelto a mostrar y vuelto a confirmar, no cambia nada.
    const borrador = draftOf(guardado.method);
    expect([borrador.cs_min_duration_s, borrador.cs_max_duration_s, borrador.fuerza_coeficiente]).toEqual(['3', '12,5', '1,25']);
    const otraVez = candidatoDe(borrador, guardado.method);
    expect(otraVez.ok && otraVez.method).toEqual(guardado.method);
  });

  test('el orden de las escaleras y el conjunto de familias se conservan tal cual', async () => {
    const d = defaultCoachAnalyticsMethod();
    const propio: CoachAnalyticsMethod = {
      ...d,
      fuentes_run: [...d.fuentes_run].reverse(),
      cumplimiento_sesion_bases: [...d.cumplimiento_sesion_bases].reverse(),
      polarizacion_familias: alternarFamilia(d.polarizacion_familias, FAMILIAS.find((f) => !d.polarizacion_familias.includes(f)) ?? FAMILIAS[0]!),
    };
    expect(validarMetodoAnalitico(propio)).toEqual([]);
    const guardado = await guardar(propio);
    expect(guardado.method.fuentes_run).toEqual(propio.fuentes_run);
    expect(guardado.method.cumplimiento_sesion_bases).toEqual(propio.cumplimiento_sesion_bases);
    expect(guardado.method.polarizacion_familias).toEqual(propio.polarizacion_familias);
    expect((await leer()).method).toEqual(propio);
  });

  test('«Restaurar todo» borra la fila, y «Deshacer» la vuelve a poner igual', async () => {
    const propio = { ...defaultCoachAnalyticsMethod(), ctl_days: 28, cumplimiento_verde_min_pct: 85 };
    await guardar(propio);

    const res = await put({ method: null });
    expect(res.status).toBe(200);
    const restaurado: Setting = await res.json();
    expect(restaurado.is_custom).toBe(false);
    expect(restaurado.method).toEqual(defaultCoachAnalyticsMethod());
    expect(await filas(a)).toBe(0);

    const deshecho = await guardar(propio);
    expect(deshecho.is_custom).toBe(true);
    expect(deshecho.method).toEqual(propio);
  });

  test('una regla cruzada rota se rechaza con su frase y lo guardado no se toca', async () => {
    const propio = { ...defaultCoachAnalyticsMethod(), ctl_days: 28 };
    await guardar(propio);

    // Cada valor cabe en su rango (fondo 14–90, reciente 3–21): solo el par rompe la regla.
    const recienteMayorQueFondo = await put({ method: { ...propio, ctl_days: 14, atl_days: 21 } });
    expect(recienteMayorQueFondo.status).toBe(422);
    expect(((await recienteMayorQueFondo.json()) as Fallo).error.message).toBe(
      'Los días de lo reciente tienen que ser menos que los del fondo.',
    );

    const bandasDesordenadas = await put({ method: { ...propio, frescura_optimo_hasta: -40 } });
    expect(bandasDesordenadas.status).toBe(422);
    expect(((await bandasDesordenadas.json()) as Fallo).error.message).toBe(
      'Las bandas de frescura tienen que ir de menor a mayor: sobrecarga, óptimo, mantener, fresco.',
    );

    const ventanaImposible = await put({ method: { ...propio, cs_min_duration_s: 600, cs_max_duration_s: 300 } });
    expect(ventanaImposible.status).toBe(422);

    expect((await leer()).method).toEqual(propio);
  });

  test('fuera de rango, decimal en un entero, clave ajena, campo que falta o peldaño ajeno: 422 y nada se guarda', async () => {
    const d = defaultCoachAnalyticsMethod();
    const incompleto: Partial<CoachAnalyticsMethod> = { ...d };
    delete incompleto.ctl_days;
    const casos: Array<[string, unknown, RegExp | string]> = [
      ['fuera de rango', { ...d, ctl_days: 5 }, 'Entre 14 y 90.'],
      ['decimal en un entero', { ...d, ctl_days: 30.5 }, 'Un número entero.'],
      ['clave ajena', { ...d, campo_ajeno: 1 }, /Campo no admitido/],
      ['campo que falta', incompleto, /ctl_days/],
      ['peldaño fuera del vocabulario', { ...d, fuentes_run: ['vatios'] }, /./],
      ['escalera vacía', { ...d, fuentes_run: [] }, /./],
      ['sin conjunto', {}, /./],
    ];
    for (const [nombre, method, esperado] of casos) {
      const res = await put(nombre === 'sin conjunto' ? method : { method });
      expect(res.status, nombre).toBe(422);
      const { error } = (await res.json()) as Fallo;
      if (typeof esperado === 'string') expect(error.message, nombre).toBe(esperado);
      else expect(error.message, nombre).toMatch(esperado);
    }
    expect(await filas(a)).toBe(0);
  });

  test('cada coach tiene el suyo, y sin sesión no se lee ni se guarda', async () => {
    await guardar({ ...defaultCoachAnalyticsMethod(), ctl_days: 28 });
    como(b);
    expect((await leer()).is_custom).toBe(false);
    expect(await filas(b)).toBe(0);
    await guardar({ ...defaultCoachAnalyticsMethod(), ctl_days: 60 });
    como(a);
    expect((await leer()).method.ctl_days).toBe(28);

    vi.mocked(getCoachSession).mockResolvedValue(null as never);
    expect((await route.GET()).status).toBe(401);
    expect((await put({ method: null })).status).toBe(401);
    expect(await filas(a)).toBe(1);
  });

  test('el esquema y la tabla dicen lo mismo de cada rango: los dos extremos entran, un paso fuera no', async () => {
    const d = defaultCoachAnalyticsMethod();
    let admitidos = 0;
    for (const clave of COACH_ANALYTICS_METHOD_NUMERIC_KEYS) {
      const { min, max } = ANALYTICS_METHOD_BOUNDS[clave];
      const paso = COACH_ANALYTICS_METHOD_INTEGER_KEYS.has(clave) ? 1 : 0.01;

      for (const valor of [min, max]) {
        const candidato = { ...d, [clave]: valor };
        const res = await put({ method: candidato });
        // Un extremo solo puede rechazarlo una regla cruzada (p. ej. lo reciente ≥ el fondo), nunca la tabla.
        const esperado = validarMetodoAnalitico(candidato).length > 0 ? 422 : 200;
        expect(res.status, `${clave} = ${valor}`).toBe(esperado);
        if (esperado === 200) {
          admitidos += 1;
          expect(((await res.json()) as Setting).method[clave], `${clave} = ${valor}`).toBe(valor);
        }
      }
      for (const valor of [min - paso, max + paso]) {
        expect((await put({ method: { ...d, [clave]: valor } })).status, `${clave} = ${valor}`).toBe(422);
      }
    }
    expect(admitidos).toBeGreaterThan(COACH_ANALYTICS_METHOD_NUMERIC_KEYS.length);
  }, 240_000);
});
