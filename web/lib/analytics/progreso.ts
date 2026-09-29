import 'server-only';

// PROGRESO Y RÉCORDS — el cargador (docs/analiticas/modelo.md §3 filas 5-6, §5).
//
// UN CÁLCULO, TRES VISTAS (A1): `cargarProgreso` trae las filas UNA vez y llama
// a `progresoAtleta`, puro. De ahí salen el bloque `progreso` y el bloque
// `records` del panel (`cargarPanel`), el detalle de cada familia
// (`…/analytics/familia/{familia}`) y la lista de récords con la evolución de
// los tests (`…/analytics/records`). Las rutas del atleta y del coach llaman a
// las mismas funciones con el mismo `AtletaVerificado`.
//
// Aquí solo se cablea: cada fila va a la familia que le da `familiaDe` (la MISMA
// regla que la carga y las semanas: «correr» significa lo mismo en todo el
// panel), y cada método sale de su dueño — el del coach para las analíticas, sus
// umbrales de carrera, su fórmula de 1RM y sus bandas de pulso.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { resolveEffectiveAnalyticsMethod } from '@/lib/coach/analytics-method';
import { resolveCoachHrMethod } from '@/lib/coach/hr-method';
import { resolveEffectiveRunningThresholds } from '@/lib/coach/running-thresholds';
import { loadCoachOneRmMethod } from '@/lib/strength/strength-max';
import { parseErgDetail } from '@/lib/execution/erg-splits';
import { defaultCoachHrMethod, hrZoneFractionsFrom } from '@fahybrid/shared/domain/coach/hr-method';
import { classifyEffort } from '@fahybrid/shared/domain/race-transfer/compute';
import { normalizeFormat } from '@fahybrid/shared/domain/prescription/format';
import { safeParsePrescription, type Prescription } from '@fahybrid/shared/domain/prescription';
import type { Measure } from '@fahybrid/shared/domain/prescription/types';
import type { HrZoneFractions } from '@fahybrid/shared/domain/methodology/hr-zones';
import type { OneRmMethod } from '@fahybrid/shared/domain/strength';
import {
  esPesoCorporal,
  familiaDe,
  historiaDe,
  limitesUtc,
  progresoAtleta,
  repsPorRonda,
  resolverVentana,
  type AnclasAtleta,
  type CoachAnalyticsMethod,
  type EntradaProgresoAtleta,
  type FamiliaDetalle,
  type Historia,
  type Lectura,
  type Maquina,
  type EntradaErgo,
  type ProgresoAtleta,
  type SerieFuerza,
  type TramoCorrer,
  type TramoErgo,
  type TramoEstacion,
  type VentanaClave,
  type VentanaResuelta,
} from '@fahybrid/shared/domain/analytics';
import { loadAnclasAtleta } from './anclas';
import type { AtletaVerificado } from './atleta-verificado';
import { loadContexto, type ContextoAtleta } from './panel-datos';
import { loadFilasProgreso, type FilasProgreso, type TramoFila } from './progreso-datos';

const FAMILIA_MAQUINA: Record<string, Maquina> = { remo: 'row', ski: 'ski', bici: 'bike' };

/** Los tests de ergo que son una pieza de Concept2: su máquina y su distancia. */
const MARCA_ERGO: Readonly<Record<string, { maquina: Maquina; metros: number }>> = {
  row_500m: { maquina: 'row', metros: 500 },
  row_1k: { maquina: 'row', metros: 1000 },
  row_2k: { maquina: 'row', metros: 2000 },
  ski_1k: { maquina: 'ski', metros: 1000 },
};

