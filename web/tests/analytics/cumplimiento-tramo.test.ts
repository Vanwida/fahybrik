// El cumplimiento por TRAMO (shared/domain/analytics/cumplimiento-*.ts), puro:
// las bandas del atleta con la holgura del coach, los esfuerzos que prescribe una
// línea, el emparejamiento con lo hecho y el veredicto, en todas las modalidades.
// Los casos tienen la forma de las ejecuciones reales de la rama (atleta 64):
// 5×1000 con piernas, fartlek por pulso, fuerza serie a serie, superserie grabada
// entera, remo por rondas plegado, estaciones, EMOM, for time con tope.

import { describe, expect, test } from 'vitest';
import {
  anclasVacias,
  cumplimientoDeLineas,
  defaultCoachAnalyticsMethod,
  esfuerzosDeLinea,
  juzgarEje,
  objetivoDeTarget,
  resolverBanda,
  wattsDeSplit500,
  type AnclasAtleta,
  type Comprobacion,
  type ContextoBandas,
  type FilaTramo,
  type LineaPlan,
  type SerieHecha,
  type TramoEjecutado,
} from '@fahybrid/shared/domain/analytics';
import { DEFAULT_HR_ZONE_FRACTIONS, STANDARD_ZONES_PER_500M, STANDARD_ZONES_PER_KM } from '@fahybrid/shared/domain/methodology';
import type { Prescription } from '@fahybrid/shared/domain/prescription';

// ── Fábricas ────────────────────────────────────────────────────────────────

function anclas(): AnclasAtleta {
  const a = anclasVacias();
  a.pulso = { valor: 170, ancla: 'estimada', fuente: 'from_max_hr', explica_es: '', desde_iso: null };
  a.ritmo.run = { valor: 270, ancla: 'declarada', fuente: 'declarada_atleta', explica_es: '', desde_iso: '2026-06-01' };
  a.ritmo.row = { valor: 120, ancla: 'medida', fuente: 'perfil_test', explica_es: '', desde_iso: '2026-06-01' };
  a.potencia.row = { ...a.ritmo.row, valor: wattsDeSplit500(120)! };
  return a;
}

function ctx(over: Partial<ContextoBandas> = {}): ContextoBandas {
  return {
    anclas: anclas(),
    fracciones_hr: DEFAULT_HR_ZONE_FRACTIONS,
    zonas_ritmo: { per_km: [...STANDARD_ZONES_PER_KM], per_500m: [...STANDARD_ZONES_PER_500M] },
    metodo: defaultCoachAnalyticsMethod(),
    pendiente_retira_ritmo_pct: 3,
    ...over,
  };
}

let id = 0;
function linea(p: Prescription | null, over: Partial<LineaPlan> = {}): LineaPlan {
  id += 1;
  return {
    template_segment_id: `L${id}`,
    bloque: id,
    posicion: id,
    formato: p?.scheme ?? null,
    prescripcion: p,
    modalidad: p?.modality ?? null,
    familia: 'correr',
    rol: 'principal',
    ejercicio: null,
    ...over,
  };
}

function tramo(l: LineaPlan | null, over: Partial<TramoEjecutado> = {}): TramoEjecutado {
  id += 1;
  return {
    id: `T${id}`,
    template_segment_id: l?.template_segment_id ?? null,
    posicion: id,
    segundos: null,
    metros: null,
    ritmo_s_km: null,
    split_s_500m: null,
    vatios: null,
    pulso_medio: null,
    inclinacion_pct: null,
    pendiente_pct: null,
    reps: null,
    kg: null,
    calorias: null,
    rondas: null,
    rondas_prescritas: null,
    pierna: null,
    papel_pierna: null,
    ronda: null,
    modalidad: l?.modalidad ?? null,
    series: [],
    ...over,
  };
}

function serie(indice: number, over: Partial<SerieHecha> = {}): SerieHecha {
  return { indice, reps: null, reps_prescritas: null, kg: null, kg_prescritos: null, rpe: null, rir: null, estado: 'done', ...over };
}

const eje = (t: FilaTramo, e: Comprobacion['eje']) => t.comprobaciones.find((c) => c.eje === e);

// ── Las bandas ──────────────────────────────────────────────────────────────

