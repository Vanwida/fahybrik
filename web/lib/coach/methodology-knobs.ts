import 'server-only';

// Los 5 mandos de metodología — lectura/escritura sobre
// `coach_methodology_knobs` (mig 0197).
//
// GET resuelve la fila del coach, o los defectos de mecanismo cuando no ha
// escrito ninguna (`is_custom` dice cuál). PUT reemplaza el conjunto entero.
// Scoped a `coach_id`. Un coach vacío no lee la fila de otro.
//
// Espejo de web/lib/coach/import-defaults.ts. Este módulo es SOLO el almacén:
// no lo lee plan, chat ni MCP todavía.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import {
  defaultCoachMethodologyKnobs,
  type AddressForm,
  type BlockEndPolicy,
  type CoachMethodologyKnobs,
  type HrAnchor,
  type RunPaceAnchor,
  type ToneRegister,
} from '@fahybrid/shared/domain/coach/methodology-knobs';
import type { CoachMethodologyKnobsResponse } from '@fahybrid/shared/schema/coach-methodology-knobs';

const TABLE = 'coach_methodology_knobs';

interface KnobsRow {
  hr_zone_count: number;
  hr_anchor: string;
  run_pace_anchor: string;
  default_test_slugs: string[];
  block_end_policy: string;
  sleep_min_hours: number;
  hrv_drop_pct: number;
  load_tsb_floor: number;
  tone_register: string;
  address_form: string;
  updated_at: string;
}

function knobsFromRow(row: KnobsRow): CoachMethodologyKnobs {
  return {
    zones: {
      hr_zone_count: Number(row.hr_zone_count),
      hr_anchor: row.hr_anchor as HrAnchor,
      run_pace_anchor: row.run_pace_anchor as RunPaceAnchor,
    },
    default_tests: [...row.default_test_slugs],
    block_end_policy: row.block_end_policy as BlockEndPolicy,
    day_down: {
      sleep_min_hours: Number(row.sleep_min_hours),
      hrv_drop_pct: Number(row.hrv_drop_pct),
      load_tsb_floor: Number(row.load_tsb_floor),
    },
    tone: {
      register: row.tone_register as ToneRegister,
      address_form: row.address_form as AddressForm,
    },
  };
}

/** La fila del coach, o null si no ha escrito ninguna. Única por coach. */
async function loadRow(
  coach_id: bigint | number,
  client: Sql,
): Promise<KnobsRow | null> {
  try {
    const rows = await client<KnobsRow[]>`
      select
        hr_zone_count,
        hr_anchor,
        run_pace_anchor,
        default_test_slugs,
        block_end_policy,
        sleep_min_hours::float8 as sleep_min_hours,
        hrv_drop_pct::float8 as hrv_drop_pct,
        load_tsb_floor::float8 as load_tsb_floor,
        tone_register,
        address_form,
        updated_at::text as updated_at
      from coach_methodology_knobs
      where coach_id = ${coach_id}
      limit 1
    `;
    return rows[0] ?? null;
  } catch (err) {
    if (isPgMissingRelation(err, TABLE)) return null;
    throw err;
  }
}

/**
 * El GET del editor: los 5 mandos resueltos + si son suyos o los del sistema.
 */
export async function getCoachMethodologyKnobs(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachMethodologyKnobsResponse> {
  const row = await loadRow(coach_id, client);
  if (row) {
    return { ...knobsFromRow(row), is_custom: true, updated_at: row.updated_at };
  }
  return { ...defaultCoachMethodologyKnobs(), is_custom: false, updated_at: null };
}

/**
 * El PUT del editor: reemplaza el conjunto entero del coach (sin parche por
 * mando). `values` llega ya validado por el esquema Zod de la ruta.
 */
export async function upsertCoachMethodologyKnobs(
  coach_id: bigint | number,
  values: CoachMethodologyKnobs,
  client: Sql = defaultSql,
): Promise<CoachMethodologyKnobsResponse> {
  const rows = await client<{ updated_at: string }[]>`
    insert into coach_methodology_knobs (
      coach_id,
      hr_zone_count,
      hr_anchor,
      run_pace_anchor,
      default_test_slugs,
      block_end_policy,
      sleep_min_hours,
      hrv_drop_pct,
      load_tsb_floor,
      tone_register,
      address_form,
      updated_at
    )
    values (
      ${coach_id},
      ${values.zones.hr_zone_count},
      ${values.zones.hr_anchor},
      ${values.zones.run_pace_anchor},
      ${values.default_tests}::text[],
      ${values.block_end_policy},
      ${values.day_down.sleep_min_hours},
      ${values.day_down.hrv_drop_pct},
      ${values.day_down.load_tsb_floor},
      ${values.tone.register},
      ${values.tone.address_form},
      now()
    )
    on conflict (coach_id) do update set
      hr_zone_count = excluded.hr_zone_count,
      hr_anchor = excluded.hr_anchor,
      run_pace_anchor = excluded.run_pace_anchor,
      default_test_slugs = excluded.default_test_slugs,
      block_end_policy = excluded.block_end_policy,
      sleep_min_hours = excluded.sleep_min_hours,
      hrv_drop_pct = excluded.hrv_drop_pct,
      load_tsb_floor = excluded.load_tsb_floor,
      tone_register = excluded.tone_register,
      address_form = excluded.address_form,
      updated_at = now()
    returning updated_at::text as updated_at
  `;
  return {
    ...values,
    default_tests: [...values.default_tests],
    is_custom: true,
    updated_at: rows[0]?.updated_at ?? new Date().toISOString(),
  };
}
