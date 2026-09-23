import 'server-only';

// Datos de /atletas en UNA pasada: el roster (loadRoster, set-based) y lo que
// la pantalla necesita para sus filtros — los niveles del coach con el nombre de
// su eje, y sus vistas guardadas. Nada del pipeline de Hoy (informe B §2.5).
//
// Cada fuente degrada por su cuenta: sin roster la pantalla dice «no se ha
// podido cargar» (distinto de «no tienes atletas»); sin niveles o sin vistas,
// la lista funciona igual con lo que haya.

import { loadCoachTimezone } from '@/lib/coach/coach-timezone';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { effectiveLevelAxisLabel } from '@fahybrid/shared/domain/coach/level-axis';
import type { SavedView } from '@fahybrid/shared/schema/saved-views';
import { loadRoster, type RosterRow } from '@/lib/dashboard/athletes/roster';
import { coachCalendar } from '@/lib/dashboard/athletes/plan-facts';
import { listSavedViews } from '@/lib/coach/saved-views';
import { listLevelOptions } from '@/lib/coach/level-options';

export interface CoachLevel {
  id: string;
  /** Corto («N3»): lo que sale en la fila. */
  name: string;
  /** Largo («Rendimiento»): lo que ayuda al elegir. */
  label: string;
}

export interface AtletasData {
  rows: RosterRow[] | null;
  levels: CoachLevel[];
  /** Cómo llama el coach a su eje («Nivel» por defecto). */
  level_axis_label: string;
  saved_views: SavedView[];
  /** Hoy en el calendario del coach (YYYY-MM-DD): «hoy», «ayer», el lunes de la semana. */
  today: string;
  /** Lunes de esta semana y de la que viene («Publicar semana»). */
  week_start: string;
  next_week_start: string;
}

async function loadLevels(client: Sql, coach_id: number): Promise<{ levels: CoachLevel[]; axis: string | null }> {
  const [levels, coach] = await Promise.all([
    // Solo los activos: son los que se eligen (invitar, cambiar en bloque). Un
    // nivel retirado que alguien aún lleva lo añade el filtro desde las filas.
    listLevelOptions(coach_id, { client }),
    // to_jsonb: tolera un entorno donde la columna aún no exista.
    client<Array<{ axis: string | null }>>`
      select to_jsonb(c) ->> 'level_axis_label' as axis from coaches c where c.id = ${coach_id}
    `,
  ]);
  return { levels, axis: coach[0]?.axis ?? null };
}

export async function loadAtletas(params: { coach_id: bigint | number; now?: Date; client?: Sql }): Promise<AtletasData> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const now = params.now ?? new Date();
  const cal = coachCalendar(now, await loadCoachTimezone(coach_id, client));
  const [rows, lv, views] = await Promise.all([
    loadRoster({ coach_id, now, client }).catch(() => null),
    loadLevels(client, coach_id).catch(() => ({ levels: [] as CoachLevel[], axis: null })),
    listSavedViews(coach_id, client).catch(() => [] as SavedView[]),
  ]);
  return {
    rows,
    levels: lv.levels,
    level_axis_label: effectiveLevelAxisLabel(lv.axis),
    saved_views: views,
    today: cal.today,
    week_start: cal.week_start,
    next_week_start: cal.next_week_start,
  };
}