describe('las bandas del atleta', () => {
  test('una zona en una línea de correr es de RITMO: su umbral y las zonas del coach', () => {
    const r = resolverBanda({ tipo: 'zona_ritmo', desde: 5, hasta: 5 }, 'run', ctx());
    expect(r).toEqual({ banda: { eje: 'ritmo', min: 264, max: 268, zona: { desde: 5, hasta: 5 }, ancla: 'declarada' } });
  });

  test('en una máquina es de split, con el umbral de ESA máquina', () => {
    const r = resolverBanda(objetivoDeTarget({ kind: 'hr_zone', value: 2 }, 'row')!, 'row', ctx());
    expect(r).toEqual({ banda: { eje: 'split', min: 134, max: 141, zona: { desde: 2, hasta: 2 }, ancla: 'medida' } });
  });

  test('en fuerza, movilidad o el resto, una zona es de PULSO; la Z1 no tiene suelo y la Z6 se lee como Z5', () => {
    expect(objetivoDeTarget({ kind: 'hr_zone', value: 2 }, 'mobility')).toEqual({ tipo: 'zona_pulso', desde: 2, hasta: 2 });
    expect(resolverBanda({ tipo: 'zona_pulso', desde: 2, hasta: 2 }, null, ctx())).toEqual({ banda: { eje: 'pulso', min: 139, max: 150, zona: { desde: 2, hasta: 2 }, ancla: 'estimada' } });
    expect(resolverBanda({ tipo: 'zona_pulso', desde: 1, hasta: 1 }, null, ctx())).toMatchObject({ banda: { min: null, max: 138 } });
    expect(resolverBanda({ tipo: 'zona_pulso', desde: 6, hasta: 6 }, null, ctx())).toMatchObject({ banda: { min: 175, max: 195 } });
  });

  test('sin umbral, o con uno de la edad, la banda no se inventa', () => {
    const sin = ctx({ anclas: anclasVacias() });
    expect(resolverBanda({ tipo: 'zona_ritmo', desde: 4, hasta: 4 }, 'run', sin)).toEqual({ motivo: 'sin_ancla' });
    const edad = anclas();
    edad.pulso = { valor: 160, ancla: 'poblacional', fuente: 'from_age', explica_es: '', desde_iso: null };
    expect(resolverBanda({ tipo: 'zona_pulso', desde: 2, hasta: 2 }, null, ctx({ anclas: edad }))).toEqual({ motivo: 'sin_ancla' });
  });

  test('un ritmo por km en una máquina se juzga en split; un %RM sin kilos resueltos no se juzga', () => {
    expect(resolverBanda({ tipo: 'ritmo', unidad: 'per_km', min: 240, max: 250 }, 'row', ctx())).toMatchObject({ banda: { eje: 'split', min: 120, max: 125 } });
    expect(resolverBanda({ tipo: 'pct_rm', min: 65, max: 70 }, 'strength', ctx())).toEqual({ motivo: 'sin_1rm' });
    expect(resolverBanda({ tipo: 'peso_corporal' }, 'strength', ctx())).toBeNull();
  });

  test('la holgura del vivo ensancha la banda; el delta es al borde sin holgura, con signo', () => {
    expect(juzgarEje('ritmo', 262, 264, 268, 3)).toEqual({ veredicto: 'dentro', delta: -2 });
    expect(juzgarEje('ritmo', 260, 264, 268, 3)).toEqual({ veredicto: 'por_encima', delta: -4 });
    expect(juzgarEje('pulso', 155, 139, 150, 2)).toEqual({ veredicto: 'por_encima', delta: 5 });
    expect(juzgarEje('rir', 0, 2, 2, 1)).toEqual({ veredicto: 'por_encima', delta: -2 }); // menos RIR = más cerca del fallo
    expect(juzgarEje('tiempo_tope', 1260, null, 1200, 0)).toEqual({ veredicto: 'por_debajo', delta: 60 });
  });
});

// ── Los esfuerzos de una línea ──────────────────────────────────────────────

