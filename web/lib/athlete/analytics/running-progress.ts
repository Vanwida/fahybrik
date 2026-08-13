import 'server-only';

// ¿ESTOY MEJORANDO? — el wire de la pantalla de analíticas de carrera del
// atleta (maqueta `design-twin/screens/analiticas-correr`, aprobada 12-ago).
//
// QUÉ ES ESTO Y QUÉ NO
// --------------------
// El motor NO está aquí. El veredicto, la escalera de evidencia y la cobertura
// viven en `shared/domain/running/progress.ts`, puros y probados sin base de
// datos; este fichero solo va a buscar los hechos y se los da. Esa línea es la
// razón de que el doble de diseño y la app enseñen lo mismo: los dos ejecutan
// la misma función, no dos versiones parecidas.
//
// LO QUE SE REUTILIZA — el trabajo del coach, leído desde el otro lado
// ---------------------------------------------------------------------
// Casi ninguna de estas preguntas es nueva; lo nuevo es QUIÉN la hace. Los
// agregados del entrenador (`coach/running-analytics.ts`) ya recorren las
// sesiones, ya sacan un veredicto por tramo y ya emparejan fresco/fatigado. Se
// llama a ESOS cargadores, no a copias:
//
//   · ADHERENCIA — `buildRunCompliance` ya da el veredicto de cada tramo y se
//     tiraba al terminar de pintar la sesión. Aquí se acumulan los de la
//     ventana y se pasan por `summarizeRunCompliance`, el MISMO sumador que ya
//     resume una sesión. No hay motor nuevo: había un agregado que nadie
//     guardaba.
//   · CORRER CANSADO — `loadCompromisedPaceObservations` +
//     `buildCompromisedPaceTrend`, tal cual.
//   · VOLUMEN — `loadWeeklyRunVolume` (con su semana en curso marcada).
//   · REPARTO — `loadZoneWindow` y el plegado a tres bandas del coach
//     (`collapseToPolarization`), con el objetivo que el coach ya tiene escrito
//     en `coach_hr_method`. El 80/20 de la maqueta YA era dato editable.
//   · VO₂MÁX — `buildAthleteVo2Max`, que ya devolvía serie y base. Lo único que
//     cambia es que deja de vivir en Perfil.
//   · CARRERA — `getTargetRace` (nombre y días, cortados en la zona del box) y
//     `buildGoalGap` para el previsto. No se escribe un segundo predictor.
//
// LO ÚNICO QUE NO EXISTÍA: el ritmo al mismo pulso
// (`shared/domain/running/same-hr-pace.ts`) y la curva de esfuerzos con sombra
// (`best-efforts.ts::buildEffortCurve`). Ver esas cabeceras.
//
// UN CERO NUNCA SUSTITUYE A UN HUECO. Es la disciplina que gobierna el fichero
// entero: sin muestras se devuelve `null` o una lista vacía y la cobertura dice
// por qué. Un 0 % de reparto en un atleta sin test de umbral sería una mentira
// dibujada, y ese atleta es justo el que más mira esta pantalla.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { SEG_IS_WORK_EFFORT } from '@/lib/execution/segment-work';
import { resolveEffectiveRunningThresholds } from '@/lib/coach/running-thresholds';
import {
  analizarSesiones,
  loadCompromisedPaceObservations,
  loadQualifyingRunSessions,
} from '@/lib/coach/running-analytics';
import { loadWeeklyRunVolume } from '@/lib/coach/running-volume';
import { loadZoneWindow } from '@/lib/zones/weekly';
import { loadAthleteHrZones } from '@/lib/athlete/hr-zones';
import { resolveAthleteHrMethod } from '@/lib/coach/hr-method';
import { buildAthleteVo2Max } from '@/lib/athlete/vo2max';
import { getTargetRace } from '@/lib/races/next-race';
import { buildGoalGap } from '@/lib/athlete/goal-gap';
import { summarizeRunCompliance } from '@fahybrid/shared/domain/adherence/run-compliance';
import { classifyEffort } from '@fahybrid/shared/domain/race-transfer/compute';
import { buildCompromisedPaceTrend } from '@fahybrid/shared/domain/running/compromised-pace';
import { buildEffortCurve, type EffortCandidate } from '@fahybrid/shared/domain/running/best-efforts';
import {
  buildSameHrPaceSeries,
  referenceBpmFromBand,
  type SameHrObservation,
  type SameHrPaceSeries,
} from '@fahybrid/shared/domain/running/same-hr-pace';
import { HR_ANCHOR_CONFIDENCE } from '@fahybrid/shared/domain/methodology';
import { normalizeFormat } from '@fahybrid/shared/domain/prescription/format';
import { selectRunMark } from '@fahybrid/shared/domain/athlete/mark-projection';
import { RUN_MARK_SLUGS } from '@fahybrid/shared/domain/athlete/marks';
import {
  collapseToPolarization,
  polarizationPct,
  polarizationTargetFrom,
  type PolarizationSplit,
} from '@fahybrid/shared/domain/coach/hr-method';
import type { CoachRunningThresholds } from '@fahybrid/shared/domain/coach/running-thresholds';
import {
  historiaDe,
  MAX_VENTANA_SEMANAS,
  VENTANA_POR_DEFECTO_SEMANAS,
  type Historia,
} from '@fahybrid/shared/domain/analytics';
import {
  coberturaDe,
  deltasDe,
  mediasPorTipo,
  mismoTipoDe,
  sePuedeJuzgarElPedido,
  veredictoDe,
  type Cobertura,
  type Deltas,
  type PuntoSemana,
  type RunningHistory,
  type TipoObservacion,
  type UmbralRitmo,
  type ZonaRitmo,
  type Veredicto,
  type Vo2Lectura,
} from '@fahybrid/shared/domain/running/progress';

