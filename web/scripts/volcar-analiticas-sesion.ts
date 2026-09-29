/**
 * volcar-analiticas-sesion.ts — el detalle de una sesión (`GET …/analytics/sesion/{executionId}`) y el cumplimiento de su
 * ventana (`GET …/analytics/cumplimiento?ventana=12s`), tal como los sirven el motor y el cargador, para los tests del iPhone.
 *
 * LO QUE ES DEL MOTOR (puro, el mismo que llama `cargarSesion` y `cargarDetalleCumplimiento`): la carga de cada tramo con su
 * peldaño (`preciarSesion` + `cargaDeTramo`), las zonas, las tres lecturas de cabecera (`lecturasSesion`), la carga planificada
 * (`cargaPlanificadaDeSesion`) y el veredicto de cada tramo y de cada serie (`cumplimientoDeSesion`). LO QUE NO ES: la forma en que
 * el cargador ensambla la fila de la base (cabecera, `hecho` de cada tramo, traza), que aquí se escribe con las mismas claves que
 * `web/lib/analytics/sesion.ts`. Las entradas son sintéticas y deterministas (las formas de las diez ejecuciones del modelo §7): sin
 * base de datos, y sin que una fila real de nadie acabe en un test. Si el contrato cambia, se vuelve a volcar.
 *
 *   cinta-4x1000   correr: calentamiento y cuatro series, la tercera fuera de banda; carga por ritmo, medida
 *   remo-5x500     ergo: cinco piezas con su split; carga por potencia
 *   sentadilla-4x5 fuerza: RIR pedido 2, la primera floja y la última al límite; carga por esfuerzo (10 − RIR)
 *   fuerza-trineos fuerza + trineos sin kilos, sin pulso ni RPE: la carga de los trineos NO se sabe
 *   carrera-salud  una carrera importada de Salud, sin plan: pulso, parciales por km y curvas; sin cumplimiento
 *
 * Run (contexto web: alias `@/`):
 *   cd web && ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json scripts/volcar-analiticas-sesion.ts
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  anclasVacias,
  cargaDeTramo,
  cargaPlanificadaDeSesion,
  cumplimientoDeSesion,
  defaultCoachAnalyticsMethod,
  lecturasSesion,
  preciarSesion,
  resolverVentana,
  wattsDeSplit500,
  zonasDeTramo,
  type AnclasAtleta,
  type ContextoBandas,
  type ItemPlan,
  type LineaPlan,
  type SerieHecha,
  type SesionCumplimiento,
  type SesionPlan,
  type TramoEjecutado,
  type TramoHecho,
} from '@fahybrid/shared/domain/analytics';
import { DEFAULT_HR_ZONE_FRACTIONS, STANDARD_ZONES_PER_500M, STANDARD_ZONES_PER_KM } from '@fahybrid/shared/domain/methodology';
import { prescriptionToText } from '@fahybrid/shared/domain/prescription/to-text';
import type { Prescription } from '@fahybrid/shared/domain/prescription';

const HOY = '2026-09-29';
const DESTINO = resolve(process.cwd(), '../ios/FAHYBRIKTests/Analytics/Detalle/Fixtures');

const metodo = defaultCoachAnalyticsMethod();

function anclas(): AnclasAtleta {
  const a = anclasVacias();
  a.pulso = { valor: 170, ancla: 'medida', fuente: 'perfil_test', explica_es: 'Test de 30 min · 3 sep', desde_iso: '2026-09-03' };
  a.ritmo.run = { valor: 252, ancla: 'medida', fuente: 'perfil_test', explica_es: 'Test de umbral · 3 sep', desde_iso: '2026-09-03' };
  a.ritmo.row = { valor: 112, ancla: 'medida', fuente: 'marca_row_2k', explica_es: '2000 m de remo · 20 sep', desde_iso: '2026-09-20' };
  a.potencia.row = { ...a.ritmo.row, valor: wattsDeSplit500(112)! };
  return a;
}

const A = anclas();
const ctx: ContextoBandas = {
  anclas: A,
  fracciones_hr: DEFAULT_HR_ZONE_FRACTIONS,
  zonas_ritmo: { per_km: [...STANDARD_ZONES_PER_KM], per_500m: [...STANDARD_ZONES_PER_500M] },
  metodo,
  pendiente_retira_ritmo_pct: 3,
};

// ---------------------------------------------------------------------------
// Fábricas
// ---------------------------------------------------------------------------

let seq = 0;
const siguiente = () => ++seq;

function linea(p: Prescription, over: Partial<LineaPlan> = {}): LineaPlan {
  const n = siguiente();
  return { template_segment_id: `L${n}`, bloque: n, posicion: n, formato: p.scheme ?? null, prescripcion: p, modalidad: p.modality ?? null, familia: 'correr', rol: 'principal', ejercicio: null, ...over };
}

function tramo(l: LineaPlan | null, over: Partial<TramoEjecutado> = {}): TramoEjecutado {
  const n = siguiente();
  return {
    id: `T${n}`, template_segment_id: l?.template_segment_id ?? null, posicion: n, segundos: null, metros: null, ritmo_s_km: null, split_s_500m: null,
    vatios: null, pulso_medio: null, inclinacion_pct: null, pendiente_pct: null, reps: null, reps_prescritas: null, kg: null, calorias: null,
    rondas: null, rondas_prescritas: null, pierna: null, papel_pierna: null, ronda: null, modalidad: l?.modalidad ?? null, series: [], ...over,
  };
}

function serie(indice: number, over: Partial<SerieHecha> = {}): SerieHecha {
  return { indice, reps: null, reps_prescritas: null, kg: null, kg_prescritos: null, rpe: null, rir: null, estado: 'done', ...over };
}

/** Lo que el `SegmentActual` de la base lleva de un tramo: las cifras, y nulo lo que no se midió. */
function hecho(t: TramoEjecutado, over: Record<string, unknown> = {}) {
  return {
    position: t.posicion, item_uid: t.template_segment_id ? `segment-${t.template_segment_id}` : null,
    modality: t.modalidad ?? 'other', exercise_name: null, started_at: null,
    duration_seconds: t.segundos, reps_completed: t.reps, weight_used_kg: t.kg, distance_meters: t.metros,
    avg_pace_s_per_500m: t.split_s_500m, avg_pace_s_per_km: t.ritmo_s_km, avg_power_w: t.vatios, stroke_rate_spm: null,
    avg_hr: t.pulso_medio, max_hr: null, calories: t.calorias, emom_rounds_completed: t.rondas, emom_rounds_prescribed: t.rondas_prescritas,
    incline_pct: t.inclinacion_pct, avg_gradient_pct: t.pendiente_pct, run_cadence_spm: null,
    drag_factor: null, avg_calories_per_hour: null, peak_drive_force_lbs: null, avg_drive_force_lbs: null, erg_splits: null, run_splits: null,
    source: null, zone_seconds: null, leg_index: t.pierna, round_index: t.ronda ?? 0, leg_role: t.papel_pierna, leg_phase: null, is_structural: false,
    sets: t.series.map((s) => ({ set_index: s.indice + 1, status: s.estado, reps: s.reps, kg: s.kg, reps_prescribed: s.reps_prescritas, kg_prescribed: s.kg_prescritos, rpe: s.rpe, rir: s.rir, tempo: null, rest_s: null })),
    volume_kg: t.series.length > 0 ? t.series.reduce((a, s) => a + (s.reps ?? 0) * (s.kg ?? 0), 0) : null,
    ...over,
  };
}