describe('los esfuerzos que prescribe una línea', () => {
  test('correr: la estructura desplegada, recuperaciones dentro (el espacio de `leg_index`)', () => {
    const l = linea({ scheme: 'intervals', modality: 'run', rounds: 5, rest_s: 180, target: { kind: 'hr_zone', value: 5 }, sets: [{ measure: { kind: 'distance', meters: 1000 } }] });
    const es = esfuerzosDeLinea(l);
    expect(es.map((e) => e.papel)).toEqual(['trabajo', 'recuperacion', 'trabajo', 'recuperacion', 'trabajo', 'recuperacion', 'trabajo', 'recuperacion', 'trabajo', 'recuperacion']);
    expect(es[0]).toMatchObject({ dosis: { eje: 'distancia', valor: 1000 }, objetivo: { tipo: 'zona_ritmo', desde: 5 }, ordinal: 1 });
    expect(es[1]).toMatchObject({ dosis: { eje: 'tiempo', valor: 180 }, objetivo: null, ordinal: null });
  });

  test('una línea de calentamiento es calentamiento aunque su estructura sembrada sea «main»', () => {
    const l = linea({ scheme: 'warmup', modality: 'run', total_s: 300, target: { kind: 'hr_zone', value: 2 } }, { rol: 'calentamiento' });
    expect(esfuerzosDeLinea(l).map((e) => e.fase)).toEqual(['calentamiento']);
  });

  test('fuerza: rondas × series de trabajo, sin las de aproximación', () => {
    const l = linea(
      { scheme: 'sets', modality: 'strength', sets: [{ measure: { kind: 'reps', value: 5 }, target: { kind: 'kg', value: 60 }, is_approach: true }, { measure: { kind: 'reps', value: 5 }, target: { kind: 'rir', value: 2 } }, { measure: { kind: 'reps', value: 5 }, target: { kind: 'rir', value: 2 } }] },
      { familia: 'fuerza' },
    );
    const es = esfuerzosDeLinea(l);
    expect(es).toHaveLength(2);
    expect(es[0]).toMatchObject({ dosis: { eje: 'reps', valor: 5 }, objetivo: { tipo: 'rir', min: 2, max: 2 } });
  });

  test('un EMOM: rondas × su ventana; un for time: su total_s es TOPE, no ventana', () => {
    expect(esfuerzosDeLinea(linea({ scheme: 'emom', modality: 'ski', rounds: 20, work_s: 45, rest_s: 15 }))).toHaveLength(20);
    const ft = esfuerzosDeLinea(linea({ scheme: 'for_time', modality: 'functional', total_s: 1200 }, { familia: 'wod' }));
    expect(ft).toEqual([expect.objectContaining({ dosis: null })]);
  });
});

// ── Los tramos ──────────────────────────────────────────────────────────────