/**
 * Cuánto historial se recorre. Doce semanas es lo que necesita «correr cansado»
 * para acumular parejas (`COMPROMISED_WINDOW_WEEKS`) y da ocho barras largas de
 * volumen sin que la gráfica deje de leerse. No es método del coach: es cuánto
 * se mira hacia atrás, no un umbral de juicio.
 *
 * EL TOPE LLEGA A UNA CARRERA ENTERA. Con 26 semanas, a un atleta con siete
 * meses se le contestaba «los últimos seis meses» cuando preguntaba «¿cuánto he
 * mejorado desde que empecé?». El coste de abrirlo está medido y es plano
 * (~230 ms a cualquier ancho): las consultas son barridos por rango acotados por
 * las sesiones que el atleta tiene, no por lo ancha que sea la ventana. Ver
 * `shared/domain/analytics/ventana.ts`.
 */
export const PROGRESS_DEFAULT_WEEKS = VENTANA_POR_DEFECTO_SEMANAS;
export const PROGRESS_MAX_WEEKS = MAX_VENTANA_SEMANAS;

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export interface RunningProgressPayload {
  athlete_id: string;
  generated_at_iso: string;
  window_weeks: number;
  /** Los umbrales del coach REALMENTE usados, para que la pantalla pueda decir
   *  «hacen falta 6 semanas» sin volver a resolverlos ni cablearlos. */
  method: CoachRunningThresholds;
  history: RunningHistory;
  verdict: Veredicto;
  coverage: Cobertura;
  /**
   * Las cifras que la pantalla dibuja bajo cada titular, YA CALCULADAS.
   *
   * Dos de ellas deciden: la subida de volumen es el segundo ingrediente de
   * «cargando de más», y el % en banda (dentro de `history.pedido`) decide el
   * color de su cifra. Recalcularlas al dibujar sería tener dos motores para el
   * número que sostiene un veredicto, y el día que uno cambie el veredicto y su
   * evidencia se contradirían en la misma pantalla.
   */
  deltas: Deltas;
  /**
   * EL REPARTO, YA PLEGADO Y CON EL OBJETIVO DEL COACH.
   *
   * Va aparte de `history.zonas_s` a propósito. La barra necesita las cinco
   * zonas (eso es `zonas_s`), pero la cifra que titula el bloque es el «%
   * suave», y plegar cinco zonas en tres bandas es MÉTODO del coach: dónde
   * acaba lo fácil y dónde empieza lo duro lo decide él (`coach_hr_method`).
   * Si el servidor mandara sólo los segundos, cada cliente tendría que plegar
   * por su cuenta y el 80 % acabaría cableado en Swift — que es exactamente lo
   * que la Regla Nº0 prohíbe. Se pliega aquí, una vez, con su método.
   *
   * `pct` es NULL cuando no hay ni un segundo repartido. Nunca 0/0/0: un
   * reparto que suma cero no es un reparto equilibrado, es que no se sabe.
   */
  polarization: {
    pct: PolarizationSplit | null;
    /** El que este coach persigue. La marca sobre la barra sale de aquí. */
    target: PolarizationSplit;
    /** Los dos puntos de plegado, para que el cliente pueda colorear las cinco
     *  zonas por la banda a la que pertenecen sin adivinarlos. */
    low_max_zone: number;
    mid_max_zone: number;
  };
  /**
   * Cuánta historia tiene el atleta DE VERDAD, y si `window_weeks` la abarca
   * entera. `history.semanas` sólo cuenta lo que cabe en la ventana; esto cuenta
   * su vida en la app. Sin la distinción, pedir 520 semanas a quien lleva diez
   * enseñaría sus diez bajo el rótulo «dos años», y «desde que empecé» sería
   * una etiqueta y no una afirmación.
   */
  historia: Historia;
  /** Por qué una lectura salió vacía. No se dibuja: se mira cuando algo falta. */
  diagnostics: {
    same_hr: SameHrPaceSeries['rejected'] & { accepted: number; reference_bpm: number };
    sessions_walked: number;
  };
}