interface Caso {
  clave: string;
  titulo: string | null;
  formato: string | null;
  dia: string;
  ejecucion: string;
  asignacion: string | null;
  fuera_del_plan: string | null;
  rpe: number | null;
  lineas: LineaPlan[];
  tramos: TramoEjecutado[];
  /** Cómo se midió cada tramo para preciarlo (por posición). */
  medida: (t: TramoEjecutado) => Omit<TramoHecho, 'id' | 'segundos'>;
  /** La fase de cada tramo (`warmup` · `main` · `cooldown`) cuando es una carrera de series. */
  fase?: (t: TramoEjecutado) => string | null;
  segundos: number;
  pulso_medio: number | null;
  ejercicio?: (t: TramoEjecutado) => string | null;
  traza: { pulso: [number, number][]; ritmo: [number, number][]; parciales: Array<[number, number, number, number]> } | null;
}

const curva = (n: number, duracion: number, f: (t: number) => number): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [Math.round((duracion * i) / n), Math.round(f(i / n))]);

// ---------------------------------------------------------------------------
// Los casos
// ---------------------------------------------------------------------------

function cintaCuatroPorMil(): Caso {
  const calen = linea({ scheme: 'steady', modality: 'run', total_s: 600, target: { kind: 'hr_zone', value: 2 } }, { rol: 'calentamiento' });
  const series = linea({ scheme: 'intervals', modality: 'run', rounds: 4, rest_s: 90, target: { kind: 'hr_zone', value: 5 }, sets: [{ measure: { kind: 'distance', meters: 1000 } }] });
  const ritmos = [235, 237, 245, 236];
  const tramos: TramoEjecutado[] = [tramo(calen, { segundos: 604, metros: 1770, ritmo_s_km: 341, pulso_medio: 131, inclinacion_pct: 1, modalidad: 'run' })];
  ritmos.forEach((r, i) => {
    tramos.push(tramo(series, { pierna: i * 2, papel_pierna: 'work', ronda: 0, segundos: r, metros: 1000, ritmo_s_km: r, pulso_medio: 163, inclinacion_pct: 1, modalidad: 'run' }));
    if (i < 3) tramos.push(tramo(series, { pierna: i * 2 + 1, papel_pierna: 'recovery', ronda: 0, segundos: 92, metros: 210, ritmo_s_km: 438, pulso_medio: 148, inclinacion_pct: 1, modalidad: 'run' }));
  });
  return {
    clave: 'cinta-4x1000', titulo: 'Series 4 × 1000 m en cinta', formato: 'intervals', dia: '2026-09-22', ejecucion: '9001', asignacion: '7001', fuera_del_plan: null, rpe: 8,
    lineas: [calen, series], tramos,
    medida: (t) => ({ modalidad: 'run', familia: 'correr', potencia_w: null, ritmo_s: t.ritmo_s_km, pendiente_pct: 1, pulso_medio: t.pulso_medio, esfuerzo: null, zonas: null }),
    fase: (t) => (t.template_segment_id === calen.template_segment_id ? 'warmup' : 'main'),
    segundos: 1860, pulso_medio: 152,
    traza: { pulso: curva(60, 1860, (x) => 128 + 38 * Math.min(1, x * 4) - 10 * Math.cos(x * 30)), ritmo: curva(60, 1860, (x) => 300 - 60 * Math.abs(Math.sin(x * 9))), parciales: [[1, 1000, 341, 131], [2, 1000, 236, 162], [3, 1000, 238, 164], [4, 1000, 246, 163]] },
  };
}

