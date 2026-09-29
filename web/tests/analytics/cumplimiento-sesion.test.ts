// El cumplimiento de cada SESIÓN y sus lecturas en el bloque `semanas`
// (shared/domain/analytics/cumplimiento-sesion.ts y cumplimiento.ts), puro:
// cuándo una sesión debida sin hacer es «no hecha» (LA regla de la adherencia, en
// el día local del atleta), contra qué base se compara, su color con las bandas
// del coach, y las tres lecturas con su comparación en puntos, su palabra retirada
// por cobertura y sus cuatro estados.

import { describe, expect, test } from 'vitest';
import {
  anclasVacias,
  cargaPlanificadaDeSesion,
  colorDePct,
  cumplimientoDeSesion,
  defaultCoachAnalyticsMethod,
  distanciaPrescrita,
  lecturasCumplimiento,
  resolverVentana,
  type CoachAnalyticsMethod,
  type ContextoBandas,
  type FilaSesion,
  type ItemPlan,
  type Lectura,
  type PrecioSesion,
  type SesionCumplimiento,
  type SesionPlan,
} from '@fahybrid/shared/domain/analytics';
import { computeAdherence } from '@fahybrid/shared/domain/coach/adherence';
import { seCalla } from '@fahybrid/shared/domain/running/progress';
import { DEFAULT_HR_ZONE_FRACTIONS, STANDARD_ZONES_PER_500M, STANDARD_ZONES_PER_KM } from '@fahybrid/shared/domain/methodology';
import type { Prescription } from '@fahybrid/shared/domain/prescription';

const HOY = '2026-09-29'; // martes

function ctx(metodo: CoachAnalyticsMethod = defaultCoachAnalyticsMethod()): ContextoBandas {
  const anclas = anclasVacias();
  anclas.pulso = { valor: 170, ancla: 'declarada', fuente: 'declarada_atleta', explica_es: '', desde_iso: null };
  return { anclas, fracciones_hr: DEFAULT_HR_ZONE_FRACTIONS, zonas_ritmo: { per_km: [...STANDARD_ZONES_PER_KM], per_500m: [...STANDARD_ZONES_PER_500M] }, metodo, pendiente_retira_ritmo_pct: 3 };
}

const RODAJE: Prescription = { scheme: 'steady', modality: 'mobility', total_s: 1800, target: { kind: 'hr_zone', value: 2 } };

function sesion(id: string, dia: string, over: Partial<SesionCumplimiento> = {}): SesionCumplimiento {
  return { assignment_id: id, dia, titulo: `Sesión ${id}`, estado_plan: 'scheduled', excluida: false, visible: true, ejecucion: null, lineas: [], tramos: [], ...over };
}

function plan(id: string, dia: string, items: Array<Partial<ItemPlan> & { prescripcion: Prescription }>): SesionPlan {
  return { id, dia, items: items.map((i) => ({ modalidad: i.prescripcion.modality ?? null, familia: 'otro', rol: 'principal', ...i })) };
}

function hecho(id: string, dia: string, segundos: number, tss: number, sin_saber_s = 0): PrecioSesion {
  return {
    id,
    dia,
    segundos,
    tss,
    partes: [{ segundos: segundos - sin_saber_s, tss, peldano: 'pulso', ancla: 'declarada' }],
    por_familia: {},
    sin_saber_s,
    sin_saber_con_pulso_s: 0,
    sin_saber_tramos: sin_saber_s > 0 ? 1 : 0,
    tramos: [],
    resto: null,
  };
}

function juzgar(s: SesionCumplimiento, p: SesionPlan | null, h: PrecioSesion | null, metodo = defaultCoachAnalyticsMethod()): FilaSesion | null {
  const c = ctx(metodo);
  return cumplimientoDeSesion(s, { hoy: HOY, metodo, ctx: c, plan: p, precio_plan: p ? cargaPlanificadaDeSesion(p, { anclas: c.anclas, fracciones_hr: c.fracciones_hr }) : null, precio_hecho: h });
}