export async function buildRunningProgress(args: {
  athlete_id: number;
  now?: Date;
  weeks?: number;
  client?: Sql;
}): Promise<RunningProgressPayload> {
  const client = args.client ?? defaultSql;
  const now = args.now ?? new Date();
  const window_weeks = Math.min(
    PROGRESS_MAX_WEEKS,
    Math.max(1, Math.trunc(args.weeks ?? PROGRESS_DEFAULT_WEEKS)),
  );
  const since = new Date(now.getTime() - window_weeks * MS_PER_WEEK);
  /** La ventana ANTERIOR, del mismo largo: la sombra de la curva de esfuerzos. */
  const shadowSince = new Date(since.getTime() - window_weeks * MS_PER_WEEK);

  // El coach del atleta gobierna los umbrales y el reparto que se persigue. Sin
  // coach (atleta huérfano), los defectos del sistema — nunca un fallo duro:
  // la pantalla del atleta no puede caerse porque le falte un vínculo.
  const coach_id = await loadCoachId(client, args.athlete_id);

  const [thresholds, hrMethod, zones, vo2max, volume, firstDayIso, targetRace] = await Promise.all([
    resolveEffectiveRunningThresholds(coach_id ?? 0, client),
    resolveAthleteHrMethod(args.athlete_id, client),
    loadAthleteHrZones(args.athlete_id, client),
    buildAthleteVo2Max({ athlete_id: args.athlete_id, client }),
    loadWeeklyRunVolume({ athlete_id: args.athlete_id, weeks: window_weeks, now, client }),
    loadFirstActivityDate(client, args.athlete_id),
    getTargetRace(args.athlete_id, client),
  ]);

  // ── EL ANCLA ───────────────────────────────────────────────────────────────
  // «Zonas medidas» = tiene un umbral que vale como EVIDENCIA. Un umbral
  // deducido de su fecha de nacimiento no lo es: la propia escalera de
  // `hr-zones.ts` dice que una generalización de población nunca puntúa como
  // evidencia, y dibujarle un reparto sobre ella sería convertir una
  // estimación nuestra en un hecho suyo.
  const zonas_medidas = zones != null && zones.confidence !== 'estimated';
  const referenceZone = thresholds.same_hr_reference_zone;
  const band = zones?.bands.find((b) => b.zone === referenceZone) ?? null;
  const ppm_referencia = zonas_medidas && band ? (referenceBpmFromBand(band) ?? 0) : 0;

  // ── LAS SESIONES, recorridas UNA vez ───────────────────────────────────────
  const sessions = await loadQualifyingRunSessions(client, args.athlete_id, since, now);
  const walked = sessions.length ? await analizarSesiones(client, args.athlete_id, sessions) : [];

  // ADHERENCIA AGREGADA. Sólo tramos de RITMO: un tramo juzgado por pulso o por
  // RPE contesta otra pregunta y sumarlo bajo el mismo porcentaje mezclaría
  // tres cosas. Mismo criterio que la calibración del coach.
  const verdicts = walked.flatMap((s) =>
    s.tramos.filter((t) => t.band_axis === 'pace').map((t) => t.verdict),
  );
  const resumen = summarizeRunCompliance(verdicts);
  // `evaluable === 0` no es un 0 %: es que nunca le pusieron un ritmo objetivo.
  // Eso es la falta «intención», y se dice callándose, no con un cero.
  const pedido =
    resumen.evaluable > 0
      ? {
          evaluadas: resumen.evaluable,
          dentro: resumen.dentro,
          fuera_lento: resumen.fuera_lento,
          fuera_rapido: resumen.fuera_rapido,
          // `pct_dentro` ya lo calcula el sumador compartido: se servía y se
          // tiraba, y el cliente repetía la división para pintar la cifra.
          pct_en_banda: resumen.pct_dentro,
          juzgable: sePuedeJuzgarElPedido(
            {
              evaluadas: resumen.evaluable,
              dentro: resumen.dentro,
              fuera_lento: resumen.fuera_lento,
              fuera_rapido: resumen.fuera_rapido,
              pct_en_banda: resumen.pct_dentro,
              juzgable: false,
            },
            thresholds,
          ),
        }
      : null;

  // ── LO QUE PIDE UNA CONSULTA PROPIA ────────────────────────────────────────
  const [sameHrRows, curveRows, zoneWindow, compromisedObs, tipoRows, perfilRitmo] = await Promise.all([
    loadSameHrObservations(client, args.athlete_id, since, now),
    loadCurveCandidates(client, args.athlete_id, shadowSince, now),
    loadZonesForWindow(client, args.athlete_id, since, window_weeks),
    loadCompromisedPaceObservations(client, args.athlete_id, now),
    loadTypeAndCadence(client, args.athlete_id, since, now),
    loadPaceThreshold(client, args.athlete_id),
  ]);

  // ── FORMA: el ritmo al mismo pulso ─────────────────────────────────────────
  const sameHr = buildSameHrPaceSeries(
    // Sin ancla que valga, ni se intenta: la corrección necesita una referencia
    // real, y una inventada produciría una serie con aspecto de dato.
    zonas_medidas && ppm_referencia > 0 ? sameHrRows : [],
    {
      reference_bpm: ppm_referencia,
      tolerance_bpm: thresholds.same_hr_tolerance_bpm,
      min_distance_m: thresholds.same_hr_min_distance_m,
      gradient_retires_pace_pct: thresholds.gradient_retires_pace_pct,
    },
  );

  // ── ESFUERZOS: la curva y su sombra ────────────────────────────────────────
  const sinceMs = since.getTime();
  const esfuerzos = buildEffortCurve(
    curveRows.filter((r) => Date.parse(r.day) >= sinceMs).map(toCandidate),
  );
  const esfuerzos_antes = buildEffortCurve(
    curveRows.filter((r) => Date.parse(r.day) < sinceMs).map(toCandidate),
  );

  // ── REPARTO: sólo si lo repartió un ancla que vale ─────────────────────────
  const zonas_s = zoneWindow.zonas_s;
  const segundos_corriendo = zoneWindow.total_s;

  // ── CORRER CANSADO ─────────────────────────────────────────────────────────
  const compromised = buildCompromisedPaceTrend(compromisedObs, {
    min_pairs_for_trend: thresholds.min_pairs_for_compromised_trend,
  });
  const cansado = compromised.points.map((p) => ({
    semana: p.week_start,
    coste_s_km: p.cost_s_per_km,
    parejas: p.bands,
  }));

  // ── EL TERCER PELDAÑO, Y SU GRÁFICO ────────────────────────────────────────
  // Las dos salen de `tipoRows`, no de `sameHrRows`. Es una corrección de fondo:
  // este peldaño existe para el atleta SIN pulso fiable, y alimentarlo de la
  // consulta que exige `avg_hr is not null` se lo negaba justo a su único
  // destinatario. Y saliendo las dos de la misma lista, el veredicto no puede
  // nombrar un tipo que la lista de abajo no enseñe.
  const tipoObs = tipoRows.map(toTipoObservacion);
  const mismo_tipo = mismoTipoDe(tipoObs);
  const por_tipo = mediasPorTipo(tipoObs);

  // ── LA CARRERA ─────────────────────────────────────────────────────────────
  const carrera = targetRace
    ? {
        nombre: targetRace.name,
        dias: targetRace.days_until,
        predicho_s: await loadPredictedSeconds(client, args.athlete_id),
      }
    : null;

  const history: RunningHistory = {
    semanas: weeksSince(firstDayIso, now),
    zonas_medidas,
    con_pulso: zoneWindow.has_hr,
    ppm_referencia,
    zona_referencia: zonas_medidas && ppm_referencia > 0 ? referenceZone : null,
    vo2: toVo2(vo2max),
    al_pulso: sameHr.points.map((p): PuntoSemana => ({ semana: p.semana, valor: p.valor })),
    esfuerzos,
    esfuerzos_antes,
    semanas_km: volume.weeks.map((w): PuntoSemana => ({ semana: w.week_start, valor: w.km })),
    zonas_s,
    segundos_corriendo,
    pedido,
    cansado,
    carrera,
    mismo_tipo,
    umbral: perfilRitmo.umbral,
    zonas_ritmo: perfilRitmo.zonas,
    cadencia: cadenciaPorSemana(tipoRows),
    por_tipo,
  };

  const primera = await loadPrimeraSesion(client, args.athlete_id);

  return {
    athlete_id: String(args.athlete_id),
    generated_at_iso: now.toISOString(),
    window_weeks,
    method: thresholds,
    historia: historiaDe({
      dias_de_historia: primera.dias,
      primera_sesion_iso: primera.iso,
      ventana_dias: window_weeks * 7,
    }),
    history,
    verdict: veredictoDe(history, thresholds),
    coverage: coberturaDe(history, thresholds),
    deltas: deltasDe(history),
    polarization: {
      // `polarizationPct` devuelve null con total 0, que es justo lo que hace
      // falta: el atleta sin ancla llega aquí con las cinco zonas vacías.
      pct: polarizationPct(
        collapseToPolarization(
          { 1: zonas_s.z1 ?? 0, 2: zonas_s.z2 ?? 0, 3: zonas_s.z3 ?? 0, 4: zonas_s.z4 ?? 0, 5: zonas_s.z5 ?? 0 },
          hrMethod,
        ),
      ),
      target: polarizationTargetFrom(hrMethod),
      low_max_zone: hrMethod.polarization_low_max_zone,
      mid_max_zone: hrMethod.polarization_mid_max_zone,
    },
    diagnostics: {
      same_hr: { ...sameHr.rejected, accepted: sameHr.accepted, reference_bpm: sameHr.reference_bpm },
      sessions_walked: walked.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Conversiones
// ---------------------------------------------------------------------------

/**
 * El VO₂máx, con su delta contra la base de la propia serie.
 *
 * El delta es NULL, no cero, cuando `buildAthleteVo2Max` no pudo calcular base
 * (serie demasiado corta). Cero diría «lo medimos y no se movió», y lo que pasa
 * es que todavía no hay contra qué. Y la ventana es el largo REAL de la serie,
 * no una promesa: si abarca tres semanas, dice tres.
 */
function toVo2(v: Awaited<ReturnType<typeof buildAthleteVo2Max>>): Vo2Lectura | null {
  if (!v.headline) return null;
  const serie = v.series.map((p) => p.value);
  const primero = v.series[0]?.iso_date;
  const ultimo = v.series[v.series.length - 1]?.iso_date;
  const ventana_semanas =
    primero && ultimo
      ? Math.max(1, Math.round((Date.parse(ultimo) - Date.parse(primero)) / MS_PER_WEEK))
      : 1;
  return {
    valor: v.headline.value,
    delta: v.baseline != null ? Math.round((v.headline.value - v.baseline) * 10) / 10 : null,
    ventana_semanas,
    serie,
  };
}

export interface CurveRow {
  day: string;
  distance_m: number;
  duration_s: number;
  scope: 'segment' | 'execution';
}

export function toCandidate(r: CurveRow): EffortCandidate {
  return { distance_m: r.distance_m, duration_s: r.duration_s, scope: r.scope };
}

interface SameHrRow extends SameHrObservation {
  duration_s: number;
}

/** Un tramo de trabajo con su tipo prescrito y su cadencia. Sin exigir pulso:
 *  de aquí salen el tercer peldaño, las medias por tipo y la cadencia, y las
 *  tres tienen que existir para el atleta que corre sin banda. */
interface TipoRow {
  week_start: string;
  execution_id: string;
  tipo: string | null;
  pace_s_per_km: number;
  distance_m: number;
  cadence_spm: number | null;
}

function toTipoObservacion(r: TipoRow): TipoObservacion {
  return {
    tipo: r.tipo ?? '',
    semana: r.week_start,
    // El ritmo CRUDO, sin corregir por pulso: este peldaño existe justo para
    // quien no tiene pulso fiable, así que corregirlo aquí lo dejaría vacío
    // para su único destinatario.
    pace_s_per_km: r.pace_s_per_km,
    distance_m: r.distance_m,
    sesion_id: r.execution_id,
  };
}

/**
 * Cadencia media por semana, ponderada por distancia — la misma ponderación que
 * usaba la tarjeta anterior, por la misma razón: contar igual un tramo de 400 m
 * y un rodaje de 8 km deja que la sesión troceada mande sobre la semana.
 *
 * Una semana sin ningún tramo con cadencia NO tiene punto. La cadencia la
 * reporta el reloj y falta a menudo; un cero diría «corrió sin dar pasos».
 */
function cadenciaPorSemana(rows: readonly TipoRow[]): PuntoSemana[] {
  const por = new Map<string, { metros: number; ponderado: number }>();
  for (const r of rows) {
    if (r.cadence_spm == null || !Number.isFinite(r.cadence_spm) || r.cadence_spm <= 0) continue;
    if (r.distance_m <= 0) continue;
    const e = por.get(r.week_start) ?? { metros: 0, ponderado: 0 };
    e.metros += r.distance_m;
    e.ponderado += r.cadence_spm * r.distance_m;
    por.set(r.week_start, e);
  }
  return [...por.entries()]
    .filter(([, e]) => e.metros > 0)
    .map(([semana, e]) => ({ semana, valor: Math.round(e.ponderado / e.metros) }))
    .sort((a, b) => a.semana.localeCompare(b.semana));
}

/** Semanas enteras desde la primera sesión ejecutada. 0 cuando no ha corrido
 *  nunca — y 0 semanas de historia es una respuesta, no un hueco. */
/**
 * La PRIMERA sesión del atleta, sin ventana que la acote — la que decide si lo
 * que se enseña es «desde que empezaste» o sólo «las últimas N semanas».
 */
async function loadPrimeraSesion(
  client: Sql,
  athlete_id: number,
): Promise<{ dias: number | null; iso: string | null }> {
  const rows = await client<Array<{ first_at: Date | null }>>`
    select min(coalesce(we.ended_at, we.started_at, we.created_at)) as first_at
    from workout_executions we
    where we.athlete_id = ${athlete_id}
  `;
  const first = rows[0]?.first_at ?? null;
  if (first == null) return { dias: null, iso: null };
  const d = new Date(first);
  return {
    dias: Math.max(0, Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))),
    iso: d.toISOString().slice(0, 10),
  };
}

function weeksSince(firstDayIso: string | null, now: Date): number {
  if (!firstDayIso) return 0;
  const t = Date.parse(firstDayIso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / MS_PER_WEEK));
}

