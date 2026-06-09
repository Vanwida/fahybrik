// Nutrition data layer — athlete daily food log (migration 0036).
//
// Pure-ish data access: every function accepts an optional injectable `client`
// (defaults to the shared `sql`) so the route handlers stay thin and the logic
// is unit-testable by stubbing the sql tag (repo test pattern).
//
// Responses use snake_case (iOS Codable convention). Numerics come back from
// postgres.js as strings; we normalise to JS numbers at the edge so the JSON
// the client receives is `kcal: 123.4`, not `"123.4"`.

import { sql as defaultSql, type Sql } from '@/lib/db';

export const NUTRITION_SOURCES = ['manual', 'barcode', 'photo'] as const;
export type NutritionSource = (typeof NUTRITION_SOURCES)[number];

export interface NutritionEntry {
  id: string;
  logged_for: string; // YYYY-MM-DD
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  quantity: number | null;
  unit: string | null;
  source: NutritionSource;
  barcode: string | null;
  created_at: string;
}

export interface NutritionTotals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface CreateNutritionInput {
  logged_for: string;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  quantity?: number | null;
  unit?: string | null;
  source?: NutritionSource;
  barcode?: string | null;
  raw?: unknown;
}

type DbRow = {
  id: string;
  logged_for: string;
  name: string;
  kcal: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  quantity: string | null;
  unit: string | null;
  source: NutritionSource;
  barcode: string | null;
  created_at: string;
};

function num(v: string | null): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapRow(row: DbRow): NutritionEntry {
  return {
    id: row.id,
    logged_for: row.logged_for,
    name: row.name,
    kcal: num(row.kcal),
    protein_g: num(row.protein_g),
    carbs_g: num(row.carbs_g),
    fat_g: num(row.fat_g),
    quantity: row.quantity == null ? null : num(row.quantity),
    unit: row.unit,
    source: row.source,
    barcode: row.barcode,
    created_at: row.created_at,
  };
}

// We select the resolved columns the client renders. `raw` (audit payload) is
// intentionally NOT returned — it's for backend auditing only.
const SELECT_COLS = `
  id::text as id,
  to_char(logged_for, 'YYYY-MM-DD') as logged_for,
  name, kcal::text as kcal, protein_g::text as protein_g,
  carbs_g::text as carbs_g, fat_g::text as fat_g,
  quantity::text as quantity, unit, source, barcode,
  to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
`;

export async function createNutritionEntry(args: {
  athlete_id: bigint;
  input: CreateNutritionInput;
  client?: Sql;
}): Promise<NutritionEntry> {
  const client = args.client ?? defaultSql;
  const i = args.input;
  const rows = await client<DbRow[]>`
    insert into nutrition_entries
      (athlete_id, logged_for, name, kcal, protein_g, carbs_g, fat_g,
       quantity, unit, source, barcode, raw)
    values (
      ${args.athlete_id as unknown as number},
      ${i.logged_for},
      ${i.name},
      ${i.kcal},
      ${i.protein_g},
      ${i.carbs_g},
      ${i.fat_g},
      ${i.quantity ?? null},
      ${i.unit ?? null},
      ${i.source ?? 'manual'},
      ${i.barcode ?? null},
      ${i.raw === undefined || i.raw === null ? null : JSON.stringify(i.raw)}::jsonb
    )
    returning ${client.unsafe(SELECT_COLS)}
  `;
  return mapRow(rows[0]!);
}

export async function listNutritionForDay(args: {
  athlete_id: bigint;
  date: string;
  client?: Sql;
}): Promise<{ entries: NutritionEntry[]; totals: NutritionTotals }> {
  const client = args.client ?? defaultSql;
  const rows = await client<DbRow[]>`
    select ${client.unsafe(SELECT_COLS)}
    from nutrition_entries
    where athlete_id = ${args.athlete_id as unknown as number}
      and logged_for = ${args.date}
    order by created_at asc, id asc
  `;
  const entries = rows.map(mapRow);
  const totals = entries.reduce<NutritionTotals>(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      protein_g: acc.protein_g + e.protein_g,
      carbs_g: acc.carbs_g + e.carbs_g,
      fat_g: acc.fat_g + e.fat_g,
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
  return { entries, totals };
}

/**
 * Deletes one entry IF it belongs to the athlete. Returns true when a row was
 * removed. The ownership filter is in the WHERE clause, so a foreign id simply
 * deletes nothing → the route returns 404 (never leaks existence with a 403).
 */
export async function deleteNutritionEntry(args: {
  athlete_id: bigint;
  id: bigint;
  client?: Sql;
}): Promise<boolean> {
  const client = args.client ?? defaultSql;
  const rows = await client<{ id: string }[]>`
    delete from nutrition_entries
    where id = ${args.id as unknown as number}
      and athlete_id = ${args.athlete_id as unknown as number}
    returning id::text as id
  `;
  return rows.length > 0;
}