describe('cuándo una sesión cuenta, y cuándo es «no hecha»', () => {
  test('debida sin hacer desde que termina su día local: no hecha, roja', () => {
    expect(juzgar(sesion('1', '2026-09-28'), null, null)).toMatchObject({ estado: 'no_hecha', color: 'rojo', debida: true, hecha: false });
  });

  test('la de hoy sin hacer aún no se juzga: pendiente, sin color', () => {
    expect(juzgar(sesion('2', HOY), null, null)).toMatchObject({ estado: 'pendiente', color: null, debida: false });
  });

  test('la saltada o marcada perdida: no hecha, y se dice', () => {
    expect(juzgar(sesion('3', '2026-09-27', { estado_plan: 'skipped' }), null, null)).toMatchObject({ estado: 'no_hecha', saltada: true });
  });

  test('en una pausa o un descanso por lesión: excluida, nunca debida', () => {
    expect(juzgar(sesion('4', '2026-09-26', { excluida: true }), null, null)).toMatchObject({ estado: 'excluida', debida: false });
  });

  test('de una semana en borrador: sin hacer no existe (no la podía ver); hecha, cuenta', () => {
    expect(juzgar(sesion('5', '2026-09-25', { visible: false }), null, null)).toBeNull();
    const h = juzgar(sesion('6', '2026-09-25', { visible: false, estado_plan: 'completed', ejecucion: { id: 'e6', dia: '2026-09-25', segundos: 1800, metros: null } }), null, null);
    expect(h).toMatchObject({ debida: true, hecha: true });
  });

  test('es la MISMA regla que la adherencia de todas las superficies', () => {
    const s = sesion('7', '2026-09-20');
    const adh = computeAdherence([{ scheduled_for: s.dia, status: s.estado_plan, executed: false }], HOY, 10);
    expect(adh).toMatchObject({ due: 1, done: 0 });
    expect(juzgar(s, null, null)).toMatchObject({ debida: true, hecha: false });
  });

  test('marcada hecha sin ejecución: hecha, sin medida con la que comparar', () => {
    const r = juzgar(sesion('8', '2026-09-27', { estado_plan: 'completed' }), plan('8', '2026-09-27', [{ prescripcion: RODAJE }]), null);
    expect(r).toMatchObject({ estado: 'hecha_sin_medida', color: null, hecha: true });
    expect(r!.tramos.detalle).toBe('sin_ejecucion');
  });
});

