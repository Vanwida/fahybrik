import 'server-only';

// LAS ANALÍTICAS DEL ATLETA — el wire que junta las lecturas.
//
// QUÉ ES ESTO Y QUÉ NO
// --------------------
// Aquí no se calcula nada. Los motores viven en `shared/domain/analytics`
// (carga, capacidad, recuperación), puros y probados sin base de datos; este
// fichero va a buscar los hechos, resuelve el método del coach y devuelve la
// LISTA. La misma línea que ya separa `running/progress.ts` de su wire.
//
// POR QUÉ UNA LISTA Y NO UN OBJETO CON CUARENTA CLAVES
// ----------------------------------------------------
// Ver la cabecera de `shared/domain/analytics/lectura.ts`. En corto: una lectura
// nueva tiene que poder aparecer sin tocar el cliente, y hoy no puede — la
// pantalla de carrera sirve cuatro campos que iOS decide no decodificar porque
// añadir uno cuesta tocar el tipo, el ensamblador y el modelo Codable a la vez.
//
// EL CALENTAMIENTO SE LEE Y NO SE DIBUJA
// --------------------------------------
// La media móvil de 42 días sembrada en cero sube durante semanas por pura
// aritmética. Se leen `ventana + CTL_WARMUP_DAYS` días para que el número de hoy
// sea el de verdad, y se dibuja solo la ventana pedida.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { CTL_WARMUP_DAYS, getDailyTssSeries } from '@/lib/training-load';
import { resolveEffectiveAnalyticsMethod } from '@/lib/coach/analytics-method';
import { resolveEffectiveRunningThresholds } from '@/lib/coach/running-thresholds';
import { buildEffortCurve } from '@fahybrid/shared/domain/running/best-efforts';
import {
  ajustarVelocidadCritica,
  hechosDe,
  historiaDe,
  lecturasCapacidad,
  lecturasCarga,
  ventanaAdmisible,
  VENTANA_POR_DEFECTO_SEMANAS,
  MAX_VENTANA_SEMANAS,
  type CoachAnalyticsMethod,
  type EsfuerzoMaximal,
  type Hecho,
  type Historia,
  type Lectura,
} from '@fahybrid/shared/domain/analytics';
import { loadLecturasRecuperacion } from './recuperacion-datos';
import { loadCurveCandidates, toCandidate } from './running-progress';

/**
 * Ventanas, en semanas. El tope llega a una carrera deportiva entera para que
 * «desde que empecé» tenga respuesta — ver `shared/domain/analytics/ventana.ts`,
 * donde está medido por qué abrirlo no cuesta.
 */
export const ANALYTICS_DEFAULT_WEEKS = VENTANA_POR_DEFECTO_SEMANAS;
export const ANALYTICS_MAX_WEEKS = MAX_VENTANA_SEMANAS;

