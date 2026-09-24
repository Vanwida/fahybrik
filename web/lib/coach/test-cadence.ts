import 'server-only';

// Cada cuántas semanas repite un test el coach (`coaches.test_retest_weeks`, mig
// 0259). NULL = defecto de `shared/domain/coach/test-cadence.ts`. Lo leen «Aplicar
// test» (las opciones de «Repetir») y el aviso «Toca test» (la más corta).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  DEFAULT_TEST_RETEST_WEEKS,
  effectiveTestRetestWeeks,
  normalizeTestRetestWeeks,
} from '@fahybrid/shared/domain/coach/test-cadence';

export interface TestCadenceSetting {
  stored: number[] | null;
  effective: number[];
  default_weeks: number[];
}

function toSetting(stored: number[] | null): TestCadenceSetting {
  return { stored, effective: effectiveTestRetestWeeks(stored), default_weeks: [...DEFAULT_TEST_RETEST_WEEKS] };
}

export async function getTestCadenceSetting(coach_id: number | bigint, client: Sql = defaultSql): Promise<TestCadenceSetting> {
  const rows = await client<Array<{ weeks: number[] | null }>>`
    -- to_jsonb: tolera un entorno sin la columna (mig 0259) → defecto.
    select (to_jsonb(c) -> 'test_retest_weeks') as weeks from coaches c where c.id = ${Number(coach_id)} limit 1
  `;
  const raw = rows[0]?.weeks;
  return toSetting(Array.isArray(raw) ? raw.map(Number) : null);
}

export async function setTestCadence(
  coach_id: number | bigint,
  weeks: readonly number[] | null,
  client: Sql = defaultSql,
): Promise<TestCadenceSetting> {
  const value = normalizeTestRetestWeeks(weeks);
  await client`
    update coaches set test_retest_weeks = ${value}::smallint[], updated_at = now() where id = ${Number(coach_id)}
  `;
  return toSetting(value);
}