// ---------------------------------------------------------------------------
// Cargadores
// ---------------------------------------------------------------------------

async function loadCoachId(client: Sql, athlete_id: number): Promise<number | null> {
  const rows = await client<Array<{ coach_id: number | null }>>`
    select coach_id from athletes where id = ${athlete_id} limit 1
  `;
  return rows[0]?.coach_id ?? null;
}

async function loadFirstActivityDate(client: Sql, athlete_id: number): Promise<string | null> {
  const rows = await client<Array<{ first_day: string | null }>>`
    select min(coalesce(we.ended_at, we.started_at, we.created_at))::text as first_day
    from workout_executions we
    where we.athlete_id = ${athlete_id}
  `;
  return rows[0]?.first_day ?? null;
}

/**
 * Los tramos candidatos al «ritmo al mismo pulso»: trabajo de carrera con
 * pulso Y ritmo medidos, con su pendiente y su contexto para poder descartar
 * cuestas y esfuerzos cansados aguas abajo.
 *
 * La clasificación fresco/fatigado se resuelve aquí con `classifyEffort` — el
 * MISMO criterio que usan «carrera comprometida» y el cruce carrera×entreno, no
 * un tercero que pudiera discrepar.
 */
async function loadSameHrObservations(
  client: Sql,
  athlete_id: number,
  since: Date,
  until: Date,
): Promise<SameHrRow[]> {
  const rows = await client<
    Array<{
      week_start: string;
      avg_hr: number | null;
      pace_s_per_km: number | null;
      distance_m: number | null;
      gradient_pct: number | null;
      context_format: string | null;
      prior_work_s: number | null;
      position: number;
      duration_s: number | null;
    }>
  >`
    select
      to_char(
        date_trunc(
          'week',
          coalesce(we.ended_at, we.started_at) at time zone
            coalesce((select a.timezone from athletes a where a.id = ${athlete_id}), ${BOX_TIMEZONE})
        )::date,
        'YYYY-MM-DD'
      )                                                     as week_start,
      se.avg_hr                                             as avg_hr,
      coalesce(
        se.avg_pace_s_per_km,
        case
          when se.distance_meters > 0
            and extract(epoch from (se.ended_at - se.started_at)) > 0
          then extract(epoch from (se.ended_at - se.started_at)) / (se.distance_meters / 1000.0)
        end
      )                                                     as pace_s_per_km,
      se.distance_meters                                    as distance_m,
      se.avg_gradient_pct                                   as gradient_pct,
      se.context_format                                     as context_format,
      se.prior_work_s                                       as prior_work_s,
      se.position                                           as position,
      extract(epoch from (se.ended_at - se.started_at))      as duration_s
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    where we.athlete_id = ${athlete_id}
      and se.modality = 'run'
      and se.avg_hr is not null
      and coalesce(we.ended_at, we.started_at) >= ${since.toISOString()}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${until.toISOString()}::timestamptz
      and ${SEG_IS_WORK_EFFORT(client)}
  `;

  return rows.flatMap((r) => {
    const pace = r.pace_s_per_km != null ? Number(r.pace_s_per_km) : null;
    const dist = r.distance_m != null ? Number(r.distance_m) : null;
    if (r.avg_hr == null || pace == null || dist == null) return [];
    const duration_s = r.duration_s != null ? Number(r.duration_s) : 0;
    return [
      {
        week_start: r.week_start,
        avg_hr: Number(r.avg_hr),
        pace_s_per_km: pace,
        distance_m: dist,
        gradient_pct: r.gradient_pct != null ? Number(r.gradient_pct) : null,
        effort: classifyEffort({
          value_s: duration_s,
          context_format: r.context_format,
          prior_work_s: r.prior_work_s != null ? Number(r.prior_work_s) : null,
          position: r.position,
        }),
        tipo: r.context_format,
        duration_s,
      },
    ];
  });
}