describe('contra qué base se compara', () => {
  const ejec = { id: 'e', dia: '2026-09-27', segundos: 1800, metros: null };

  test('carga, si el plan la sabe y lo hecho llega a la cobertura del coach', () => {
    const p = plan('10', '2026-09-27', [{ prescripcion: RODAJE }]);
    const precioPlan = cargaPlanificadaDeSesion(p, { anclas: ctx().anclas, fracciones_hr: DEFAULT_HR_ZONE_FRACTIONS });
    const r = juzgar(sesion('10', '2026-09-27', { estado_plan: 'completed', ejecucion: ejec }), p, hecho('e', '2026-09-27', 1800, precioPlan.tss_conocido * 0.9))!;
    expect(r).toMatchObject({ base: 'carga', unidad: 'tss', color: 'verde', estado: 'cumplida', ancla: 'declarada' });
    expect(r.pct).toBeCloseTo(90, 6);
  });

  test('con lo hecho sin saber por debajo de la cobertura, pasa a la duración', () => {
    const p = plan('11', '2026-09-27', [{ prescripcion: RODAJE }]);
    const r = juzgar(sesion('11', '2026-09-27', { estado_plan: 'completed', ejecucion: { ...ejec, segundos: 1200 } }), p, hecho('e', '2026-09-27', 1200, 10, 600))!;
    expect(r.bases.find((b) => b.base === 'carga')).toMatchObject({ comparable: false, motivo: 'hecho_sin_saber' });
    expect(r).toMatchObject({ base: 'duracion', plan: 1800, hecho: 1200, color: 'ambar', estado: 'desviada' });
  });

  test('el orden de las bases es del coach', () => {
    const m = { ...defaultCoachAnalyticsMethod(), cumplimiento_sesion_bases: ['duracion' as const, 'carga' as const] };
    const p = plan('12', '2026-09-27', [{ prescripcion: RODAJE }]);
    const r = juzgar(sesion('12', '2026-09-27', { estado_plan: 'completed', ejecucion: ejec }), p, hecho('e', '2026-09-27', 1800, 1), m)!;
    expect(r.base).toBe('duracion');
    expect(r.pct).toBe(100);
    // la base que el coach no usa se ve al final, pero no gana
    const soloDistancia = juzgar(sesion('12', '2026-09-27', { estado_plan: 'completed', ejecucion: ejec }), p, hecho('e', '2026-09-27', 1800, 1), { ...m, cumplimiento_sesion_bases: ['distancia'] })!;
    expect(soloDistancia.bases.map((b) => b.base)).toEqual(['distancia', 'carga', 'duracion']);
    expect(soloDistancia).toMatchObject({ estado: 'hecha_sin_medida', base: null });
  });

  test('lo accesorio sin reloj deja el plan como suelo, y se dice', () => {
    const p = plan('13', '2026-09-27', [{ prescripcion: RODAJE }, { prescripcion: { scheme: 'sets', modality: 'mobility', sets: [{ measure: { kind: 'reps', value: 10 } }] }, rol: 'vuelta' }]);
    const r = juzgar(sesion('13', '2026-09-27', { estado_plan: 'completed', ejecucion: ejec }), p, null, { ...defaultCoachAnalyticsMethod(), cumplimiento_sesion_bases: ['duracion'] })!;
    expect(r).toMatchObject({ base: 'duracion', plan_minimo: true });
  });

  test('sin ninguna base que sepan las dos partes: hecha sin medida', () => {
    const p = plan('14', '2026-09-27', [{ prescripcion: { scheme: 'sets', modality: 'strength', sets: [{ measure: { kind: 'reps', value: 5 }, target: { kind: 'rir', value: 2 } }] } }]);
    expect(juzgar(sesion('14', '2026-09-27', { estado_plan: 'completed', ejecucion: ejec }), p, null)).toMatchObject({ estado: 'hecha_sin_medida', base: null });
  });

  test('la distancia solo si el principal la escribe entera: un trote por tiempo la deja sin saber', () => {
    expect(distanciaPrescrita({ scheme: 'intervals', modality: 'run', rounds: 5, rest_s: 90, sets: [{ measure: { kind: 'distance', meters: 1000 } }] }, 'run')).toEqual({ metros: 5000, completa: true });
    expect(
      distanciaPrescrita(
        { scheme: 'intervals', modality: 'run', structure: [{ role: 'main', elements: [{ times: 5, elements: [{ kind: 'work', measure: { type: 'distance', m: 1000 }, target: null }, { kind: 'recovery', measure: { type: 'duration', s: 180 }, target: null, recovery_mode: 'trote' }] }] }] },
        'run',
      ),
    ).toEqual({ metros: 5000, completa: false });
    expect(distanciaPrescrita({ scheme: 'sets', modality: 'strength', sets: [{ measure: { kind: 'reps', value: 5 } }] }, 'strength')).toBeNull();
  });
});

describe('el color de una sesión, con las bandas del coach', () => {
  const m = defaultCoachAnalyticsMethod();
  test('los bordes de mercado, inclusivos', () => {
    expect(colorDePct(80, m).color).toBe('verde');
    expect(colorDePct(120, m).color).toBe('verde');
    expect(colorDePct(79.9, m)).toEqual({ color: 'ambar', estado: 'desviada' });
    expect(colorDePct(120.1, m).color).toBe('ambar');
    expect(colorDePct(50, m).color).toBe('ambar');
    expect(colorDePct(150, m).color).toBe('ambar');
    expect(colorDePct(49.9, m)).toEqual({ color: 'rojo', estado: 'fuera' });
    expect(colorDePct(150.1, m).color).toBe('rojo');
  });

  test('otras bandas, otro color', () => {
    expect(colorDePct(85, { ...m, cumplimiento_verde_min_pct: 90 }).color).toBe('ambar');
  });
});

