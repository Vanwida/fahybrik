import 'server-only';

// La LÍNEA DE TIEMPO de un atleta (pestaña Perfil): mensajes, comunicados,
// check-ins, revisiones 1:1, tests, lesiones y cambios de plan en UN feed
// ordenado del más reciente al más viejo. Sustituye a la pestaña «Del coach», al
// histórico de 1:1 y a los tres sitios donde se contaba el plan (informe C §4.4).
//
// Una consulta por fuente (en paralelo), cada una acotada; se mezclan aquí.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { benchmarkLabel } from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { strengthLiftLabel } from '@fahybrid/shared/domain/strength';
import {
  INJURY_SEVERITY_LABEL,
  INJURY_ZONE_LABEL,
  type InjurySeverity,
  type InjuryZone,
} from '@fahybrid/shared/domain/coach/injury-taxonomy';
import { shortDate } from '@fahybrid/shared/domain/coach/athlete-state';
import type { TimelineEntry } from './atleta-detalle-types';

/** Por fuente: lo bastante para un año de un atleta normal sin traer su vida entera. */
const PER_SOURCE = 60;
/** El feed completo que llega a la pantalla. */
export const TIMELINE_MAX = 200;

const COMM_KIND_ES: Record<string, string> = {
  protocol: 'Protocolo',
  question: 'Pregunta',
  task: 'Tarea',
  note: 'Nota',
  focus: 'Foco',
};