const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface AnaliticasAtleta {
  athlete_id: string;
  generado_iso: string;
  ventana: {
    semanas: number;
    dias: number;
    /** ISO `YYYY-MM-DD`, inclusive. */
    desde: string;
    hasta: string;
  };
  /**
   * El método del coach REALMENTE usado. Viaja para que el cliente pueda decir
   * «avisa a partir de +5» o colorear el cociente por sus bandas sin volver a
   * resolverlo ni, mucho peor, cablearlo — que es lo que la Regla Nº0 prohíbe.
   */
  metodo: CoachAnalyticsMethod;
  /**
   * Cuánta historia hay DE VERDAD, y si la ventana la abarca entera. Sin esto,
   * pedir 520 semanas a quien lleva diez le enseñaría sus diez semanas bajo el
   * rótulo «dos años».
   */
  historia: Historia;
  lecturas: Lectura[];
  /**
   * Lo que la pantalla puede AFIRMAR, en lenguaje de atleta, con los ids de las
   * lecturas de las que sale cada frase. Puede venir vacío: no siempre hay algo
   * que decirle, y llenar el hueco con una frase inventada es el ruido que todo
   * este contrato existe para evitar.
   */
  hechos: Hecho[];
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * El día de HOY del atleta, en su zona.
 *
 * No vale cortar `now` en UTC: el sueño y el pulso en reposo pertenecen al día
 * LOCAL, y en Barcelona la mayoría de esas lecturas llegan a las 00:0x locales —
 * las 22:0x UTC del día anterior. Cortar en UTC les cambiaría el día a casi
 * todas, que es exactamente el error que `resting-hr.ts` documenta y evita.
 */
async function loadAthleteContext(
  athlete_id: number,
  client: Sql,
): Promise<{ hoy: string; coach_id: number | null }> {
  const rows = await client<Array<{ hoy: string; coach_id: number | null }>>`
    select
      (now() at time zone coalesce(nullif(a.timezone, ''), ${BOX_TIMEZONE}))::date::text as hoy,
      a.coach_id::int as coach_id
    from athletes a
    where a.id = ${athlete_id}
  `;
  return { hoy: rows[0]?.hoy ?? isoDay(new Date()), coach_id: rows[0]?.coach_id ?? null };
}

/**
 * Desde cuándo hay historia. Null cuando el atleta no ha ejecutado nada: no hay
 * desde cuándo contar, que es distinto de llevar cero días.
 */
async function loadDaysOfHistory(
  athlete_id: number,
  now: Date,
  client: Sql,
): Promise<{ dias: number | null; primera_iso: string | null }> {
  const rows = await client<Array<{ first_at: Date | null }>>`
    select min(coalesce(we.ended_at, we.started_at, we.created_at)) as first_at
    from workout_executions we
    where we.athlete_id = ${athlete_id}
  `;
  const first = rows[0]?.first_at ?? null;
  if (first == null) return { dias: null, primera_iso: null };
  const d = new Date(first);
  return {
    dias: Math.max(0, Math.floor((now.getTime() - d.getTime()) / MS_PER_DAY)),
    primera_iso: isoDay(d),
  };
}

/**
 * El umbral de carrera del atleta como VELOCIDAD, solo si está medido.
 *
 * Sirve de cordura al ajuste de velocidad crítica: las dos miden casi lo mismo
 * por caminos distintos, así que un ajuste que se aleja del umbral no es un
 * descubrimiento, es la prueba de que los esfuerzos no fueron máximos. Un umbral
 * ESTIMADO no vale para esto — comparar una estimación contra otra no valida
 * ninguna de las dos.
 */
async function loadRunThresholdSpeed(
  athlete_id: number,
  client: Sql,
): Promise<{ velocidad_m_s: number } | null> {
  const rows = await client<Array<{ threshold_s: number | null; source: string | null; needs_review: boolean | null }>>`
    select threshold_s::float as threshold_s, source, needs_review
    from athlete_zone_profiles
    where athlete_id = ${athlete_id} and modality = 'run'
    limit 1
  `;
  const row = rows[0];
  if (row?.threshold_s == null || row.threshold_s <= 0) return null;
  const medido = (row.source === 'coach_test' || row.source === 'athlete_test') && row.needs_review !== true;
  if (!medido) return null;
  // s/km → m/s.
  return { velocidad_m_s: 1000 / row.threshold_s };
}

export async function buildAnaliticasAtleta(args: {
  athlete_id: number;
  /** Se resuelve del atleta si no se pasa. */
  coach_id?: bigint | number;
  weeks?: number;
  now?: Date;
  client?: Sql;
}): Promise<AnaliticasAtleta> {
  const client = args.client ?? defaultSql;
  const now = args.now ?? new Date();
  const semanas = ventanaAdmisible(args.weeks);
  const dias = semanas * DAYS_PER_WEEK;
  const desde = new Date(now.getTime() - (dias - 1) * MS_PER_DAY);

  // El método se resuelve DESPUÉS de saber de quién es el atleta: sin coach no
  // hay fila que mezclar y mandan los defectos, que son el comportamiento de
  // siempre.
  const contexto = await loadAthleteContext(args.athlete_id, client);
  const hoyLocal = contexto.hoy;
  const coach_id = args.coach_id ?? contexto.coach_id;
  const [metodo, running] = await Promise.all([
    resolveEffectiveAnalyticsMethod(coach_id ?? 0, client),
    resolveEffectiveRunningThresholds(coach_id ?? 0, client),
  ]);

  const [diario, historial, recuperacion, candidatos, umbral] = await Promise.all([
    // El calentamiento entra en la lectura y no en el dibujo.
    getDailyTssSeries({
      athlete_id: args.athlete_id,
      end_date: now,
      days: dias + CTL_WARMUP_DAYS,
      client,
      gradient_retires_pace_pct: running.gradient_retires_pace_pct,
    }),
    loadDaysOfHistory(args.athlete_id, now, client),
    loadLecturasRecuperacion({ athlete_id: args.athlete_id, hasta: hoyLocal, dias, metodo, client }),
    loadCurveCandidates(client, args.athlete_id, desde, now),
    loadRunThresholdSpeed(args.athlete_id, client),
  ]);

  // La curva de mejores esfuerzos ya existe y ya está probada: se REUTILIZA como
  // materia prima del ajuste en vez de escribir un segundo extractor. Cada
  // peldaño es un esfuerzo distinto del atleta, así que son puntos
  // independientes — que es justo lo que el modelo de dos parámetros necesita.
  const curva = buildEffortCurve(candidatos.map(toCandidate));
  const esfuerzos: EsfuerzoMaximal[] = curva.map((p) => ({
    distancia_m: p.metros,
    duracion_s: p.segundos,
  }));
  const ajuste = ajustarVelocidadCritica(esfuerzos, metodo, umbral);

  const lecturas: Lectura[] = [
    ...lecturasCarga({ diario, metodo, ventana_dias: dias, dias_de_historia: historial.dias }),
    ...lecturasCapacidad({ ajuste, esfuerzos_ofrecidos: esfuerzos.length, dias_ventana: dias }),
    ...recuperacion,
  ];

  // Los hechos salen de las LECTURAS ya construidas, nunca de la base de datos:
  // así un hecho no puede citar un número que la pantalla no esté enseñando.
  const hechos = hechosDe(lecturas, metodo);

  return {
    athlete_id: String(args.athlete_id),
    generado_iso: now.toISOString(),
    ventana: { semanas, dias, desde: isoDay(desde), hasta: hoyLocal },
    metodo,
    historia: historiaDe({
      dias_de_historia: historial.dias,
      primera_sesion_iso: historial.primera_iso,
      ventana_dias: dias,
    }),
    lecturas,
    hechos,
  };
}