function remoCincoPorQuinientos(): Caso {
  const l = linea({ scheme: 'intervals', modality: 'row', rounds: 5, rest_s: 120, target: { kind: 'pace', unit: 'per_500m', value_s: 112 }, sets: [{ measure: { kind: 'distance', meters: 500 } }] }, { familia: 'remo' });
  const splits = [110, 111, 112, 114.9, 113];
  const tramos = splits.map((s, i) => tramo(l, { segundos: Math.round(s), metros: 500, split_s_500m: s, vatios: wattsDeSplit500(s)!, pulso_medio: 156 + i, modalidad: 'row', ronda: i + 1 }));
  return {
    clave: 'remo-5x500', titulo: 'Remo 5 × 500 m', formato: 'intervals', dia: '2026-09-20', ejecucion: '9002', asignacion: '7002', fuera_del_plan: null, rpe: 7,
    lineas: [l], tramos,
    medida: (t) => ({ modalidad: 'row', familia: 'remo', potencia_w: t.vatios, ritmo_s: t.split_s_500m, pendiente_pct: null, pulso_medio: t.pulso_medio, esfuerzo: null, zonas: null }),
    segundos: 1500, pulso_medio: 150, traza: null,
  };
}

function sentadillaCuatroPorCinco(): Caso {
  const l = linea({ scheme: 'sets', modality: 'strength', sets: [1, 2, 3, 4].map(() => ({ measure: { kind: 'reps' as const, value: 5 }, target: { kind: 'rir' as const, value: 2 } })) }, { familia: 'fuerza', ejercicio: 'Sentadilla' });
  const series = [3, 2, 2, 1].map((rir, i) => serie(i, { reps: 5, reps_prescritas: 5, kg: 100, kg_prescritos: 100, rir }));
  const t = tramo(l, { modalidad: 'strength', segundos: 1260, series });
  return {
    clave: 'sentadilla-4x5', titulo: 'Sentadilla 4 × 5', formato: 'sets', dia: '2026-09-18', ejecucion: '9003', asignacion: '7003', fuera_del_plan: null, rpe: 8,
    lineas: [l], tramos: [t],
    // Sin pulso: la carga sale del esfuerzo de las series (10 − RIR, media), declarada.
    medida: () => ({ modalidad: 'strength', familia: 'fuerza', potencia_w: null, ritmo_s: null, pendiente_pct: null, pulso_medio: null, esfuerzo: 10 - (3 + 2 + 2 + 1) / 4, zonas: null }),
    ejercicio: () => 'Sentadilla', segundos: 1500, pulso_medio: null, traza: null,
  };
}