/**
 * Los candidatos de la curva de esfuerzos, de las DOS ventanas de una vez (la
 * actual y su sombra) para no repetir el viaje: se separan por fecha al llegar.
 *
 * Dos alcances, como manda `EFFORT_CURVE_BANDS`: los tramos sueltos alimentan
 * las distancias cortas y el total corrido de cada sesión alimenta las largas.
 * El total de la sesión suma TODO lo corrido, recuperaciones incluidas — que es
 * lo que significa «mi mejor 10 km»: los kilómetros que hicieron las piernas.
 */
export async function loadCurveCandidates(
  client: Sql,
  athlete_id: number,
  since: Date,
  until: Date,
): Promise<CurveRow[]> {
  const [segments, executions] = await Promise.all([
    client<Array<{ day: string; distance_m: number | null; duration_s: number | null }>>`
      select
        coalesce(we.ended_at, we.started_at)::text          as day,
        se.distance_meters                                  as distance_m,
        extract(epoch from (se.ended_at - se.started_at))    as duration_s
      from segment_executions se
      join workout_executions we on we.id = se.execution_id
      where we.athlete_id = ${athlete_id}
        and se.modality = 'run'
        and se.distance_meters > 0
        and se.ended_at is not null
        and se.started_at is not null
        and coalesce(we.ended_at, we.started_at) >= ${since.toISOString()}::timestamptz
        and coalesce(we.ended_at, we.started_at) <= ${until.toISOString()}::timestamptz
        and ${SEG_IS_WORK_EFFORT(client)}
    `,
    client<Array<{ day: string; distance_m: number | null; duration_s: number | null }>>`
      select
        coalesce(we.ended_at, we.started_at)::text                          as day,
        sum(se.distance_meters)                                             as distance_m,
        sum(extract(epoch from (se.ended_at - se.started_at)))               as duration_s
      from segment_executions se
      join workout_executions we on we.id = se.execution_id
      where we.athlete_id = ${athlete_id}
        and se.modality = 'run'
        and se.distance_meters > 0
        and se.ended_at is not null
        and se.started_at is not null
        and coalesce(we.ended_at, we.started_at) >= ${since.toISOString()}::timestamptz
        and coalesce(we.ended_at, we.started_at) <= ${until.toISOString()}::timestamptz
      group by we.id, coalesce(we.ended_at, we.started_at)
    `,
  ]);

  const usable = (r: { day: string; distance_m: number | null; duration_s: number | null }) =>
    r.distance_m != null && r.duration_s != null && Number(r.duration_s) > 0;

  return [
    ...segments.filter(usable).map((r): CurveRow => ({
      day: r.day,
      distance_m: Number(r.distance_m),
      duration_s: Number(r.duration_s),
      scope: 'segment',
    })),
    ...executions.filter(usable).map((r): CurveRow => ({
      day: r.day,
      distance_m: Number(r.distance_m),
      duration_s: Number(r.duration_s),
      scope: 'execution',
    })),
  ];
}