describe('correr con piernas: 5×1000 a Z5 con 180″ de trote', () => {
  const l = linea({ scheme: 'intervals', modality: 'run', rounds: 5, rest_s: 180, target: { kind: 'hr_zone', value: 5 }, sets: [{ measure: { kind: 'distance', meters: 1000 } }] });
  const pierna = (n: number, over: Partial<TramoEjecutado>) => tramo(l, { pierna: n, ronda: 0, papel_pierna: n % 2 === 0 ? 'work' : 'recovery', modalidad: 'run', ...over });

  const tramos = [
    pierna(0, { segundos: 266, metros: 1000, ritmo_s_km: 266 }), // dentro de 264-268
    pierna(1, { segundos: 200, metros: 280, ritmo_s_km: 714 }), // se pasó del descanso (180 + 10 %)
    pierna(2, { segundos: 259, metros: 1000, ritmo_s_km: 259 }), // más rápido que 264 − 3
    pierna(3, { segundos: 170, metros: 270, ritmo_s_km: 630 }), // controlada
    pierna(4, { segundos: 272, metros: 1000, ritmo_s_km: 272 }), // 268 + 3 = 271 → lento
    pierna(8, { segundos: 1, metros: 1.6, ritmo_s_km: 625 }), // la quinta, cortada
  ];
  const r = cumplimientoDeLineas([l], tramos, ctx());
  const filas = r.lineas[0]!.tramos;

  test('cada pierna es el tramo de la estructura en su índice', () => {
    expect(r.lineas[0]!.estado).toBe('ejecutada');
    expect(filas.map((t) => [t.pierna, t.papel, t.ordinal])).toEqual([
      [0, 'trabajo', 1],
      [1, 'recuperacion', null],
      [2, 'trabajo', 2],
      [3, 'recuperacion', null],
      [4, 'trabajo', 3],
      [8, 'trabajo', 5],
    ]);
  });

  test('la intensidad con la banda de SU umbral y la holgura del coach, con dirección', () => {
    expect(filas.map((t) => t.veredicto)).toEqual(['dentro', 'por_encima', 'por_encima', 'dentro', 'por_debajo', 'por_debajo']);
    expect(eje(filas[0]!, 'ritmo')).toMatchObject({ objetivo: { min: 264, max: 268, zona: { desde: 5, hasta: 5 }, ancla: 'declarada' }, holgura: 3, delta: 0 });
    expect(eje(filas[2]!, 'ritmo')).toMatchObject({ veredicto: 'por_encima', delta: -5 });
    expect(eje(filas[4]!, 'ritmo')).toMatchObject({ veredicto: 'por_debajo', delta: 4 });
  });

  test('la recuperación: solo falla pasarse de tiempo (o ir más intenso); la dosis de trabajo, quedarse corto', () => {
    expect(eje(filas[1]!, 'tiempo')).toMatchObject({ veredicto: 'por_encima', objetivo: { min: 180 }, hecho: 200, delta: 20 });
    expect(eje(filas[3]!, 'tiempo')).toMatchObject({ veredicto: 'dentro', delta: -10 });
    expect(eje(filas[5]!, 'distancia')).toMatchObject({ veredicto: 'por_debajo', hecho: 1.6 });
  });

  test('una cuesta por encima de la del coach retira el ritmo (lo pedido > la cinta > lo medido)', () => {
    const cuesta = cumplimientoDeLineas([l], [pierna(0, { segundos: 300, metros: 1000, ritmo_s_km: 300, inclinacion_pct: 6 })], ctx());
    expect(eje(cuesta.lineas[0]!.tramos[0]!, 'ritmo')).toMatchObject({ veredicto: 'sin_dato', motivo: 'pendiente' });
    const trail = cumplimientoDeLineas([l], [pierna(0, { segundos: 300, metros: 1000, ritmo_s_km: 300, inclinacion_pct: 6 })], ctx({ pendiente_retira_ritmo_pct: 10 }));
    expect(eje(trail.lineas[0]!.tramos[0]!, 'ritmo')).toMatchObject({ veredicto: 'por_debajo' });
  });

  test('si el papel de las piernas no casa con la estructura, no se indexa: cada tramo contra el representativo', () => {
    const flat = cumplimientoDeLineas([l], [pierna(0, { segundos: 266, metros: 1000 }), tramo(l, { pierna: 1, ronda: 0, papel_pierna: 'work', modalidad: 'run', segundos: 270, metros: 1000 })], ctx());
    expect(flat.lineas[0]!.tramos.map((t) => t.papel)).toEqual(['trabajo', 'trabajo']);
    expect(flat.lineas[0]!.tramos.every((t) => eje(t, 'distancia')?.objetivo?.min === 1000)).toBe(true);
  });
});

describe('la intensidad que no se puede juzgar no deja el tramo «dentro»', () => {
  test('sin umbral de ritmo: la dosis cumplida no confirma la banda → sin dato, con su motivo', () => {
    const l = linea({ scheme: 'steady', modality: 'run', total_s: 1800, target: { kind: 'hr_zone', value: 2 } });
    const r = cumplimientoDeLineas([l], [tramo(l, { segundos: 1800, metros: 5000, ritmo_s_km: 360 })], ctx({ anclas: anclasVacias() }));
    expect(r.lineas[0]!.tramos[0]).toMatchObject({ veredicto: 'sin_dato', motivo: 'sin_ancla' });
    expect(eje(r.lineas[0]!.tramos[0]!, 'tiempo')!.veredicto).toBe('dentro');
  });

  test('pero un fallo es un fallo aunque falte la intensidad', () => {
    const l = linea({ scheme: 'steady', modality: 'run', total_s: 1800, target: { kind: 'hr_zone', value: 2 } });
    const r = cumplimientoDeLineas([l], [tramo(l, { segundos: 900, metros: 2500 })], ctx({ anclas: anclasVacias() }));
    expect(r.lineas[0]!.tramos[0]!.veredicto).toBe('por_debajo');
  });

  test('pulso por zona con el umbral estimado: se juzga y se dice su peldaño', () => {
    const l = linea({ scheme: 'steady', modality: 'mobility', total_s: 480, target: { kind: 'hr_zone', value: 2 } }, { familia: 'otro', rol: 'calentamiento' });
    const r = cumplimientoDeLineas([l], [tramo(l, { segundos: 480, pulso_medio: 145, modalidad: 'other' })], ctx());
    expect(eje(r.lineas[0]!.tramos[0]!, 'pulso')).toMatchObject({ veredicto: 'dentro', objetivo: { ancla: 'estimada' } });
  });
});

