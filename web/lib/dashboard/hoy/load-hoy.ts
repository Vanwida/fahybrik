import 'server-only';

// loadHoy — la bandeja de Hoy (plan §4.3): grupos de causa compartida primero,
// luego una fila por atleta, peor primero. Carga en un número CONSTANTE de
// consultas (8, o 10 con Negocio) sea cual sea el tamaño del roster, y compone
// con `composeHoy` (puro, testeado aparte).
//
// Lee las señales que el barrido ya persistió (`coach_attention_items`) — no
// recalcula nada por atleta. El barrido corre cada 15 min y, por evento, al
// llegar un entreno, un check-in, un mensaje o una aprobación.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { startOfDayInBox, zonedWallClockToUtc, BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { hasEntitlement, type EntitlementFeature } from '@/lib/coach/entitlements';
import { loadAthleteSignals } from '@/lib/coach/attention/signals-read';
import { loadReplyStates, openReplies } from '@/lib/coach/attention/awaiting-reply';
import { leadOwnedBy } from '@/lib/leads/owner';
import { coachCalendar, loadPlanFacts } from '@/lib/dashboard/athletes/plan-facts';
import { composeHoy, type NegocioInput, type ProposalFact } from './hoy-compose';
import type { HoyView } from './hoy-types';

export type { HoyView, HoyRow, SystemicGroup, HoySnoozedRow } from './hoy-types';

/** El add-on de Negocio (leads, cobros, embudo — DECISIONS 2026-09-23, decisión 7). */
const NEGOCIO_FEATURE: EntitlementFeature = 'negocio';

/** Atletas que el coach marcó «hecho» hoy. */
async function loadResolvedToday(client: Sql, coach_id: number, dayStart: Date): Promise<number> {
  const rows = await client<Array<{ resolved: number }>>`
    select count(distinct o.athlete_id)::int as resolved
    from coach_alert_overrides o
    join athletes a on a.id = o.athlete_id and a.lifecycle_status = 'activo'
    where o.coach_id = ${coach_id}
      and o.override_kind = 'done'
      and o.dismissed_at >= ${dayStart.toISOString()}::timestamptz
  `;
  return rows[0]?.resolved ?? 0;
}

/**
 * La última propuesta de ajuste de cada atleta desde esta semana (lo que contestó
 * el motor a «Proponer descarga»): la fila lo enseña en vez de volver a ofrecerlo.
 */
async function loadProposals(client: Sql, coach_id: number, weekStart: string): Promise<Map<string, ProposalFact>> {
  const rows = await client<
    Array<{ athlete_id: string; id: string; status: string; recommendation: string | null; summary: string | null; created_at: Date }>
  >`
    select distinct on (p.athlete_id)
      p.athlete_id::text                     as athlete_id,
      p.id::text                             as id,
      p.status::text                         as status,
      p.proposal_json ->> 'recommendation'   as recommendation,
      p.proposal_json ->> 'coach_summary'    as summary,
      p.created_at
    from week_adjustment_proposals p
    join athletes a on a.id = p.athlete_id and a.coach_id = ${coach_id}
    where p.week_start >= ${weekStart}::date
      and p.status in ('pending', 'approved')
    order by p.athlete_id, p.created_at desc
  `;
  return new Map(
    rows.map((r) => [
      r.athlete_id,
      {
        id: r.id,
        status: r.status,
        recommendation: r.recommendation ?? 'keep',
        summary: r.summary ?? '',
        created_at: r.created_at.toISOString(),
      },
    ]),
  );
}

async function loadNegocio(
  client: Sql,
  coach_id: number,
  dayStart: Date,
  dayEnd: Date,
): Promise<NegocioInput> {
  const [leads, calls] = await Promise.all([
    client<Array<{ id: string; created_at: Date }>>`
      -- De quién es un lead: la regla única (los sin dueño, solo del coach del embudo).
      select l.id::text as id, l.created_at
      from leads l
      where l.status = 'nuevo'
        and ${leadOwnedBy(client, coach_id, client`l.coach_id`)}
    `,
    client<Array<{ id: string; requested_start: Date }>>`
      -- La cita no lleva dueño: deriva del lead o del atleta (DECISIONS 2026-08-10).
      select ap.id::text as id, ap.requested_start
      from appointments ap
      left join leads l on l.id = ap.lead_id
      left join athletes a on a.id = ap.athlete_id
      where ap.status in ('pendiente', 'aceptada')
        and ap.requested_start >= ${dayStart.toISOString()}::timestamptz
        and ap.requested_start <  ${dayEnd.toISOString()}::timestamptz
        and (l.coach_id = ${coach_id} or a.coach_id = ${coach_id})
    `,
  ]);
  return {
    leads: leads.map((l) => ({ id: l.id, created_at: l.created_at.toISOString() })),
    calls: calls.map((c) => ({ id: c.id, starts_at: c.requested_start.toISOString() })),
  };
}

export async function loadHoy(params: {
  coach_id: bigint | number;
  now?: Date;
  client?: Sql;
}): Promise<HoyView> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const coach_id = Number(params.coach_id);
  const calendar = coachCalendar(now);
  const today = startOfDayInBox(now);
  const dayStart = zonedWallClockToUtc(today, BOX_TIMEZONE);
  const dayEnd = zonedWallClockToUtc(today, BOX_TIMEZONE, { days: 1 });

  const [facts, signals, resolved_today, awaiting, negocioOn, proposals] = await Promise.all([
    loadPlanFacts({ coach_id, now, client }),
    loadAthleteSignals({ coach_id, now, client }),
    loadResolvedToday(client, coach_id, dayStart),
    loadReplyStates({ coach_id, now, client }).then(openReplies),
    hasEntitlement({ coach_id, feature: NEGOCIO_FEATURE, client }),
    loadProposals(client, coach_id, calendar.week_start),
  ]);
  const negocio = negocioOn ? await loadNegocio(client, coach_id, dayStart, dayEnd) : null;

  return composeHoy({
    now,
    calendar,
    facts,
    signals,
    awaiting,
    resolved_today,
    negocio,
    proposals,
  });
}
