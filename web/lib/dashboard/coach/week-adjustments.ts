import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import { coerceJson } from '@/lib/json-column';
import { loadTemplateNames } from '@/lib/dashboard/coach/inbox';
import {
  weekAdjustmentProposalJsonSchema,
  type WeekAdjustmentProposalJson,
} from '@fahybrid/shared/schema/week-adjustment';

export type PendingAdjustment = {
  id: string;
  athlete_id: string;
  athlete_name: string;
  week_start: string;
  verdict: string;
  coach_summary: string | null;
  proposal: WeekAdjustmentProposalJson;
};

export class WeekAdjustmentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'WeekAdjustmentError';
  }
}

export async function listPendingWeekAdjustments(params: {
  coach_id: number | bigint;
  client?: Sql | undefined;
}): Promise<PendingAdjustment[]> {
  const client = params.client ?? defaultSql;
  try {
    const rows = await client<
    Array<{
      id: string;
      athlete_id: string;
      athlete_name: string;
      week_start: string;
      verdict: string;
      proposal_json: unknown;
    }>
  >`
    select
      p.id::text,
      p.athlete_id::text,
      a.full_name as athlete_name,
      to_char(p.week_start, 'YYYY-MM-DD') as week_start,
      p.verdict,
      p.proposal_json
    from week_adjustment_proposals p
    join athletes a on a.id = p.athlete_id
    where a.coach_id = ${params.coach_id}
      and p.status = 'pending'
    order by p.week_start asc, a.full_name asc
  `;

    return rows.flatMap((r) => {
      // proposal_json puede llegar como objeto (jsonb) o como string (json/text
      // o doble-encodeado). Coercionamos y, si una fila está corrupta, la
      // SALTAMOS en vez de tumbar todo el inbox (vive en el layout del coach).
      let proposal: ReturnType<typeof weekAdjustmentProposalJsonSchema.parse>;
      try {
        const raw =
          typeof r.proposal_json === 'string'
            ? JSON.parse(r.proposal_json)
            : r.proposal_json;
        proposal = weekAdjustmentProposalJsonSchema.parse(raw);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[week-adjustments] proposal_json inválido, fila omitida:', r.id, e);
        return [];
      }
      return [
        {
          id: r.id,
          athlete_id: r.athlete_id,
          athlete_name: r.athlete_name,
          week_start: r.week_start,
          verdict: r.verdict,
          coach_summary: proposal.coach_summary ?? null,
          proposal,
        },
      ];
    });
  } catch (err) {
    if (isPgMissingRelation(err, 'week_adjustment_proposals')) return [];
    throw err;
  }
}

export async function getPendingProposalForAthlete(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<PendingAdjustment | null> {
  const all = await listPendingWeekAdjustments({ coach_id: params.coach_id, client: params.client });
  return all.find((p) => p.athlete_id === String(params.athlete_id)) ?? null;
}

/**
 * Resolve template names for every from/to template referenced by a proposal's
 * slot_changes — so the review surface shows session names ("Fuerza base →
 * Descanso"), never numeric IDs. Reuses the canonical `loadTemplateNames`
 * resolver (single source of truth; same query the coach inbox diff uses).
 */
export async function loadProposalTemplateNames(params: {
  proposal: WeekAdjustmentProposalJson;
  client?: Sql;
}): Promise<Record<string, string>> {
  const ids = new Set<string>();
  for (const c of params.proposal.slot_changes) {
    if (c.from_template_id != null) ids.add(String(c.from_template_id));
    if (c.to_template_id != null) ids.add(String(c.to_template_id));
  }
  const map = await loadTemplateNames({ ids: [...ids], client: params.client ?? defaultSql });
  return Object.fromEntries(map);
}

export async function approveWeekAdjustment(params: {
  coach_id: number | bigint;
  athlete_id: number;
  proposal_id: number;
  client?: Sql;
}): Promise<void> {
  const client = params.client ?? defaultSql;
  const rows = await client<Array<{ proposal_json: unknown }>>`
    select p.proposal_json
    from week_adjustment_proposals p
    join athletes a on a.id = p.athlete_id
    where p.id = ${params.proposal_id}
      and p.athlete_id = ${params.athlete_id}
      and a.coach_id = ${params.coach_id}
      and p.status = 'pending'
    limit 1
  `;
  if (!rows[0]) throw new WeekAdjustmentError('not_found', 'Propuesta no encontrada', 404);

  const proposal = weekAdjustmentProposalJsonSchema.parse(coerceJson(rows[0].proposal_json));

  for (const change of proposal.slot_changes) {
    if (!change.to_template_id) continue;
    const versionRows = await client<Array<{ version: number }>>`
      select coalesce(max(version), 1)::int as version from templates where id = ${Number(change.to_template_id)}
    `;
    await client`
      update workout_assignments
      set template_id = ${Number(change.to_template_id)},
          template_version = ${versionRows[0]?.version ?? 1},
          updated_at = now()
      where athlete_id = ${params.athlete_id}
        and scheduled_for = ${change.date}::date
        and status = 'scheduled'
    `;
  }

  await client`
    update week_adjustment_proposals
    set status = 'approved', reviewed_by_coach_id = ${params.coach_id}, reviewed_at = now()
    where id = ${params.proposal_id}
  `;
}

export async function rejectWeekAdjustment(params: {
  coach_id: number | bigint;
  athlete_id: number;
  proposal_id: number;
  client?: Sql;
}): Promise<void> {
  const client = params.client ?? defaultSql;
  const rows = await client<Array<{ id: string }>>`
    update week_adjustment_proposals p
    set status = 'rejected', reviewed_by_coach_id = ${params.coach_id}, reviewed_at = now()
    from athletes a
    where p.id = ${params.proposal_id}
      and p.athlete_id = ${params.athlete_id}
      and a.id = p.athlete_id
      and a.coach_id = ${params.coach_id}
      and p.status = 'pending'
    returning p.id::text
  `;
  if (!rows[0]) throw new WeekAdjustmentError('not_found', 'Propuesta no encontrada', 404);
}