describe('ergo', () => {
  test('split objetivo y solo vatios medidos: son la misma medida en un Concept2', () => {
    const l = linea({ scheme: 'intervals', modality: 'row', rounds: 1, target: { kind: 'pace', unit: 'per_500m', value_s: 115 }, sets: [{ measure: { kind: 'distance', meters: 500 } }] }, { familia: 'remo' });
    const r = cumplimientoDeLineas([l], [tramo(l, { segundos: 115, metros: 500, vatios: wattsDeSplit500(115)!, modalidad: 'row' })], ctx());
    expect(eje(r.lineas[0]!.tramos[0]!, 'split')).toMatchObject({ veredicto: 'dentro', hecho: 115 });
  });

  test('vatios objetivo y solo el split: se convierte', () => {
    const l = linea({ scheme: 'steady', modality: 'bike', total_s: 600, target: { kind: 'watts', min: 200, max: 220 } }, { familia: 'bici' });
    const r = cumplimientoDeLineas([l], [tramo(l, { segundos: 600, split_s_500m: 110, modalidad: 'bike' })], ctx());
    const c = eje(r.lineas[0]!.tramos[0]!, 'vatios')!;
    expect(c.hecho).toBeCloseTo(wattsDeSplit500(110)!, 6);
    expect(c.veredicto).toBe('por_encima'); // 2,8/(0,22)³ ≈ 263 W
  });

  test('6×400 en rondas grabado en UN tramo: plegado, los metros totales', () => {
    const l = linea({ scheme: 'rounds', modality: 'ski', rest_s: 60, sets: Array.from({ length: 6 }, () => ({ measure: { kind: 'distance' as const, meters: 400 }, target: { kind: 'rpe' as const, value: 8 } })) }, { familia: 'ski' });
    const r = cumplimientoDeLineas([l], [tramo(l, { segundos: 598, metros: 1610.4, modalidad: 'ski' })], ctx());
    const t = r.lineas[0]!.tramos[0]!;
    expect(t.plegado).toBe(true);
    expect(eje(t, 'distancia')).toMatchObject({ objetivo: { min: 2400 }, hecho: 1610.4, veredicto: 'por_debajo' });
    expect(t.veredicto).toBe('por_debajo');
  });
});