// ── Las lecturas ────────────────────────────────────────────────────────────

function lectura(ls: readonly Lectura[], id: string): Lectura {
  const l = ls.find((x) => x.id === id);
  if (!l) throw new Error(`falta ${id}`);
  return l;
}

const SIN_PLAN = { sesiones: 3, segundos: 5400, tss: 120 };

describe('las lecturas del bloque semanas', () => {
  const ventana = resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: '2026-01-01' });
  const ejec = (d: string) => ({ id: `e${d}`, dia: d, segundos: 1800, metros: null });

  // Ventana: 4 debidas (3 hechas). Periodo anterior: 2 debidas (1 hecha).
  const sesiones: SesionCumplimiento[] = [
    sesion('a', '2026-09-28', { estado_plan: 'completed', ejecucion: ejec('2026-09-28') }),
    sesion('b', '2026-09-22', { estado_plan: 'completed', ejecucion: ejec('2026-09-22') }),
    sesion('c', '2026-09-15', { estado_plan: 'partial', ejecucion: ejec('2026-09-15') }),
    sesion('d', '2026-09-10'),
    sesion('e', HOY),
    sesion('f', '2026-08-20', { estado_plan: 'completed', ejecucion: ejec('2026-08-20') }),
    sesion('g', '2026-08-18'),
  ];
  const filas = sesiones.map((s) => juzgar(s, null, null)).filter((f): f is FilaSesion => f != null);
  const ls = lecturasCumplimiento({ hoy: HOY, ventana, metodo: defaultCoachAnalyticsMethod(), sesiones: filas, sin_plan: SIN_PLAN });

  test('tres lecturas con ids estables', () => {
    expect(ls.map((l) => l.id)).toEqual(['semanas.cumplimiento', 'semanas.adherencia', 'semanas.tramos']);
    expect(ls.every((l) => l.grupo === 'semanas')).toBe(true);
  });

  test('la adherencia: LA de siempre (entera), comparada en PUNTOS con el umbral del coach', () => {
    const a = lectura(ls, 'semanas.adherencia');
    expect(a.dato).toMatchObject({ valor: 75, unidad: 'pct' });
    expect(a.comparacion).toMatchObject({ anterior: 50, delta: 25, unidad: 'puntos', cambio_minimo: 10, significativo: true });
    expect(a.reparto!.partes.map((p) => [p.code, p.valor])).toEqual([['hechas', 3], ['no_hechas', 1]]);
    expect(a.cobertura).toMatchObject({ muestras: 4, dias_ventana: 28, falta: null });
  });

  test('la palabra con los cortes del coach (bien 90, regular 70)', () => {
    expect(lectura(ls, 'semanas.adherencia').veredicto).toMatchObject({ code: 'regular', tono: 'atencion' });
    const otro = lecturasCumplimiento({ hoy: HOY, ventana, metodo: { ...defaultCoachAnalyticsMethod(), cumplimiento_bien_pct: 75 }, sesiones: filas, sin_plan: SIN_PLAN });
    expect(lectura(otro, 'semanas.adherencia').veredicto).toMatchObject({ code: 'bien', tono: 'bien' });
  });

  test('la serie por semana del atleta, con la misma regla (null = nada que medir)', () => {
    const serie = lectura(ls, 'semanas.adherencia').serie!;
    expect(serie.puntos).toEqual([
      { t: '2026-08-31', v: null },
      { t: '2026-09-07', v: 0 },
      { t: '2026-09-14', v: 100 },
      { t: '2026-09-21', v: 100 },
      { t: '2026-09-28', v: 100 },
    ]);
    expect(serie.referencias!.map((r) => r.valor)).toEqual([90, 70]);
  });

  test('el cumplimiento por sesión: la base del coach, y cuántas de cada color con el gris de lo hecho sin plan', () => {
    const c = lectura(ls, 'semanas.cumplimiento');
    expect(c.dato!.valor).toBe(lectura(ls, 'semanas.adherencia').dato!.valor);
    expect(c.procedencia.de).toBe('adherencia_debidas');
    expect(Object.fromEntries(c.reparto!.partes.map((p) => [p.code, p.valor]))).toEqual({
      cumplida: 0,
      desviada: 0,
      fuera: 0,
      no_hecha: 1,
      hecha_sin_medida: 3,
      sin_plan: 3,
    });
    expect(c.reparto!.total).toBe(7);
  });

  test('sin tramos grabados: el número no existe, y la falta es de registro', () => {
    const t = lectura(ls, 'semanas.tramos');
    expect(t.estado).toBe('sin_dato');
    expect(t.cobertura.falta).toEqual({ por: 'dispositivo' });
  });
});

