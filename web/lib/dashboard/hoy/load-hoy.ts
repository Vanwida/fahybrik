import 'server-only';

// loadHoy — la bandeja de Hoy (plan §4.3): grupos de causa compartida primero,
// luego una fila por atleta, peor primero. Carga en un número CONSTANTE de
// consultas (5, o 7 con Negocio) sea cual sea el tamaño del roster, y compone
// con `composeHoy` (puro, testeado aparte).
//
// Lee las señales que el barrido ya persistió (`coach_attention_items`) — no
// recalcula nada por atleta. El barrido corre cada 15 min y, por evento, al
// llegar un entreno, un check-in, un mensaje o una aprobación.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { startOfDayInBox, zonedWallClockToUtc, BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { effectiveAutoPublishDays } from '@fahybrid/shared/domain/coach/week-publishing';
import { hasEntitlement, type EntitlementFeature } from '@/lib/coach/entitlements';
import { loadAthleteSignals } from '@/lib/coach/attention/signals-read';
import { coachCalendar, loadPlanFacts } from '@/lib/dashboard/athletes/plan-facts';
import { composeHoy, type NegocioInput } from './hoy-compose';
import type { HoyView } from './hoy-types';

export type { HoyView, HoyRow, SystemicGroup, HoySnoozedRow } from './hoy-types';

/** El add-on de Negocio (leads, cobros, embudo — DECISIONS 2026-09-23, decisión 7). */
const NEGOCIO_FEATURE: EntitlementFeature = 'negocio';

async function loadCoachScalars(
  client: Sql,
  coach_id: number,
  dayStart: Date,
): Promise<{ resolved_today: number; auto_publish_days: number }> {
  const rows = await client<Array<{ resolved: number; auto_days: string | null }>>`
    select
      (
        select count(distinct o.athlete_id)
        from coach_alert_overrides o
        join athletes a on a.id = o.athlete_id and a.lifecycle_status = 'activo'
        where o.coach_id = ${coach_id}
          and o.override_kind = 'done'
          and o.dismissed_at >= ${dayStart.toISOString()}::timestamptz
      )::int as resolved,
      (
        -- to_jsonb: tolera un entorno sin la columna (mig 0217) → defecto.
        select to_jsonb(c) ->> 'auto_publish_days_before' from coaches c where c.id = ${coach_id}
      ) as auto_days
  `;
  const r = rows[0];
  return {
    resolved_today: r?.resolved ?? 0,
    auto_publish_days: effectiveAutoPublishDays(r?.auto_days == null ? null : Number(r.auto_days)),
  };
}

async function loadNegocio(
  client: Sql,
  coach_id: number,
  dayStart: Date,
  dayEnd: Date,
): Promise<NegocioInput> {
  const [leads, calls] = await Promise.all([
    client<Array<{ id: string; created_at: Date }>>`
      -- Mismo alcance que la ficha del lead: los suyos y los sin asignar (0147).
      select l.id::text as id, l.created_at
      from leads l
      where l.status = 'nuevo'
        and (l.coach_id = ${coach_id} or l.coach_id is null)
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

  const [facts, signals, scalars, negocioOn] = await Promise.all([
    loadPlanFacts({ coach_id, now, client }),
    loadAthleteSignals({ coach_id, now, client }),
    loadCoachScalars(client, coach_id, dayStart),
    hasEntitlement({ coach_id, feature: NEGOCIO_FEATURE, client }),
  ]);
  const negocio = negocioOn ? await loadNegocio(client, coach_id, dayStart, dayEnd) : null;

  return composeHoy({
    now,
    calendar,
    auto_publish_days: scalars.auto_publish_days,
    facts,
    signals,
    resolved_today: scalars.resolved_today,
    negocio,
  });
}