/**
 * Los tramos de trabajo de la ventana con su TIPO prescrito y su cadencia.
 *
 * SIN `avg_hr is not null`, a diferencia de `loadSameHrObservations`, y esa es
 * toda la diferencia: de aquí salen el tercer peldaño de la escalera, las medias
 * por tipo y la cadencia, y las tres tienen que funcionar para el atleta que
 * corre sin banda de pulso — que es exactamente para quien existe ese peldaño.
 *
 * El TIPO es el `scheme` que prescribió el coach, normalizado por
 * `normalizeFormat`: el mismo criterio y el mismo vocabulario que ya usaba la
 * tarjeta «Carrera por tipo», para que las medias no cambien de significado al
 * cambiar de pantalla.
 */
async function loadTypeAndCadence(
  client: Sql,
  athlete_id: number,
  since: Date,
  until: Date,
): Promise<TipoRow[]> {
  const rows = await client<
    Array<{
      week_start: string;
      execution_id: string;
      scheme: string | null;
      pace_s_per_km: number | null;
      distance_m: number | null;
      cadence_spm: number | null;
    }>
  >`
    select
      to_char(
        date_trunc(
          'week',
          coalesce(we.ended_at, we.started_at) at time zone
            coalesce((select a.timezone from athletes a where a.id = ${athlete_id}), ${BOX_TIMEZONE})
        )::date,
        'YYYY-MM-DD'
      )                                                     as week_start,
      se.execution_id::text                                 as execution_id,
      ts.prescription_json->>'scheme'                       as scheme,
      coalesce(
        se.avg_pace_s_per_km,
        case
          when se.distance_meters > 0
            and extract(epoch from (se.ended_at - se.started_at)) > 0
          then extract(epoch from (se.ended_at - se.started_at)) / (se.distance_meters / 1000.0)
        end
      )                                                     as pace_s_per_km,
      se.distance_meters                                    as distance_m,
      se.run_cadence_spm                                    as cadence_spm
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    left join template_segments ts on ts.id = se.template_segment_id
    where we.athlete_id = ${athlete_id}
      and se.modality = 'run'
      and se.distance_meters > 0
      and coalesce(we.ended_at, we.started_at) >= ${since.toISOString()}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${until.toISOString()}::timestamptz
      and ${SEG_IS_WORK_EFFORT(client)}
  `;

  return rows.flatMap((r) => {
    const pace = r.pace_s_per_km != null ? Number(r.pace_s_per_km) : null;
    const dist = r.distance_m != null ? Number(r.distance_m) : null;
    if (pace == null || dist == null || !Number.isFinite(pace) || pace <= 0 || dist <= 0) return [];
    return [
      {
        week_start: r.week_start,
        execution_id: r.execution_id,
        tipo: normalizeFormat(r.scheme ?? undefined) ?? null,
        pace_s_per_km: pace,
        distance_m: dist,
        cadence_spm: r.cadence_spm != null ? Number(r.cadence_spm) : null,
      },
    ];
  });
}

