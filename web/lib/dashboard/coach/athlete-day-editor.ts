import 'server-only';

// athlete-day-editor — server loader for the PER-ATHLETE day editor (Fase 2).
// Resolves the athlete's assigned INSTANCE template(s) for one calendar date and
// maps each into the SAME SessionEditorModel the library session editor uses
// (loadSessionEditorModel → getTemplateDetail). The coach edits the athlete's
// private copy; the write path (updateAthleteInstanceDay) enforces isolation.
//
// A day can hold 0..N assignments (sessions). 0 → an honest empty state; ≥1 →
// one SessionEditor per session. Only THIS athlete's instances are loaded
// (t.instance_athlete_id = athlete) — never the library row.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { parseIsoDate } from '@fahybrid/shared/domain/dates';
import { loadSessionEditorModel } from '@/lib/dashboard/v2/editor-data';
import { loadAthleteZoneProfiles } from '@/lib/dashboard/v2/zone-profile';
import { decodeCoachAssignmentNotes } from '@/lib/dashboard/coach/day-sessions';
import type { SessionEditorModel } from '@/lib/dashboard/v2/editor-types';

const WEEKDAYS_ES = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];
const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

export interface AthleteDaySession {
  assignment_id: string;
  /** The athlete's instance template id — the PATCH target. */
  template_id: string;
  /** Display title for the session heading (coach override wins over name). */
  title: string;
  status: string;
  model: SessionEditorModel;
}

export interface AthleteDayEditorData {
  athlete_id: string;
  athlete_name: string;
  /** La regla del ritmo: the athlete's resolved RUN zone bands (slow→fast), so the
   *  editor can show where a prescribed pace lands in HIS reality. Empty = no run
   *  test yet → the ruler hides. */
  run_zones: { code: string; fast_s: number; slow_s: number | null }[];
  iso_date: string;
  /** "Lunes 29 jun" — display label for the day. */
  day_label: string;
  /** Back link to the athlete's plan tab. */
  back_href: string;
  sessions: AthleteDaySession[];
}

export async function loadAthleteDayEditor(params: {
  coach_id: number | bigint;
  athlete_id: number;
  iso_date: string;
  client?: Sql;
}): Promise<AthleteDayEditorData | null> {
  const client = params.client ?? defaultSql;
  const coach = Number(params.coach_id);
  const ath = params.athlete_id;

  const header = await client<Array<{ id: string; full_name: string }>>`
    select a.id::text, a.full_name
    from athletes a
    where a.id = ${ath} and a.coach_id = ${coach}
    limit 1
  `;
  if (!header[0]) return null;

  const rows = await client<
    Array<{
      assignment_id: string;
      template_id: string;
      title: string | null;
      status: string;
      notes: string | null;
    }>
  >`
    select
      wa.id::text as assignment_id,
      wa.template_id::text as template_id,
      t.name as title,
      wa.status::text as status,
      wa.notes
    from workout_assignments wa
    join templates t on t.id = wa.template_id
    where wa.athlete_id = ${ath}
      and wa.scheduled_for = ${params.iso_date}::date
      and t.instance_athlete_id = ${ath}
      and t.archived_at is null
    order by wa.id asc
  `;

  const sessions: AthleteDaySession[] = [];
  for (const r of rows) {
    const model = await loadSessionEditorModel({
      coach_id: coach,
      template_id: Number(r.template_id),
    });
    if (!model) continue;
    const coachTitle = decodeCoachAssignmentNotes(r.notes).display_title;
    sessions.push({
      assignment_id: r.assignment_id,
      template_id: r.template_id,
      title: coachTitle ?? r.title ?? 'Entreno',
      status: r.status,
      model,
    });
  }

  const d = parseIsoDate(params.iso_date);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const day_label = `${WEEKDAYS_ES[dow - 1]} ${d.getUTCDate()} ${MONTHS_ES[d.getUTCMonth()]}`;

  // La regla del ritmo: the athlete's resolved run bands. Best-effort — a zones
  // hiccup must never take the day editor down; the ruler just hides.
  const run_zones = await loadAthleteZoneProfiles({
    coach_id: params.coach_id,
    athlete_id: Number(header[0].id),
    client,
  })
    .then((profiles) => {
      const run = profiles.find((z) => z.modality === 'run');
      return (run?.zones_json ?? []).map((z) => ({
        code: z.code,
        fast_s: z.fast_s,
        slow_s: z.slow_s,
      }));
    })
    .catch(() => []);

  return {
    athlete_id: header[0].id,
    athlete_name: header[0].full_name,
    run_zones,
    iso_date: params.iso_date,
    day_label,
    back_href: `/atletas/${header[0].id}?tab=plan`,
    sessions,
  };
}
