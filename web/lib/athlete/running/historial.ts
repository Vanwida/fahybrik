import 'server-only';

// EL HISTORIAL DE CARRERAS — GET /api/athlete/running/historial (mapa v2,
// docs/superpowers/plans/2026-08-13-carrera-hub-ios.md). Agregados del
// periodo + filas por semana, con las importadas dentro (mig 0191/0192).
//
// `tipo_slug`/`dosis_label` se derivan de la ESTRUCTURA prescrita
// (shared/domain/running/session-type.ts) — nunca texto libre. Una sesión sin
// estructura (libre, importada, o anterior a #61) sale con `tipo_slug: null`
// y la UI la lista sin chip; eso es intencional, no un hueco.
//
// `veredicto` es SIEMPRE null en esta tanda. El único camino real para
// juzgar una sesión (`analizarSesiones`, en running-analytics.ts) hace DOS
// viajes a Neon por sesión — barato para "las últimas 4 semanas" de una
// tarjeta, no para un historial que puede pedir `window=all`. Recomputarlo
// aquí fila a fila habría sido exactamente el coste que este módulo evita.
// Queda declarado, no silenciado.
//
// `record` SÍ se deriva barato: un cruce en memoria contra las marcas
// (`athlete_benchmarks`, catálogo RUN_MARK_SLUGS) del mismo día — y del mismo
// contexto calle/cinta cuando la marca lo declara (las carreras registradas
// no tienen contexto y valen para cualquiera).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadRunSessionRows, type RunSessionRow } from './sessions';
import {
  classifyRunSessionType,
  runSessionDoseLabel,
  RUN_SESSION_TYPE_LABEL_ES,
  RUN_SESSION_TYPES,
  type RunSessionType,
} from '@fahybrid/shared/domain/running/session-type';
import { safeParseRunStructure } from '@fahybrid/shared/domain/prescription/run-structure';
import { RUN_MARK_SLUGS } from '@fahybrid/shared/domain/athlete/marks';

export const HISTORIAL_WINDOWS = ['7d', '30d', '365d', 'all'] as const;
export type HistorialWindow = (typeof HISTORIAL_WINDOWS)[number];

const WINDOW_DAYS: Record<Exclude<HistorialWindow, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '365d': 365,
};

export interface HistorialRow {
  execution_id: string;
  assignment_id: string | null;
  fecha: string;
  tipo_slug: RunSessionType | null;
  dosis_label: string | null;
  km: number;
  ritmo_s_km: number | null;
  fc_media: number | null;
  desnivel_m: number | null;
  origen: 'app' | 'imported';
  record: boolean;
  veredicto: null;
}

export interface HistorialSemana {
  monday: string;
  km: number;
  rows: HistorialRow[];
}

export interface HistorialPayload {
  aggregates: { km: number; salidas: number; seconds: number; elevation_m: number };
  tipos: { slug: RunSessionType; label_es: string; count: number }[];
  weeks: HistorialSemana[];
}