function fuerzaConTrineos(): Caso {
  const dl = linea({ scheme: 'sets', modality: 'strength', sets: [1, 2, 3].map(() => ({ measure: { kind: 'reps' as const, value: 5 }, target: { kind: 'rir' as const, value: 2 } })) }, { familia: 'fuerza', ejercicio: 'Peso muerto' });
  const trineo = linea({ scheme: 'rounds', modality: 'functional', rounds: 4, rest_s: 90, sets: [{ measure: { kind: 'distance', meters: 25 } }] }, { familia: 'estaciones', ejercicio: 'Sled push' });
  const t1 = tramo(dl, { modalidad: 'strength', segundos: 900, series: [2, 2, 1].map((rir, i) => serie(i, { reps: 5, reps_prescritas: 5, kg: 140, kg_prescritos: 140, rir })) });
  const t2 = tramo(trineo, { modalidad: 'other', segundos: 720, metros: 100 });
  return {
    clave: 'fuerza-trineos', titulo: 'Fuerza y trineos', formato: 'sets', dia: '2026-09-15', ejecucion: '9004', asignacion: '7004', fuera_del_plan: null, rpe: null,
    lineas: [dl, trineo], tramos: [t1, t2],
    medida: (t) => (t.modalidad === 'strength'
      ? { modalidad: 'strength', familia: 'fuerza', potencia_w: null, ritmo_s: null, pendiente_pct: null, pulso_medio: null, esfuerzo: 10 - 5 / 3, zonas: null }
      : { modalidad: 'other', familia: 'estaciones', potencia_w: null, ritmo_s: null, pendiente_pct: null, pulso_medio: null, esfuerzo: null, zonas: null }),
    ejercicio: (t) => (t.modalidad === 'strength' ? 'Peso muerto' : 'Sled push'), segundos: 2400, pulso_medio: null, traza: null,
  };
}