describe('fuerza, serie a serie', () => {
  const l = linea({ scheme: 'sets', modality: 'strength', sets: [1, 2, 3, 4].map(() => ({ measure: { kind: 'reps' as const, value: 5 }, target: { kind: 'rir' as const, value: 2 } })) }, { familia: 'fuerza' });

  test('series hechas, reps, kilos resueltos al entrenar y RIR ±1', () => {
    const t = tramo(l, {
      modalidad: 'strength',
      series: [
        serie(0, { reps: 5, reps_prescritas: 5, kg: 100, kg_prescritos: 100, rir: 2 }),
        serie(1, { reps: 5, reps_prescritas: 5, kg: 100, kg_prescritos: 100, rir: 1 }),
        serie(2, { reps: 4, reps_prescritas: 5, kg: 100, kg_prescritos: 100, rir: 0 }),
        serie(3, { estado: 'skipped', reps_prescritas: 5 }),
      ],
    });
    const f = cumplimientoDeLineas([l], [t], ctx()).lineas[0]!.tramos[0]!;
    // la tercera, al fallo (RIR 0 frente a 2 ± 1): más intensa de lo pedido, y corta de reps
    expect(f.series.map((s) => s.veredicto)).toEqual(['dentro', 'dentro', 'por_encima', 'por_debajo']);
    expect(f.series[2]!.comprobaciones.map((c) => [c.eje, c.veredicto])).toEqual([
      ['carga', 'dentro'],
      ['rir', 'por_encima'],
      ['reps', 'por_debajo'],
    ]);
    expect(eje(f, 'series')).toMatchObject({ objetivo: { min: 4 }, hecho: 3, veredicto: 'por_debajo' });
    expect(eje(f, 'reps')).toMatchObject({ objetivo: { min: 20 }, hecho: 14, veredicto: 'por_debajo' });
    // kilos Y esfuerzo: los dos se juzgan (los kilos resueltos al entrenar, el RIR del coach)
    expect(eje(f, 'carga')).toMatchObject({ veredicto: 'dentro', hecho: 100 });
    expect(eje(f, 'rir')).toMatchObject({ veredicto: 'por_encima', objetivo: { min: 2, max: 2 }, holgura: 1 });
    expect(f.veredicto).toBe('por_encima');
  });

  test('sin el RIR anotado: las reps cumplidas no confirman la serie → sin dato (anotar el esfuerzo)', () => {
    const t = tramo(l, { modalidad: 'strength', series: [0, 1, 2, 3].map((i) => serie(i, { reps: 5, reps_prescritas: 5 })) });
    const f = cumplimientoDeLineas([l], [t], ctx()).lineas[0]!.tramos[0]!;
    expect(f).toMatchObject({ veredicto: 'sin_dato', motivo: 'sin_anotar' });
    expect(eje(f, 'series')!.veredicto).toBe('dentro');
  });

  test('una superserie grabada entera: las series de las dos líneas, y la hermana sale cubierta', () => {
    const a = linea({ scheme: 'superset', modality: 'strength', sets: [1, 2, 3, 4].map(() => ({ measure: { kind: 'reps' as const, value: 8 } })) }, { familia: 'fuerza', bloque: 90, formato: 'superset' });
    const b = linea({ scheme: 'superset', modality: 'functional', sets: [1, 2, 3, 4].map(() => ({ measure: { kind: 'reps' as const, value: 6 } })) }, { familia: 'otro', bloque: 90, formato: 'superset' });
    const series = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => serie(i, { reps: i % 2 === 0 ? 8 : 6, reps_prescritas: i % 2 === 0 ? 8 : 6 }));
    const r = cumplimientoDeLineas([a, b], [tramo(a, { modalidad: 'other', series })], ctx());
    expect(r.lineas.map((x) => x.estado)).toEqual(['ejecutada', 'cubierta']);
    const f = r.lineas[0]!.tramos[0]!;
    expect(f.plegado).toBe(true);
    expect(eje(f, 'series')).toMatchObject({ objetivo: { min: 8 }, hecho: 8, veredicto: 'dentro' });
    expect(f.veredicto).toBe('dentro');
  });
});