/**
 * EL UMBRAL DE RITMO y sus bandas — el número del que sale todo lo demás.
 *
 * Es OTRA ancla, no la de pulso: vive en `athlete_zone_profiles` (modalidad
 * run), en segundos por kilómetro, y un atleta puede tener ésta y no la de
 * pulso o al revés. Se sirve con `origen` y `sin_revisar` para que la pantalla
 * pueda decir que unas zonas derivadas en el alta son reales pero sin confirmar.
 *
 * El VDOT sale de `selectRunMark` — el MISMO selector del que prescribe el
 * plan, no del último 5 km que haya en la tabla. Si esta pantalla sacara su
 * propio VDOT, el atleta vería un nivel aquí y su plan usaría otro.
 */
async function loadPaceThreshold(
  client: Sql,
  athlete_id: number,
): Promise<{ umbral: UmbralRitmo | null; zonas: ZonaRitmo[] }> {
  const [perfil, marcas] = await Promise.all([
    client<Array<{ threshold_s: string | null; zones_json: unknown; source: string | null; needs_review: boolean | null }>>`
      select threshold_s::text as threshold_s, zones_json, source, needs_review
      from athlete_zone_profiles
      where athlete_id = ${athlete_id} and modality = 'run'
      order by version desc
      limit 1
    `,
    client<Array<{ exercise_slug: string; value: string; age_days: number | null; source: string; run_context: string | null }>>`
      select exercise_slug, value::text as value,
             (current_date - recorded_at::date)::int as age_days,
             source, run_context
      from athlete_benchmarks
      where athlete_id = ${athlete_id} and exercise_slug = any(${RUN_MARK_SLUGS}::text[])
      order by recorded_at desc
    `,
  ]);

  const runMark = selectRunMark(
    marcas.flatMap((r) => {
      const value = Number(r.value);
      if (!Number.isFinite(value)) return [];
      return [{ slug: r.exercise_slug, value, age_days: r.age_days, source: r.source, run_context: r.run_context }];
    }),
  );

  const fila = perfil[0];
  const zonas: ZonaRitmo[] = Array.isArray(fila?.zones_json) ? (fila!.zones_json as ZonaRitmo[]) : [];
  const ritmo_s_km = fila?.threshold_s != null ? Number(fila.threshold_s) : null;

  // Ni perfil ni marca: no hay umbral que enseñar. Null, no un objeto de nulos
  // — la pantalla tiene que poder distinguir «no tiene» de «tiene y está vacío».
  if (fila == null && runMark == null) return { umbral: null, zonas: [] };

  return {
    umbral: {
      ritmo_s_km: ritmo_s_km != null && Number.isFinite(ritmo_s_km) ? ritmo_s_km : null,
      vdot: runMark ? runMark.vdot : null,
      vdot_desde: runMark ? runMark.spec.label : null,
      origen: fila?.source ?? null,
      sin_revisar: fila?.needs_review === true,
    },
    zonas,
  };
}

