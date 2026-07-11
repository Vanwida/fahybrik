import type { Sql, TransactionClient } from '@/lib/db';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';

/**
 * Per-coach exercise overrides — the pedagogical fork of the GLOBAL catalog.
 *
 * The `exercises` table is ONE shared row per movement (identity: slug / name /
 * category / modality / 1RM mapping / default_metrics / muscles / equipment /
 * station). The only per-coach axis is the PEDAGOGICAL content — `cues`,
 * `description`, `video_url` — which lives in `coach_exercise_overrides`
 * (migration 0085), one row per (coach_id, exercise_id), each field independently
 * nullable (NULL = inherit the global default for that field).
 *
 * This module is the SINGLE SOURCE for:
 *   • the WRITE: `upsertCoachExerciseOverride` (a coach's edit → their override).
 *   • the MERGE precedence (override wins, else global): `mergedExerciseContent`.
 *   • the JOIN that attaches a coach's override to a catalog query:
 *     `joinCoachOverride` (requires the exercises alias `e`; binds `ceo`).
 *
 * Every athlete-facing reader (assignment-detail brief, station technique video)
 * and the coach's own merged view go through these helpers so the rule lives in
 * exactly one place (DRY — no two loaders can ever diverge).
 */

type Client = Sql | TransactionClient;

/** The three pedagogical fields a coach may override. Global identity is never here. */
export const COACH_OVERRIDE_FIELDS = ['cues', 'description', 'video_url'] as const;
export type CoachOverrideField = (typeof COACH_OVERRIDE_FIELDS)[number];

/** A partial override patch. `null` = clear this field's override (fall back to global). */
export type CoachExerciseOverridePatch = Partial<Record<CoachOverrideField, string | null>>;

/** Pick only the override-bound keys (cues/description/video_url) from a wider patch. */
export function pickOverrideFields<T extends Record<string, unknown>>(
  patch: T,
): CoachExerciseOverridePatch {
  const out: CoachExerciseOverridePatch = {};
  for (const key of COACH_OVERRIDE_FIELDS) {
    if (key in patch && patch[key] !== undefined) {
      out[key] = patch[key] as string | null;
    }
  }
  return out;
}

