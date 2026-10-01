import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { INJURY_SEVERITY_LABEL, INJURY_ZONE_LABEL, type InjurySeverity, type InjuryZone } from '@fahybrid/shared/domain/coach/injury-taxonomy';
import { loadAthleteKeyMarkers } from '@/lib/coach/key-markers';
import type { FichaEstado } from './atleta-detalle-types';
import { loadFichaCheckin } from './ficha-checkin';

// ── Columna «Estado» ─────────────────────────────────────────────────────────

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Noches mínimas para que exista una base de sueño (como el readiness). */
const SLEEP_BASELINE_MIN_NIGHTS = 7;

export async function loadFichaEstado(params: {
  coach_id: number | bigint;
  athlete_id: number;
  readiness: FichaEstado['readiness'];
  client?: Sql;
}): Promise<FichaEstado> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const ath = params.athlete_id;

  const [sleepRows, checkin, injury, note, markers] = await Promise.all([
    client<Array<{ on: string; hours: number; recent: boolean }>>`
      with a as (
        select id, (now() at time zone coalesce(timezone, ${BOX_TIMEZONE}))::date as today
        from athletes where id = ${ath} and coach_id = ${coachId}
      )
      select to_char(s.recorded_for, 'YYYY-MM-DD') as on,
             (s.breakdown_json->>'sleep_hours')::float8 as hours,
             s.recorded_for > a.today - 7 as recent
      from athlete_daily_readiness_snapshots s join a on a.id = s.athlete_id
      where s.recorded_for > a.today - 35
        and jsonb_typeof(s.breakdown_json->'sleep_hours') = 'number'
    `,
    loadFichaCheckin(client, coachId, ath),
    client<Array<{ id: string; zone: InjuryZone; severity: InjurySeverity; status: string; onset: string }>>`
      select i.id::text, i.zone::text as zone, i.severity::text as severity, i.status::text as status,
             to_char(i.onset_date, 'YYYY-MM-DD') as onset
      from injuries i
      join athletes a on a.id = i.athlete_id and a.coach_id = ${coachId}
      where i.athlete_id = ${ath} and i.status in ('activa', 'en_recuperacion')
      order by (i.status = 'activa') desc, i.onset_date desc
      limit 1
    `,
    client<Array<{ body: string; created_at: Date }>>`
      select body, created_at from athlete_coach_notes
      where athlete_id = ${ath} and coach_id = ${coachId} and deleted_at is null
      order by created_at desc
      limit 1
    `,
    loadAthleteKeyMarkers({ coach_id: coachId, athlete_id: ath, client }),
  ]);

  const recent = sleepRows.filter((r) => r.recent).map((r) => r.hours);
  const older = sleepRows.filter((r) => !r.recent).map((r) => r.hours);
  const inj = injury[0];

  return {
    readiness: params.readiness,
    sleep:
      recent.length > 0
        ? {
            avg_7d_hours: recent.reduce((a, b) => a + b, 0) / recent.length,
            baseline_hours: older.length >= SLEEP_BASELINE_MIN_NIGHTS ? median(older) : null,
            nights: recent.length,
          }
        : null,
    ...checkin,
    injury: inj
      ? {
          id: inj.id,
          zone_label: INJURY_ZONE_LABEL[inj.zone] ?? inj.zone,
          severity_label: INJURY_SEVERITY_LABEL[inj.severity] ?? inj.severity,
          status: inj.status,
          onset_date: inj.onset,
        }
      : null,
    note: note[0] ? { body: note[0].body, created_at: note[0].created_at.toISOString() } : null,
    markers,
  };
}