function carreraDeSalud(): Caso {
  const t = tramo(null, { modalidad: 'run', segundos: 2640, metros: 8000, ritmo_s_km: 330, pulso_medio: 149 });
  const zonas = { por_zona: { 1: 120, 2: 1980, 3: 480, 4: 60, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>, sin_pulso_s: 0, ancla: 'medida' as const };
  return {
    clave: 'carrera-salud', titulo: null, formato: null, dia: '2026-09-13', ejecucion: '9005', asignacion: null, fuera_del_plan: 'no_assignment', rpe: null,
    lineas: [], tramos: [t],
    medida: (x) => ({ modalidad: 'run', familia: 'correr', potencia_w: null, ritmo_s: x.ritmo_s_km, pendiente_pct: null, pulso_medio: x.pulso_medio, esfuerzo: null, zonas }),
    segundos: 2640, pulso_medio: 149,
    traza: {
      pulso: curva(60, 2640, (x) => 120 + 30 * Math.min(1, x * 5) + 8 * Math.sin(x * 20)),
      ritmo: curva(60, 2640, (x) => 335 - 12 * Math.sin(x * 14)),
      parciales: Array.from({ length: 8 }, (_, i) => [i + 1, 1000, 322 + ((i * 7) % 19) - 4, 141 + i] as [number, number, number, number]),
    },
  };
}

// ---------------------------------------------------------------------------
// El sobre de cada sesión y de su cumplimiento
// ---------------------------------------------------------------------------

function volcarCaso(c: Caso) {
  const tramosHechos: TramoHecho[] = c.tramos.map((t) => ({ id: t.id, segundos: t.segundos ?? 0, ...c.medida(t) }));
  const sesion = { id: c.ejecucion, dia: c.dia, segundos: c.segundos, rpe: c.rpe, pulso_medio: c.pulso_medio, tramos: tramosHechos };
  const precio = preciarSesion(sesion, { anclas: A, metodo, fracciones_hr: DEFAULT_HR_ZONE_FRACTIONS });
  const items: ItemPlan[] = c.lineas.map((l) => ({ prescripcion: l.prescripcion, modalidad: l.modalidad, familia: l.familia, rol: l.rol }));
  const plan: SesionPlan | null = c.asignacion ? { id: c.asignacion, dia: c.dia, items } : null;
  const precioPlan = plan ? cargaPlanificadaDeSesion(plan, { anclas: A, fracciones_hr: DEFAULT_HR_ZONE_FRACTIONS }) : null;

  const detalle = {
    athlete_id: '101',
    execution_id: c.ejecucion,
    assignment_id: c.asignacion,
    fuera_del_plan: c.fuera_del_plan,
    dia: c.dia,
    inicio_iso: `${c.dia}T17:30:00.000Z`,
    fin_iso: `${c.dia}T18:01:00.000Z`,
    titulo_es: c.titulo,
    formato: c.formato,
    rpe: c.rpe,
    fuente: null,
    registrado: null,
    lecturas: lecturasSesion({ sesion, precio, plan: precioPlan }),
    tramos: c.tramos.map((t, i) => {
      const l = c.lineas.find((x) => x.template_segment_id === t.template_segment_id) ?? null;
      const fase = c.fase?.(t) ?? null;
      return {
        id: t.id,
        posicion: t.posicion,
        ronda: t.ronda ?? 0,
        familia: l?.familia ?? 'correr',
        modalidad: t.modalidad,
        ejercicio_es: c.ejercicio?.(t) ?? null,
        papel: t.papel_pierna,
        fase,
        inicio_iso: null,
        segundos: t.segundos,
        prescrito: l?.prescripcion ? { prescripcion: l.prescripcion, texto_es: prescriptionToText(l.prescripcion) } : null,
        hecho: hecho(t, { exercise_name: c.ejercicio?.(t) ?? null, leg_phase: fase }),
        zonas: zonasDeTramo(tramosHechos[i]!.zonas ?? null),
        carga: cargaDeTramo(precio.tramos[i] ?? null),
      };
    }),
    resto: cargaDeTramo(precio.resto),
    traza: {
      disponible: c.traza != null,
      parciales_km: (c.traza?.parciales ?? []).map(([index, distance_m, duration_s, avg_hr]) => ({ index, partial: false, distance_m, duration_s, avg_pace_s_per_km: duration_s, avg_hr, elevation_gain_m: null })),
      pulso: c.traza ? { offsets_s: c.traza.pulso.map((p) => p[0]), values: c.traza.pulso.map((p) => p[1]) } : null,
      ritmo: c.traza ? { offsets_s: c.traza.ritmo.map((p) => p[0]), values: c.traza.ritmo.map((p) => p[1]) } : null,
      ruta: { available: false, points: [], pace_zones: null },
      referencias_pulso: null,
      zonas_ritmo: null,
    },
    pendientes: ['cumplimiento'],
  };

  // El cumplimiento de la misma sesión: solo si es del plan.
  let fila = null;
  if (c.asignacion) {
    const s: SesionCumplimiento = {
      assignment_id: c.asignacion, dia: c.dia, titulo: c.titulo, estado_plan: 'completed', excluida: false, visible: true,
      ejecucion: { id: c.ejecucion, dia: c.dia, segundos: c.segundos, metros: null }, lineas: c.lineas, tramos: c.tramos,
    };
    fila = cumplimientoDeSesion(s, { hoy: HOY, metodo, ctx, plan, precio_plan: precioPlan, precio_hecho: precio });
  }
  return { detalle, fila };
}

function main(): void {
  mkdirSync(DESTINO, { recursive: true });
  const escritos = new Set<string>();
  const filas = [];
  for (const caso of [cintaCuatroPorMil(), remoCincoPorQuinientos(), sentadillaCuatroPorCinco(), fuerzaConTrineos(), carreraDeSalud()]) {
    const { detalle, fila } = volcarCaso(caso);
    const nombre = `sesion-${caso.clave}.json`;
    writeFileSync(join(DESTINO, nombre), `${JSON.stringify(detalle, null, 1)}\n`);
    escritos.add(nombre);
    if (fila) filas.push(fila);
  }

  // Dos más que no son de esta lista: una sesión debida sin hacer y una de hoy sin hacer.
  const noHecha = cumplimientoDeSesion(
    { assignment_id: '7100', dia: '2026-09-25', titulo: 'Rodaje suave', estado_plan: 'scheduled', excluida: false, visible: true, ejecucion: null, lineas: [], tramos: [] },
    { hoy: HOY, metodo, ctx, plan: null, precio_plan: null, precio_hecho: null },
  );
  const deHoy = cumplimientoDeSesion(
    { assignment_id: '7101', dia: HOY, titulo: 'Tempo 3 × 10′', estado_plan: 'scheduled', excluida: false, visible: true, ejecucion: null, lineas: [], tramos: [] },
    { hoy: HOY, metodo, ctx, plan: null, precio_plan: null, precio_hecho: null },
  );
  const sesiones = [deHoy, noHecha, ...filas].filter((f) => f != null).sort((a, b) => (a!.dia < b!.dia ? 1 : a!.dia > b!.dia ? -1 : 0));
  const ventana = resolverVentana({ clave: '12s', hoy_local: HOY, primera_sesion_iso: '2026-01-05' });
  const cumplimiento = {
    athlete_id: '101',
    generado_iso: `${HOY}T08:00:00.000Z`,
    ventana,
    metodo,
    lecturas: [],
    sesiones,
    sin_plan: { sesiones: 1, segundos: 2640, tss: 47.1 },
  };
  writeFileSync(join(DESTINO, 'cumplimiento-lleno-12s.json'), `${JSON.stringify(cumplimiento, null, 1)}\n`);
  escritos.add('cumplimiento-lleno-12s.json');

  for (const previo of readdirSync(DESTINO)) {
    if ((previo.startsWith('sesion-') || previo.startsWith('cumplimiento-')) && previo.endsWith('.json') && !escritos.has(previo)) rmSync(join(DESTINO, previo));
  }
  process.stdout.write(`${escritos.size} ficheros en ${DESTINO}\n`);
}

main();