function windowSince(window: HistorialWindow, now: Date): Date | null {
  if (window === 'all') return null;
  const days = WINDOW_DAYS[window];
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** El tipo de una fila, derivado de la estructura de su prescripción (si
 *  tiene). Nunca lanza sobre un JSON legacy o malformado: se degrada a null,
 *  igual que `prescriptionToText` se degrada al plano. */
function sessionType(row: RunSessionRow): { tipo_slug: RunSessionType | null; dosis_label: string | null } {
  const raw = (row.prescription_json as { structure?: unknown } | null)?.structure;
  if (raw == null) return { tipo_slug: null, dosis_label: null };
  const parsed = safeParseRunStructure(raw);
  if (!parsed.success) return { tipo_slug: null, dosis_label: null };
  return {
    tipo_slug: classifyRunSessionType(parsed.data),
    dosis_label: runSessionDoseLabel(parsed.data),
  };
}

/** Día+contexto en los que el atleta registró una marca del catálogo de
 *  correr — el cruce barato que decide `record` sin recalcular nada. */
async function loadMarkDayKeys(
  client: Sql,
  athlete_id: number,
  since: Date | null,
  until: Date,
): Promise<{ exact: Set<string>; anyContext: Set<string> }> {
  const rows = await client<Array<{ day: string; run_context: string | null }>>`
    select to_char(recorded_at::date, 'YYYY-MM-DD') as day, run_context
    from athlete_benchmarks
    where athlete_id = ${athlete_id}
      and exercise_slug = any(${RUN_MARK_SLUGS}::text[])
      and recorded_at <= ${until.toISOString()}::timestamptz
      ${since ? client`and recorded_at >= ${since.toISOString()}::timestamptz` : client``}
  `;
  const exact = new Set<string>();
  const anyContext = new Set<string>();
  for (const r of rows) {
    // 'outdoor' es el vocabulario del catálogo (shared/domain/athlete/marks);
    // 'street' es el vocabulario de esta pantalla — mismo eje, dos nombres.
    if (r.run_context === 'outdoor') exact.add(`${r.day}|street`);
    else if (r.run_context === 'treadmill') exact.add(`${r.day}|treadmill`);
    else anyContext.add(r.day); // carrera registrada: sin contexto, vale para cualquiera
  }
  return { exact, anyContext };
}

export async function buildRunningHistorial(args: {
  athlete_id: number;
  window: HistorialWindow;
  tipo: RunSessionType | 'all';
  now?: Date;
  client?: Sql;
}): Promise<HistorialPayload> {
  const client = args.client ?? defaultSql;
  const now = args.now ?? new Date();
  const since = windowSince(args.window, now);

  const [sessions, marks] = await Promise.all([
    loadRunSessionRows(client, args.athlete_id, since, now),
    loadMarkDayKeys(client, args.athlete_id, since, now),
  ]);

  const enriched = sessions.map((s) => ({ session: s, ...sessionType(s) }));

  // `tipos`: SIEMPRE sobre la ventana entera (sin el filtro de tipo) — son los
  // chips que el atleta puede elegir, y filtrando a uno solo desaparecerían
  // los demás.
  const countByTipo = new Map<RunSessionType, number>();
  for (const e of enriched) {
    if (e.tipo_slug == null) continue;
    countByTipo.set(e.tipo_slug, (countByTipo.get(e.tipo_slug) ?? 0) + 1);
  }
  const tipos = RUN_SESSION_TYPES.filter((t) => countByTipo.has(t)).map((slug) => ({
    slug,
    label_es: RUN_SESSION_TYPE_LABEL_ES[slug],
    count: countByTipo.get(slug)!,
  }));

  const filtered = args.tipo === 'all' ? enriched : enriched.filter((e) => e.tipo_slug === args.tipo);

  const rows: (HistorialRow & { week_monday: string })[] = filtered.map((e) => {
    const key = `${e.session.day}|${e.session.contexto}`;
    const record = marks.exact.has(key) || marks.anyContext.has(e.session.day);
    return {
      execution_id: e.session.execution_id,
      assignment_id: e.session.assignment_id,
      fecha: e.session.day,
      tipo_slug: e.tipo_slug,
      dosis_label: e.dosis_label,
      km: e.session.km,
      ritmo_s_km: e.session.pace_s_per_km,
      fc_media: e.session.hr_avg,
      desnivel_m: e.session.elevation_gain_m,
      origen: e.session.origen,
      record,
      veredicto: null,
      week_monday: e.session.week_monday,
    };
  });

  const byWeek = new Map<string, HistorialRow[]>();
  for (const { week_monday, ...row } of rows) {
    const list = byWeek.get(week_monday);
    if (list) list.push(row);
    else byWeek.set(week_monday, [row]);
  }
  const weeks: HistorialSemana[] = [...byWeek.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([monday, weekRows]) => ({
      monday,
      km: Math.round(weekRows.reduce((a, r) => a + r.km, 0) * 100) / 100,
      rows: [...weekRows].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    }));

  const aggregates = filtered.reduce(
    (a, e) => ({
      km: a.km + e.session.km,
      salidas: a.salidas + 1,
      seconds: a.seconds + e.session.seconds,
      elevation_m: a.elevation_m + (e.session.elevation_gain_m ?? 0),
    }),
    { km: 0, salidas: 0, seconds: 0, elevation_m: 0 },
  );
  aggregates.km = Math.round(aggregates.km * 100) / 100;
  aggregates.elevation_m = Math.round(aggregates.elevation_m);

  return { aggregates, tipos, weeks };
}