function clip(text: string | null, max = 140): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export async function loadFichaTimeline(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<TimelineEntry[]> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const ath = params.athlete_id;

  // La propiedad se comprueba una vez; cada fuente filtra por atleta.
  const owned = await client<Array<{ id: string }>>`
    select id::text from athletes where id = ${ath} and coach_id = ${coachId}
  `;
  if (!owned[0]) return [];

  const [messages, comms, checkins, reviews, benchmarks, maxes, injuries, programs] = await Promise.all([
    client<Array<{ id: string; at: Date; body: string | null; role: string; kind: string | null }>>`
      select m.id::text, m.created_at as at, m.body, m.sender_role::text as role, m.attachment_kind::text as kind
      from chat_threads t
      join chat_messages m on m.thread_id = t.id and m.deleted_at is null
      where t.athlete_id = ${ath}
      order by m.created_at desc
      limit ${PER_SOURCE}
    `,
    client<
      Array<{ id: string; at: Date; kind: string; title: string | null; seen: boolean; done: boolean; answered: boolean }>
    >`
      select r.id::text, coalesce(c.published_at, r.created_at) as at, c.kind, c.title,
             r.seen_at is not null as seen, r.done_at is not null as done, r.answered_at is not null as answered
      from coach_communication_recipients r
      join coach_communications c on c.id = r.communication_id and c.coach_id = ${coachId}
      where r.athlete_id = ${ath} and c.status <> 'draft'
      order by at desc
      limit ${PER_SOURCE}
    `,
    client<Array<{ id: string; at: Date; score: number; notes: string | null }>>`
      select id::text, recorded_at as at, sub_score::int as score, nullif(btrim(notes), '') as notes
      from daily_checkins where athlete_id = ${ath}
      order by recorded_for desc
      limit ${PER_SOURCE}
    `,
    client<Array<{ id: string; at: Date; notes: string | null; next_steps: string | null }>>`
      select id::text, occurred_at as at, notes, next_steps
      from session_reports
      where athlete_id = ${ath} and deleted_at is null
      order by occurred_at desc
      limit ${PER_SOURCE}
    `,
    client<Array<{ id: string; at: Date; slug: string }>>`
      select id::text, recorded_at as at, exercise_slug as slug
      from athlete_benchmarks where athlete_id = ${ath}
      order by recorded_at desc
      limit ${PER_SOURCE}
    `,
    client<Array<{ id: string; at: Date; slug: string; kg: number }>>`
      select id::text, recorded_at as at, exercise_slug as slug, one_rm_kg::float8 as kg
      from athlete_strength_maxes where athlete_id = ${ath}
      order by recorded_at desc
      limit ${PER_SOURCE}
    `,
    client<
      Array<{ id: string; at: Date; zone: InjuryZone; severity: InjurySeverity; resolved: string | null; note: string | null }>
    >`
      select id::text, onset_date::timestamptz as at, zone::text as zone, severity::text as severity,
             to_char(resolved_date, 'YYYY-MM-DD') as resolved, note
      from injuries where athlete_id = ${ath}
      order by onset_date desc
      limit ${PER_SOURCE}
    `,
    client<Array<{ id: string; at: Date; name: string; start: string; end: string }>>`
      select ama.id::text, ama.created_at as at, m.name,
             to_char(ama.start_date, 'YYYY-MM-DD') as start, to_char(ama.end_date, 'YYYY-MM-DD') as end
      from athlete_month_assignments ama
      join program_month_templates m on m.id = ama.month_template_id
      where ama.athlete_id = ${ath}
      order by ama.created_at desc
      limit ${PER_SOURCE}
    `,
  ]);

  const out: TimelineEntry[] = [];
  for (const m of messages) {
    const fromAthlete = m.role === 'athlete';
    out.push({
      id: `msg-${m.id}`,
      kind: 'mensaje',
      at: m.at.toISOString(),
      title: fromAthlete ? 'Te escribió' : 'Le escribiste',
      detail: clip(m.body) ?? (m.kind ? 'Adjunto' : null),
      who: fromAthlete ? 'atleta' : 'coach',
    });
  }
  for (const c of comms) {
    const state = c.answered ? 'respondido' : c.done ? 'hecho' : c.seen ? 'visto' : 'sin abrir';
    out.push({
      id: `com-${c.id}`,
      kind: 'comunicado',
      at: c.at.toISOString(),
      title: `${COMM_KIND_ES[c.kind] ?? 'Comunicado'}${c.title ? ` · ${c.title}` : ''}`,
      detail: state,
      who: 'coach',
    });
  }
  for (const c of checkins) {
    out.push({
      id: `chk-${c.id}`,
      kind: 'checkin',
      at: c.at.toISOString(),
      title: `Check-in · ${c.score}`,
      detail: clip(c.notes),
      who: 'atleta',
    });
  }
  for (const r of reviews) {
    out.push({
      id: `rev-${r.id}`,
      kind: 'revision',
      at: r.at.toISOString(),
      title: 'Revisión 1:1',
      detail: clip(r.notes) ?? clip(r.next_steps),
      who: 'coach',
    });
  }
  for (const b of benchmarks) {
    out.push({
      id: `ben-${b.id}`,
      kind: 'test',
      at: b.at.toISOString(),
      title: `Test · ${benchmarkLabel(b.slug)}`,
      detail: null,
      who: 'sistema',
    });
  }
  for (const s of maxes) {
    out.push({
      id: `rm-${s.id}`,
      kind: 'test',
      at: s.at.toISOString(),
      title: `1RM · ${strengthLiftLabel(s.slug)}`,
      detail: `${Number.isInteger(s.kg) ? s.kg : s.kg.toFixed(1).replace('.', ',')} kg`,
      who: 'sistema',
    });
  }
  for (const i of injuries) {
    out.push({
      id: `inj-${i.id}`,
      kind: 'lesion',
      at: i.at.toISOString(),
      title: `Lesión · ${INJURY_ZONE_LABEL[i.zone] ?? i.zone} · ${(INJURY_SEVERITY_LABEL[i.severity] ?? i.severity).toLowerCase()}`,
      detail: i.resolved ? `Resuelta el ${shortDate(i.resolved)}` : clip(i.note),
      who: 'coach',
    });
  }
  for (const p of programs) {
    out.push({
      id: `plan-${p.id}`,
      kind: 'plan',
      at: p.at.toISOString(),
      title: `Programa asignado · ${p.name}`,
      detail: `${shortDate(p.start)} – ${shortDate(p.end)}`,
      who: 'coach',
    });
  }

  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, TIMELINE_MAX);
}