describe('los tramos en su banda, y la palabra que se retira', () => {
  const ventana = resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: '2026-01-01' });
  const linea = (id: string) => ({ template_segment_id: id, bloque: 0, posicion: 0, formato: 'steady', prescripcion: RODAJE, modalidad: 'mobility', familia: 'otro' as const, rol: 'principal' as const, ejercicio: null });
  const conTramo = (id: string, dia: string, pulso: number | null): SesionCumplimiento =>
    sesion(id, dia, {
      estado_plan: 'completed',
      ejecucion: { id: `e${id}`, dia, segundos: 1800, metros: null },
      lineas: [linea(`L${id}`)],
      tramos: [
        {
          id: `t${id}`, template_segment_id: `L${id}`, posicion: 0, segundos: 1800, metros: null, ritmo_s_km: null, split_s_500m: null, vatios: null,
          pulso_medio: pulso, inclinacion_pct: null, pendiente_pct: null, reps: null, reps_prescritas: null, kg: null, calorias: null, rondas: null, rondas_prescritas: null,
          pierna: null, papel_pierna: null, ronda: null, modalidad: 'other', series: [],
        },
      ],
    });
  const filas = [conTramo('1', '2026-09-28', 145), conTramo('2', '2026-09-22', 160), conTramo('3', '2026-09-15', null)]
    .map((s) => juzgar(s, null, null))
    .filter((f): f is FilaSesion => f != null);

  test('de tres tramos, dos juzgables: el número sí, la palabra no (cobertura bajo la del coach)', () => {
    const t = lectura(lecturasCumplimiento({ hoy: HOY, ventana, metodo: defaultCoachAnalyticsMethod(), sesiones: filas, sin_plan: SIN_PLAN }), 'semanas.tramos');
    expect(t.dato!.valor).toBe(50);
    expect(t.veredicto).toBeNull();
    expect(t.cobertura.falta).toEqual({ por: 'dispositivo' });
    expect(t.procedencia).toMatchObject({ ancla: 'declarada' });
    expect(t.procedencia.explica_es).toMatch(/2 de 3 tramos/);
    expect(Object.fromEntries(t.reparto!.partes.map((p) => [p.code, p.valor]))).toMatchObject({ dentro: 1, por_encima: 1, sin_dato: 1 });
  });

  test('con la cobertura mínima del coach más baja, la palabra vuelve', () => {
    const metodo = { ...defaultCoachAnalyticsMethod(), cobertura_veredicto_min_pct: 50 };
    const t = lectura(lecturasCumplimiento({ hoy: HOY, ventana, metodo, sesiones: filas, sin_plan: SIN_PLAN }), 'semanas.tramos');
    expect(t.veredicto).toMatchObject({ code: 'bajo', frase_es: expect.stringMatching(/2 de 3 tramos/) });
    expect(t.cobertura.falta).toBeNull();
  });

  test('la base «tramos» del coach pone ESE número en la cabecera', () => {
    const metodo = { ...defaultCoachAnalyticsMethod(), cumplimiento_base: 'tramos' as const };
    const ls = lecturasCumplimiento({ hoy: HOY, ventana, metodo, sesiones: filas, sin_plan: SIN_PLAN });
    expect(lectura(ls, 'semanas.cumplimiento').dato!.valor).toBe(50);
    expect(lectura(ls, 'semanas.cumplimiento').procedencia.de).toBe('cumplimiento_tramos');
  });
});

