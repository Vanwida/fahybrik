import 'server-only';

// `coaches.plan_renewal_days_before` (mig 0283): cuántos días antes de que acabe el
// plan de un atleta se prepara la vuelta siguiente de su grupo. Método del coach
// (HARD RULE Nº0): NULL = el defecto del producto.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  DEFAULT_PLAN_RENEWAL_DAYS_BEFORE,
  effectivePlanRenewalDays,
  PLAN_RENEWAL_DAYS_MAX,
  PLAN_RENEWAL_DAYS_MIN,
} from '@fahybrid/shared/domain/coach/plan-renewal';
import type { PlanRenewalSetting } from '@fahybrid/shared/schema/plan-renewal';

export class PlanRenewalError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'PlanRenewalError';
  }
}

function settingOf(stored: number | null): PlanRenewalSetting {
  return {
    plan_renewal_days_before: stored,
    effective_days: effectivePlanRenewalDays(stored),
    default_days: DEFAULT_PLAN_RENEWAL_DAYS_BEFORE,
  };
}

export async function getPlanRenewalSetting(
  coach_id: number | bigint,
  client: Sql = defaultSql,
): Promise<PlanRenewalSetting> {
  const rows = await client<Array<{ days: number | null }>>`
    select plan_renewal_days_before as days from coaches where id = ${Number(coach_id)} limit 1
  `;
  return settingOf(rows[0]?.days ?? null);
}

export async function setPlanRenewalDays(
  coach_id: number | bigint,
  days: number | null,
  client: Sql = defaultSql,
): Promise<PlanRenewalSetting> {
  if (days != null && (!Number.isInteger(days) || days < PLAN_RENEWAL_DAYS_MIN || days > PLAN_RENEWAL_DAYS_MAX)) {
    throw new PlanRenewalError(
      'invalid_days',
      `Los días van de ${PLAN_RENEWAL_DAYS_MIN} a ${PLAN_RENEWAL_DAYS_MAX}.`,
      422,
    );
  }
  await client`update coaches set plan_renewal_days_before = ${days}, updated_at = now() where id = ${Number(coach_id)}`;
  return getPlanRenewalSetting(coach_id, client);
}
