import 'server-only';

// Coach import-defaults — the read/write data layer behind
// coach_import_defaults (mig 0149).
//
// When the photo importer meets a gap the notation grammar honestly refuses
// to guess (no rest between sets, no stated RIR, no rep count), it fills it
// with the coach's own defaults if they have authored any, else the SYSTEM
// defaults (shared/domain/coach-import-defaults — agnostic, no brand) and
// marks the item PROPOSED. This module is the single resolver so the importer
// and the coach's editor never diverge on "coach row else defaults". Mirrors
// web/lib/coach/guidance.ts exactly.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  defaultImportDefaults,
  type ImportDefaultsValues,
} from '@fahybrid/shared/domain/coach-import-defaults';
import type { ImportDefaultsResponse } from '@fahybrid/shared/schema/coach-import-defaults';

interface ImportDefaultsRow extends ImportDefaultsValues {
  updated_at: string;
}

/** The coach's authored row, or null when they have none. Unique per coach. */
async function loadImportDefaultsRow(
  coach_id: bigint | number,
  client: Sql,
): Promise<ImportDefaultsRow | null> {
  const rows = await client<ImportDefaultsRow[]>`
    select
      rest_strength_s,
      rest_conditioning_s,
      rest_core_mobility_s,
      rir_strength::float8 as rir_strength,
      rep_range_min,
      rep_range_max,
      updated_at::text as updated_at
    from coach_import_defaults
    where coach_id = ${coach_id}
    limit 1
  `;
  return rows[0] ?? null;
}

/**
 * The resolved defaults: the coach's own row when present, else the system
 * defaults. The single read the importer uses to fill an executable gap —
 * it only needs the six values, not who authored them.
 */
export async function resolveImportDefaults(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<ImportDefaultsValues> {
  const row = await loadImportDefaultsRow(coach_id, client);
  if (row) {
    const { updated_at: _updated_at, ...values } = row;
    return values;
  }
  return defaultImportDefaults();
}

/**
 * The coach editor GET: the resolved defaults + whether they are the coach's
 * own edit or the system defaults (so the editor can say "usando los del
 * sistema").
 */
export async function getImportDefaults(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<ImportDefaultsResponse> {
  const row = await loadImportDefaultsRow(coach_id, client);
  if (row) {
    const { updated_at, ...values } = row;
    return { ...values, is_custom: true, updated_at };
  }
  return { ...defaultImportDefaults(), is_custom: false, updated_at: null };
}

/**
 * The coach editor PUT: upsert the coach's six defaults (the whole set is
 * replaced — no partial patch). `values` is already validated by the route's
 * Zod schema. Returns the fresh response.
 */
export async function upsertImportDefaults(
  coach_id: bigint | number,
  values: ImportDefaultsValues,
  client: Sql = defaultSql,
): Promise<ImportDefaultsResponse> {
  const rows = await client<{ updated_at: string }[]>`
    insert into coach_import_defaults (
      coach_id, rest_strength_s, rest_conditioning_s, rest_core_mobility_s,
      rir_strength, rep_range_min, rep_range_max, updated_at
    )
    values (
      ${coach_id}, ${values.rest_strength_s}, ${values.rest_conditioning_s},
      ${values.rest_core_mobility_s}, ${values.rir_strength},
      ${values.rep_range_min}, ${values.rep_range_max}, now()
    )
    on conflict (coach_id) do update set
      rest_strength_s = excluded.rest_strength_s,
      rest_conditioning_s = excluded.rest_conditioning_s,
      rest_core_mobility_s = excluded.rest_core_mobility_s,
      rir_strength = excluded.rir_strength,
      rep_range_min = excluded.rep_range_min,
      rep_range_max = excluded.rep_range_max,
      updated_at = now()
    returning updated_at::text as updated_at
  `;
  return {
    ...values,
    is_custom: true,
    updated_at: rows[0]?.updated_at ?? new Date().toISOString(),
  };
}