describe('la base «carga»: lo hecho frente a lo planificado de lo que tocaba', () => {
  const ventana = resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: '2026-01-01' });
  const metodo = { ...defaultCoachAnalyticsMethod(), cumplimiento_base: 'carga' as const };
  const c = ctx(metodo);
  const p1 = plan('1', '2026-09-28', [{ prescripcion: RODAJE }]);
  const p2 = plan('2', '2026-09-22', [{ prescripcion: RODAJE }]);
  const tssPlan = cargaPlanificadaDeSesion(p1, { anclas: c.anclas, fracciones_hr: c.fracciones_hr }).tss_conocido;
  const filas = [
    juzgar(sesion('1', '2026-09-28', { estado_plan: 'completed', ejecucion: { id: 'e1', dia: '2026-09-28', segundos: 1800, metros: null } }), p1, hecho('e1', '2026-09-28', 1800, tssPlan * 0.9), metodo)!,
    juzgar(sesion('2', '2026-09-22'), p2, null, metodo)!,
  ];

  test('una sesión sin hacer suma su plan y nada de lo hecho', () => {
    const l = lectura(lecturasCumplimiento({ hoy: HOY, ventana, metodo, sesiones: filas, sin_plan: SIN_PLAN }), 'semanas.cumplimiento');
    expect(l.dato!.valor).toBeCloseTo(45, 6);
    expect(l.procedencia).toMatchObject({ de: 'cumplimiento_carga', ancla: 'declarada' });
    expect(l.veredicto).toMatchObject({ code: 'bajo' });
  });
});

describe('los cuatro estados', () => {
  test('vacío: sin plan en la ventana, las tres sin dato por «plan» (lo resuelve el coach, no se calla)', () => {
    const ventana = resolverVentana({ clave: '12s', hoy_local: HOY, primera_sesion_iso: null });
    const ls = lecturasCumplimiento({ hoy: HOY, ventana, metodo: defaultCoachAnalyticsMethod(), sesiones: [], sin_plan: { sesiones: 0, segundos: 0, tss: null } });
    expect(ls.map((l) => [l.estado, l.cobertura.falta])).toEqual([
      ['sin_dato', { por: 'plan' }],
      ['sin_dato', { por: 'plan' }],
      ['sin_dato', { por: 'plan' }],
    ]);
    expect(seCalla({ por: 'plan' })).toBe(false);
  });

  test('con plan y nada hecho: 0 % de adherencia (no «sin dato»), y los tramos se callan (no hubo ocasión)', () => {
    const ventana = resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: null });
    const filas = [sesion('x', '2026-09-20'), sesion('y', '2026-09-21')].map((s) => juzgar(s, null, null)!);
    const ls = lecturasCumplimiento({ hoy: HOY, ventana, metodo: defaultCoachAnalyticsMethod(), sesiones: filas, sin_plan: { sesiones: 0, segundos: 0, tss: null } });
    expect(lectura(ls, 'semanas.adherencia').dato!.valor).toBe(0);
    const t = lectura(ls, 'semanas.tramos');
    expect(t.cobertura.falta).toEqual({ por: 'ocasion' });
    expect(seCalla(t.cobertura.falta!)).toBe(true);
  });

  test('«todo» no compara con un periodo anterior', () => {
    const ventana = resolverVentana({ clave: 'todo', hoy_local: HOY, primera_sesion_iso: '2026-09-01' });
    const filas = [sesion('x', '2026-09-20', { estado_plan: 'completed', ejecucion: { id: 'ex', dia: '2026-09-20', segundos: 60, metros: null } })].map((s) => juzgar(s, null, null)!);
    const ls = lecturasCumplimiento({ hoy: HOY, ventana, metodo: defaultCoachAnalyticsMethod(), sesiones: filas, sin_plan: SIN_PLAN });
    expect(lectura(ls, 'semanas.adherencia')).toMatchObject({ comparacion: null, dato: { valor: 100 } });
  });
});