/** The non-override (global identity) keys from a wider patch — everything else. */
export function pickIdentityFields<T extends Record<string, unknown>>(patch: T): Partial<T> {
  const overrideSet = new Set<string>(COACH_OVERRIDE_FIELDS);
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!overrideSet.has(key) && value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/**
 * The LEFT JOIN that attaches a coach's override to a query exposing the global
 * exercise row under alias `e`. `coachId` null (athlete with no coach — none
 * today) → the join matches nothing and the global defaults stand. Binds the
 * override under alias `ceo`, which `mergedExerciseContent` reads.
 */
export function joinCoachOverride(client: Client, coachId: bigint | number | null) {
  return client`
    left join coach_exercise_overrides ceo
      on ceo.exercise_id = e.id
     and ceo.coach_id = ${coachId}
  `;
}

/**
 * The three MERGED content columns — the coach's override wins, else the global.
 * Requires the exercises alias `e` and the override alias `ceo` (from
 * `joinCoachOverride`) to be in scope. `prefix` namespaces the output aliases
 * (e.g. `'exercise_'` → `exercise_cues`) WITHOUT re-stating the precedence, so
 * the merge rule stays single-sourced no matter the reader's column naming.
 */
export function mergedExerciseContent(client: Client, prefix = '') {
  const as = (field: CoachOverrideField) => client(`${prefix}${field}`);
  return client`
    coalesce(ceo.cues, e.cues)               as ${as('cues')},
    coalesce(ceo.description, e.description)  as ${as('description')},
    coalesce(ceo.video_url, e.video_url)     as ${as('video_url')}
  `;
}

/**
 * Upsert a coach's override for an exercise. Only the SUPPLIED fields are
 * written; on conflict only those columns are updated (so a partial save never
 * wipes a field the coach didn't touch). A `null` field clears that override
 * (the read-side coalesce then falls back to the global). No-op when the patch
 * carries no override field. The caller must have verified the exercise exists
 * (the FK would otherwise raise 23503).
 */
export async function upsertCoachExerciseOverride(
  client: Client,
  args: { coach_id: bigint; exercise_id: bigint; patch: CoachExerciseOverridePatch },
): Promise<void> {
  const cols = COACH_OVERRIDE_FIELDS.filter((f) => args.patch[f] !== undefined);
  if (cols.length === 0) return;

  const insertRow: Record<string, unknown> = {
    coach_id: args.coach_id,
    exercise_id: args.exercise_id,
  };
  for (const c of cols) insertRow[c] = args.patch[c] ?? null;

  // DO UPDATE only the supplied columns, from `excluded` (the would-be insert).
  const setFrags = cols.map((c) => client`${client(c)} = excluded.${client(c)}`);
  const setClause = setFrags.reduce((acc, frag) => client`${acc}, ${frag}`);

  await client`
    insert into coach_exercise_overrides ${client(insertRow, 'coach_id', 'exercise_id', ...cols)}
    on conflict (coach_id, exercise_id) do update set ${setClause}, updated_at = now()
  `;
}

/**
 * An exercise row as a COACH authors it: the GLOBAL catalog fields (with
 * cues/description/video_url being the GLOBAL defaults) PLUS the coach's RAW
 * per-field override (null = no override for that field). The editor prefills
 * with the override and shows the global as the placeholder; the athlete-facing
 * MERGE (coalesce) is `mergedExerciseContent` in the read loaders. GET
 * /api/exercises and the PATCH response share this shape so the picker handles
 * exactly one row type.
 */
export type CoachExerciseRow = CatalogExercise & {
  override_cues: string | null;
  override_description: string | null;
  override_video_url: string | null;
};

/** The override-aware SELECT columns (global e.* + raw ceo.* override). */
export function coachExerciseColumns(client: Client) {
  return client`
    e.id::text                 as id,
    e.slug                     as slug,
    e.name                     as name,
    e.category::text           as category,
    e.modality                 as modality,
    e.primary_muscle_groups    as primary_muscle_groups,
    e.equipment                as equipment,
    e.default_metrics_json     as default_metrics_json,
    e.hyrox_station_position   as hyrox_station_position,
    e.description              as description,
    e.cues                     as cues,
    e.video_url                as video_url,
    ceo.cues                   as override_cues,
    ceo.description            as override_description,
    ceo.video_url              as override_video_url
  `;
}

/**
 * The catalog display ORDER shared by every exercise picker (the coach GET
 * /api/exercises and the athlete GET /api/athlete/exercises): category priority
 * (hyrox stations first … other last), then name. Single-sourced so the two
 * pickers never drift. Requires the exercises alias `e` in scope; use as
 * `order by ${exerciseCatalogOrder(sql)}`.
 */
export function exerciseCatalogOrder(client: Client) {
  return client`
    case e.category
      when 'hyrox_station' then 0
      when 'strength' then 1
      when 'cardio' then 2
      when 'skill' then 3
      when 'plyometric' then 4
      when 'core' then 5
      when 'mobility' then 6
      else 7
    end,
    e.name asc
  `;
}

/**
 * Load a single exercise for a coach (global fields + their raw override). Used
 * as the PATCH response so the editor reflects exactly what was just saved. Null
 * when the exercise doesn't exist.
 */
export async function loadCoachExerciseRow(
  client: Client,
  coach_id: bigint,
  exercise_id: bigint,
): Promise<CoachExerciseRow | null> {
  const rows = await client<CoachExerciseRow[]>`
    select ${coachExerciseColumns(client)}
    from exercises e
    ${joinCoachOverride(client, coach_id)}
    where e.id = ${exercise_id}
    limit 1
  `;
  return rows[0] ?? null;
}