/**
 * El reparto de la ventana, sumado de las semanas — y GOBERNADO POR EL ANCLA
 * QUE LO REPARTIÓ.
 *
 * Aquí está el cero que más fácil se cuela: la tabla `segment_zone_seconds`
 * tiene un CHECK que obliga a poner las cinco zonas a 0 cuando no había ancla,
 * así que sumar sin mirar devolvería un reparto perfectamente formado, lleno de
 * ceros, para el atleta que nunca se ha medido. Se comprueba el ancla con la
 * que se computó cada fila (`HR_ANCHOR_CONFIDENCE`) y, si lo que la repartió
 * fue una estimación nuestra, no hay reparto: hay un hueco con su motivo.
 *
 * `no_hr_s` NO entra en el total: el total es el tiempo repartido, y meter el
 * tiempo sin pulso dentro haría que los porcentajes bajaran por no llevar el
 * pulsómetro, no por correr distinto.
 */
async function loadZonesForWindow(
  client: Sql,
  athlete_id: number,
  since: Date,
  weeks: number,
): Promise<{
  zonas_s: Partial<Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5', number>>;
  total_s: number;
  has_hr: boolean;
}> {
  const week_start = isoMonday(since);
  const { weeks_data, anchors } = await loadZoneWindow({
    athlete_id,
    week_start,
    weeks,
    modality: 'run',
    client,
  });

  const medido = anchors.filter((a) => HR_ANCHOR_CONFIDENCE[a.source] !== 'estimated');
  const has_hr = weeks_data.some((w) => w.z1_s + w.z2_s + w.z3_s + w.z4_s + w.z5_s + w.no_hr_s > 0);
  if (medido.length === 0) return { zonas_s: {}, total_s: 0, has_hr };

  const suma = (pick: (w: (typeof weeks_data)[number]) => number) =>
    weeks_data.reduce((a, w) => a + pick(w), 0);

  const zonas_s = {
    z1: suma((w) => w.z1_s),
    z2: suma((w) => w.z2_s),
    z3: suma((w) => w.z3_s),
    z4: suma((w) => w.z4_s),
    z5: suma((w) => w.z5_s),
  };
  const total_s = zonas_s.z1 + zonas_s.z2 + zonas_s.z3 + zonas_s.z4 + zonas_s.z5;
  return { zonas_s, total_s, has_hr };
}

/** El lunes de la semana de una fecha, en ISO. La ventana de zonas se pide por
 *  semana entera, así que la fecha suelta hay que llevarla a su lunes. */
function isoMonday(d: Date): string {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // getUTCDay: 0 = domingo. El lunes de un domingo está 6 días atrás, no mañana.
  const shift = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - shift);
  return utc.toISOString().slice(0, 10);
}

/**
 * El tiempo previsto de su carrera objetivo. Sale del predictor que YA existe y
 * que la app ya enseña en «Camino al objetivo» — un segundo predictor aquí daría
 * dos cifras distintas para la misma carrera en dos pantallas de la misma app.
 *
 * Null es lo normal y es correcto: el predictor devuelve null mientras algún
 * tramo de la carrera no tenga evidencia, en vez de rellenarlo con el
 * presupuesto. Un primerizo no tiene previsión, y no se la inventamos.
 */
async function loadPredictedSeconds(client: Sql, athlete_id: number): Promise<number | null> {
  const gap = await buildGoalGap({ athlete_id }, client);
  return gap.predicted_total_s;
}