function num(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

/** Un intento: ni el marcador de un calentamiento ni la recuperación entre series (`SEG_IS_WORK_EFFORT`). */
function esTrabajo(t: TramoFila): boolean {
  return !t.is_structural && (t.leg_role ?? 'work') !== 'recovery';
}

/** La primera medida de una línea de plantilla: la dosis de la tarea en una ronda. */
function medidaDeLinea(raw: unknown): Measure | null {
  const p = raw == null ? null : safeParsePrescription(raw);
  const presc: Prescription | null = p && p.success ? (p.data as Prescription) : null;
  return presc?.sets?.[0]?.measure ?? null;
}

/** Las reps de una ronda de cada plantilla raíz: las líneas del PRIMER bloque AMRAP. */
function repsPorRondaDe(filas: FilasProgreso): Map<string, number | null> {
  const porPlantilla = new Map<string, FilasProgreso['plantillas']>();
  for (const s of filas.plantillas) porPlantilla.set(s.template_id, [...(porPlantilla.get(s.template_id) ?? []), s]);
  const out = new Map<string, number | null>();
  for (const [id, lineas] of porPlantilla) {
    const amrap = lineas.filter((l) => normalizeFormat(l.block_format) === 'amrap');
    if (amrap.length === 0) {
      out.set(id, null);
      continue;
    }
    const bloque = Math.min(...amrap.map((l) => l.block_position ?? 0));
    out.set(id, repsPorRonda(amrap.filter((l) => (l.block_position ?? 0) === bloque).map((l) => medidaDeLinea(l.prescription))));
  }
  return out;
}

/** Las filas leídas, repartidas por familia en la forma que cada motor puro pide. */
export function entradaDeFilas(args: {
  filas: FilasProgreso;
  ventana: VentanaResuelta;
  anclas: AnclasAtleta;
  fracciones_hr: HrZoneFractions;
  metodo: CoachAnalyticsMethod;
  umbrales: Awaited<ReturnType<typeof resolveEffectiveRunningThresholds>>;
  formula: OneRmMethod;
  semanas_historia: number | null;
  sin_historia: boolean;
}): EntradaProgresoAtleta {
  const { filas, ventana, anclas, fracciones_hr, metodo, umbrales, sin_historia } = args;
  const correr: TramoCorrer[] = [];
  const ergo: Record<Maquina, TramoErgo[]> = { row: [], ski: [], bike: [] };
  const fuerza: SerieFuerza[] = [];
  const estaciones: TramoEstacion[] = [];
  const sesionesCorrer = new Set<string>();

  const seriesPorTramo = new Map<string, FilasProgreso['series']>();
  for (const s of filas.series) seriesPorTramo.set(s.segmento_id, [...(seriesPorTramo.get(s.segmento_id) ?? []), s]);

  for (const t of filas.tramos) {
    const familia = familiaDe({ modalidad: t.modality, exercise_modality: t.exercise_modality, exercise_category: t.exercise_category, formato: t.context_format });
    const segundos = Math.max(0, num(t.segundos) ?? 0);
    const trabajo = esTrabajo(t);
    const formato = normalizeFormat(t.context_format) ?? t.context_format;
    if (familia === 'correr') {
      sesionesCorrer.add(t.sesion_id);
      correr.push({
        dia: t.dia,
        sesion_id: t.sesion_id,
        segundos,
        metros: num(t.distance_m),
        ritmo_s_km: num(t.pace_km),
        pulso: num(t.avg_hr),
        // La cinta manda cuando la hay (su inclinación es medida directa).
        pendiente_pct: num(t.incline_pct) ?? num(t.gradient_pct),
        contexto: t.source === 'treadmill' || t.incline_pct != null ? 'cinta' : 'calle',
        trabajo,
        tipo: normalizeFormat(t.context_format) ?? null,
        esfuerzo: classifyEffort({ value_s: segundos, context_format: t.context_format, prior_work_s: t.prior_work_s, position: t.position }),
      });
    } else if (familia in FAMILIA_MAQUINA) {
      const detalle = parseErgDetail({ erg_splits: t.erg_splits });
      ergo[FAMILIA_MAQUINA[familia]!].push({
        dia: t.dia,
        sesion_id: t.sesion_id,
        maquina: FAMILIA_MAQUINA[familia]!,
        segundos,
        metros: num(t.distance_m),
        ritmo_s_500m: num(t.pace_500m),
        vatios: num(t.power_w),
        pulso: num(t.avg_hr),
        cadencia: num(t.stroke_spm),
        trabajo,
        parciales: (detalle?.erg_splits ?? [])
          .filter((s) => (s.time_seconds ?? 0) > 0 && (s.distance_meters ?? 0) > 0)
          .map((s) => ({ segundos: s.time_seconds!, metros: s.distance_meters! })),
      });
    } else if (familia === 'fuerza' && t.exercise_id != null && !t.is_structural) {
      const base = {
        dia: t.dia,
        sesion_id: t.sesion_id,
        ejercicio_id: t.exercise_id,
        ejercicio: t.exercise_name ?? 'Ejercicio',
        patron: t.movement_pattern,
        peso_corporal: esPesoCorporal(t.equipment),
      };
      const sets = seriesPorTramo.get(t.id) ?? [];
      // Sin series, la línea única es UNA serie (la regla de `volume.ts`).
      if (sets.length > 0) for (const s of sets) fuerza.push({ ...base, reps: s.reps, kg: num(s.kg), estado: s.estado });
      else if ((t.reps_completed ?? 0) > 0) fuerza.push({ ...base, reps: t.reps_completed, kg: num(t.weight_kg), estado: 'done' });
    } else if (familia === 'estaciones' && t.exercise_slug != null) {
      estaciones.push({
        dia: t.dia,
        sesion_id: t.sesion_id,
        slug: t.exercise_slug,
        nombre: t.exercise_name ?? t.exercise_slug,
        segundos,
        metros: num(t.distance_m),
        reps: t.reps_completed,
        kg: num(t.weight_kg),
        formato,
        trabajo,
      });
    }
  }

  const rpr = repsPorRondaDe(filas);
  const marcasCorrer = filas.marcas.map((m) => ({ dia: m.dia, slug: m.slug, segundos: m.valor, contexto: m.run_context === 'treadmill' ? ('cinta' as const) : ('calle' as const), fuente: m.fuente === 'registered' ? ('registrada' as const) : ('test' as const) }));
  const tests = filas.marcas.filter((m) => m.fuente === 'coach_test' || m.fuente === 'athlete_test');

  const comun = { ventana, anclas, fracciones_hr, umbrales, metodo, sin_historia };
  const entradaErgo = (m: Maquina): EntradaErgo => ({
    ...comun,
    maquina: m,
    tramos: ergo[m],
    // Un test de ergo es una pieza más; lo declarado o registrado no entra.
    marcas: tests
      .filter((x) => MARCA_ERGO[x.slug]?.maquina === m)
      .map((x) => ({ dia: x.dia, maquina: m, metros: MARCA_ERGO[x.slug]!.metros, segundos: x.valor })),
  });
  return {
    ventana,
    correr: {
      ...comun,
      tramos: correr,
      trazas: filas.trazas
        .filter((tr) => sesionesCorrer.has(tr.sesion_id))
        .map((tr) => ({ sesion_id: tr.sesion_id, dia: tr.dia, contexto: tr.source === 'treadmill' ? 'cinta' : 'calle', offsets_s: tr.offsets_s, values_m: tr.values })),
      marcas: marcasCorrer,
      desacoples: filas.desacoples.filter((d) => sesionesCorrer.has(d.sesion_id)).map((d) => ({ dia: d.dia, pct: d.pct })),
      semanas_historia: args.semanas_historia,
    },
    ergo: {
      row: entradaErgo('row'),
      ski: entradaErgo('ski'),
      bike: entradaErgo('bike'),
    },
    fuerza: { ventana, series: fuerza, formula: args.formula, metodo, sin_historia },
    estaciones: {
      ventana,
      tramos: estaciones,
      puntuaciones: filas.puntuaciones.map((p) => ({
        dia: p.dia,
        sesion_id: p.sesion_id,
        // Sin plantilla, la sesión es su propio WOD: nunca se repite.
        wod_id: p.wod_id ?? `sesion-${p.sesion_id}`,
        nombre: p.nombre ?? 'Entreno fuera del plan',
        formato: normalizeFormat(p.formato) ?? p.formato,
        tiempo_s: p.tiempo_s,
        rondas: p.rondas,
        reps: p.reps,
        reps_por_ronda: p.wod_id != null ? (rpr.get(p.wod_id) ?? null) : null,
      })),
      metodo,
      sin_historia,
    },
    tests: { ventana, metodo, resultados: tests.map((x) => ({ dia: x.dia, slug: x.slug, valor: x.valor, unidad_bd: x.unidad })) },
  };
}

/** Lo que el panel ya tiene resuelto y el progreso reutiliza, para no leerlo dos veces. */
export interface BaseProgreso {
  atleta: AtletaVerificado;
  ventana: VentanaResuelta;
  contexto: ContextoAtleta;
  metodo: CoachAnalyticsMethod;
  anclas: AnclasAtleta;
  fracciones_hr: HrZoneFractions;
  client?: Sql;
}

/** El progreso entero de un atleta en una ventana: filas, récords, tests y detalles. */
export async function cargarProgreso(b: BaseProgreso): Promise<ProgresoAtleta> {
  const client = b.client ?? defaultSql;
  const coachId = b.contexto.coach_id;
  const [filas, umbrales, formula] = await Promise.all([
    loadFilasProgreso({ atleta: b.atleta, tz: b.contexto.tz, hasta_excl: limitesUtc(b.ventana, b.contexto.tz).hasta_excl, coach_id: coachId, client }),
    resolveEffectiveRunningThresholds(coachId ?? 0, client),
    coachId != null ? loadCoachOneRmMethod(client, coachId) : Promise.resolve<OneRmMethod>('Epley'),
  ]);
  const historia = historiaDe({ dias_de_historia: b.contexto.historia.dias, primera_sesion_iso: b.contexto.historia.iso, ventana_dias: b.ventana.dias });
  return progresoAtleta(
    entradaDeFilas({
      filas,
      ventana: b.ventana,
      anclas: b.anclas,
      fracciones_hr: b.fracciones_hr,
      metodo: b.metodo,
      umbrales,
      formula,
      semanas_historia: historia.semanas,
      sin_historia: b.contexto.historia.dias == null,
    }),
  );
}

/** Los dos bloques del panel que sirve este cargador. */
export async function cargarBloquesProgreso(b: BaseProgreso): Promise<{ progreso: Lectura[]; records: Lectura[] }> {
  const p = await cargarProgreso(b);
  return { progreso: p.progreso, records: p.records };
}

/** El sobre de un detalle: lo mismo que el panel dice de la ventana y el método, y sus lecturas. */
export interface DetalleAnaliticas {
  athlete_id: string;
  generado_iso: string;
  ventana: VentanaResuelta;
  historia: Historia;
  metodo: CoachAnalyticsMethod;
  anclas: AnclasAtleta;
  /** La familia del detalle; null en la lista de récords. */
  familia: FamiliaDetalle | null;
  lecturas: Lectura[];
}

/** El contexto de un detalle, resuelto con las MISMAS funciones que `cargarPanel`. */
async function baseDe(atleta: AtletaVerificado, clave: VentanaClave, now: Date, client: Sql): Promise<BaseProgreso> {
  const contexto = await loadContexto(atleta, now, client);
  const coachId = contexto.coach_id;
  const ventana = resolverVentana({ clave, hoy_local: contexto.hoy, primera_sesion_iso: contexto.historia.iso });
  const [metodo, hrMethod, anclas] = await Promise.all([
    resolveEffectiveAnalyticsMethod(coachId ?? 0, client),
    coachId != null ? resolveCoachHrMethod(coachId, client) : Promise.resolve(defaultCoachHrMethod()),
    loadAnclasAtleta(atleta, client),
  ]);
  return { atleta, ventana, contexto, metodo, anclas, fracciones_hr: hrZoneFractionsFrom(hrMethod), client };
}

function sobre(b: BaseProgreso, now: Date, familia: FamiliaDetalle | null, lecturas: Lectura[]): DetalleAnaliticas {
  return {
    athlete_id: String(b.atleta.athlete_id),
    generado_iso: now.toISOString(),
    ventana: b.ventana,
    historia: historiaDe({ dias_de_historia: b.contexto.historia.dias, primera_sesion_iso: b.contexto.historia.iso, ventana_dias: b.ventana.dias }),
    metodo: b.metodo,
    anclas: b.anclas,
    familia,
    lecturas,
  };
}

/** `GET …/analytics/familia/{familia}`: el «¿mejoro?» a fondo de una familia. */
export async function cargarDetalleFamilia(args: {
  atleta: AtletaVerificado;
  ventana: VentanaClave;
  familia: FamiliaDetalle;
  now?: Date;
  client?: Sql;
}): Promise<DetalleAnaliticas> {
  const now = args.now ?? new Date();
  const base = await baseDe(args.atleta, args.ventana, now, args.client ?? defaultSql);
  const p = await cargarProgreso(base);
  return sobre(base, now, args.familia, p.detalles[args.familia]);
}

/** `GET …/analytics/records`: la lista única de récords y la evolución de cada test. */
export async function cargarRecords(args: { atleta: AtletaVerificado; ventana: VentanaClave; now?: Date; client?: Sql }): Promise<DetalleAnaliticas> {
  const now = args.now ?? new Date();
  const base = await baseDe(args.atleta, args.ventana, now, args.client ?? defaultSql);
  const p = await cargarProgreso(base);
  return sobre(base, now, null, [...p.records, ...p.tests]);
}