describe('estaciones y WOD', () => {
  test('una estación hecha sin medidas es «hecha»: la intensidad no bloquea ahí', () => {
    const l = linea({ scheme: 'sets', modality: 'functional', sets: Array.from({ length: 6 }, () => ({ measure: { kind: 'distance' as const, meters: 15 } })) }, { familia: 'estaciones' });
    const f = cumplimientoDeLineas([l], [tramo(l, { segundos: 36, kg: 150, modalidad: 'other' })], ctx()).lineas[0]!.tramos[0]!;
    expect(f.veredicto).toBe('dentro');
    expect(eje(f, 'hecha')!.veredicto).toBe('dentro');
    expect(eje(f, 'distancia')).toMatchObject({ veredicto: 'sin_dato', motivo: 'sin_medida' });
  });

  test('el trineo con sus kilos prescritos: por debajo si movió menos', () => {
    const l = linea({ scheme: 'rounds', modality: 'functional', rest_s: 90, sets: [{ measure: { kind: 'distance', meters: 25 }, target: { kind: 'kg', value: 160 } }] }, { familia: 'estaciones' });
    const f = cumplimientoDeLineas([l], [tramo(l, { segundos: 40, metros: 25, kg: 140, modalidad: 'other' })], ctx()).lineas[0]!.tramos[0]!;
    expect(eje(f, 'carga')).toMatchObject({ veredicto: 'por_debajo', delta: -20 });
  });

  test('un EMOM plegado: los minutos cumplidos y el reloj del formato (rondas × ciclo)', () => {
    const l = linea({ scheme: 'emom', modality: 'ski', rounds: 20, work_s: 45, rest_s: 15 }, { familia: 'wod', formato: 'emom' });
    const f = cumplimientoDeLineas([l], [tramo(l, { segundos: 652, rondas: 10, rondas_prescritas: 20, modalidad: 'other' })], ctx()).lineas[0]!.tramos[0]!;
    expect(eje(f, 'rondas')).toMatchObject({ objetivo: { min: 20 }, hecho: 10, veredicto: 'por_debajo' });
    expect(eje(f, 'tiempo')).toMatchObject({ objetivo: { min: 1200 }, hecho: 652 });
  });

  test('un for time con tope: dentro del tope, o no lo cerró', () => {
    const l = linea({ scheme: 'for_time', modality: 'functional', total_s: 1200 }, { familia: 'wod', formato: 'for_time' });
    expect(eje(cumplimientoDeLineas([l], [tramo(l, { segundos: 1100 })], ctx()).lineas[0]!.tramos[0]!, 'tiempo_tope')!.veredicto).toBe('dentro');
    expect(eje(cumplimientoDeLineas([l], [tramo(l, { segundos: 1260 })], ctx()).lineas[0]!.tramos[0]!, 'tiempo_tope')).toMatchObject({ veredicto: 'por_debajo', delta: 60 });
  });

  test('un bloque de rondas grabado en un tramo cubre a sus hermanas y se juzga como bloque', () => {
    const a = linea({ scheme: 'rounds', modality: 'functional', rounds: 4, rest_s: 90, sets: [{ measure: { kind: 'distance', meters: 25 }, target: { kind: 'kg', value: 135 } }] }, { familia: 'estaciones', bloque: 70, formato: 'rounds' });
    const b = linea({ scheme: 'rounds', modality: 'functional', rounds: 4, rest_s: 90, sets: [{ measure: { kind: 'distance', meters: 20 }, target: { kind: 'kg', value: 30 } }] }, { familia: 'estaciones', bloque: 70, formato: 'rounds' });
    const r = cumplimientoDeLineas([a, b], [tramo(a, { segundos: 755, pulso_medio: 149, modalidad: 'other' })], ctx());
    expect(r.lineas.map((x) => x.estado)).toEqual(['ejecutada', 'cubierta']);
    expect(r.lineas[0]!.tramos[0]).toMatchObject({ plegado: true, veredicto: 'dentro' });
  });
});

describe('el registro', () => {
  test('sin tramos: todas las líneas «sin detalle», nada juzgado', () => {
    const l = linea({ scheme: 'steady', modality: 'run', total_s: 1800 });
    expect(cumplimientoDeLineas([l], [], ctx()).lineas[0]).toMatchObject({ estado: 'sin_detalle', tramos: [] });
  });

  test('un tramo sin enlace a este plan no se juzga: se cuenta, y las líneas no se acusan de «sin ejecutar»', () => {
    const a = linea({ scheme: 'steady', modality: 'run', sets: [{ measure: { kind: 'distance', meters: 6000 } }], target: { kind: 'hr_zone', value: 2 } });
    const b = linea({ scheme: 'intervals', modality: 'run', rounds: 6, rest_s: 60, sets: [{ measure: { kind: 'duration', seconds: 20 }, target: { kind: 'rpe', value: 7 } }] });
    const r = cumplimientoDeLineas([a, b], [tramo(null, { segundos: 1174, metros: 4010, modalidad: 'run' })], ctx());
    expect(r.ajenos).toBe(1);
    expect(r.lineas.map((x) => x.estado)).toEqual(['sin_detalle', 'sin_detalle']);
  });

  test('con el registro completo, una línea sin tramo está «sin ejecutar»; un tramo vacío que no es pierna no cuenta', () => {
    const a = linea({ scheme: 'sets', modality: 'strength', sets: [{ measure: { kind: 'reps', value: 5 } }] }, { familia: 'fuerza' });
    const b = linea({ scheme: 'sets', modality: 'core', sets: [{ measure: { kind: 'reps', value: 12 } }] }, { familia: 'otro' });
    const r = cumplimientoDeLineas([a, b], [tramo(a, { modalidad: 'strength', series: [serie(0, { reps: 5, reps_prescritas: 5 })] }), tramo(b, { modalidad: 'other' })], ctx());
    expect(r.lineas.map((x) => x.estado)).toEqual(['ejecutada', 'sin_ejecutar']);
  });
});
