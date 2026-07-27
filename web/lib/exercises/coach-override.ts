import type { Sql, TransactionClient } from '@/lib/db';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';

/**
 * The exercise catalog's OWNERSHIP + FORK model — the single source for both.
 *
 * THREE ORIGINS, and only three (migration 0132):
 *   • BASE          — `exercises.coach_id IS NULL`. Our product. Every coach sees it.
 *   • PERSONALIZADO — a BASE exercise + this coach's `coach_exercise_overrides` row.
 *   • PROPIO        — `exercises.coach_id = <coach>`. The coach made it. Only they see it.
 *
 * WHAT FORKS AND WHAT DOESN'T. A coach forks what they AUTHOR (their voice):
 * `name` / `cues` / `description` / `video_url`. They never fork what the movement
 * IS (slug / modality / category / muscles / equipment / default_metrics /
 * hyrox_station_position) — the system reasons over that.
 *
 * The reason is mechanical: an override lives on the SAME id, so it applies
 * retroactively to everything already pointing there (template_segments,
 * block_exercises) — rename "Wall Balls" and the coach's EXISTING sessions show the
 * new name. A row-copy fork (new id) would not. And by the same token identity
 * can't be forked: changing category/modality would reinterpret history (analytics
 * route on modality). The escape hatch for "I need a different movement" is a NEW
 * id — a PROPIO exercise — which applies forward and never rewrites the past.
 *
 * This module single-sources:
 *   • VISIBILITY — `visibleToCoach` (the one predicate every enumeration/resolver uses).
 *   • the MERGE precedence (override wins, else base) — `mergedExerciseContent`.
 *   • the JOIN that attaches a coach's override — `joinCoachOverride` (needs alias `e`).
 *   • the WRITE — `upsertCoachExerciseOverride`.
 *   • the ORIGIN label — `exerciseOriginExpr`.
 *
 * Nothing may restate the precedence or the visibility rule — two loaders that
 * each spell it out are two loaders that will drift.
 */

type Client = Sql | TransactionClient;

/**
 * The FOUR fields a coach may fork. Every column list, merge and origin check
 * below is GENERATED from this constant — adding a field here is the only edit
 * needed to fork one more (plus its column in migration 0132's table).
 * Global identity is never here.
 */
export const COACH_OVERRIDE_FIELDS = ['name', 'cues', 'description', 'video_url'] as const;
export type CoachOverrideField = (typeof COACH_OVERRIDE_FIELDS)[number];

/** Where an exercise comes from, as the coach's catalog labels it. */
export type ExerciseOrigin = 'base' | 'customized' | 'own';

/** A partial override patch. `null` = clear this field's override (fall back to base). */
export type CoachExerciseOverridePatch = Partial<Record<CoachOverrideField, string | null>>;

/** Comma-join SQL fragments — the column lists below are all built this way. */
function csv(client: Client, frags: ReturnType<Client>[]) {
  return frags.reduce((acc, frag) => client`${acc}, ${frag}`);
}

/** Pick only the forkable keys from a wider patch. */
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

/**
 * The NON-forkable (shared identity) keys from a wider patch — category /
 * primary_muscle_groups / equipment. On a BASE exercise these are refused (the
 * identity is shared — duplicate it instead). On the coach's OWN exercise they're
 * written directly, because there the whole row is theirs.
 */
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
 * THE visibility predicate: a coach sees the BASE catalog plus their OWN
 * exercises, never another coach's. Requires the exercises alias `e`. Use in
 * every reader that ENUMERATES the catalog or RESOLVES a name/slug/id into an
 * exercise — those are the ones that leak.
 *
 * Do NOT add it to a hydration join (`join exercises e on e.id = s.exercise_id`)
 * where the id arrives by FK from an already-scoped row: that id is transitively
 * scoped already, and an inner join carrying a coach predicate would make work
 * already assigned to an athlete silently VANISH.
 *
 * `coachId` null (an athlete with no coach) → only the BASE catalog is visible.
 */
export function visibleToCoach(client: Client, coachId: bigint | number | null) {
  return client`(e.coach_id is null or e.coach_id = ${coachId})`;
}

/**
 * Which of `ids` are NOT visible to this coach — they don't exist, or they are
 * another coach's PROPIO. Every service that persists a CLIENT-supplied
 * exercise_id (import synonyms, template segments, block exercises) refuses on
 * a non-empty result, and turns both causes into the SAME rejection so it never
 * reveals which. One shared query so the visibility rule is never restated.
 */
export async function invisibleExerciseIds(
  client: Client,
  coachId: bigint | number | null,
  ids: Array<number | bigint>,
): Promise<number[]> {
  const unique = [...new Set(ids.map((id) => Number(id)))];
  if (unique.length === 0) return [];
  const visible = await client<Array<{ id: string }>>`
    select e.id::text as id
    from exercises e
    where e.id = any(${unique}::bigint[])
      and ${visibleToCoach(client, coachId)}
  `;
  const visibleSet = new Set(visible.map((r) => Number(r.id)));
  return unique.filter((id) => !visibleSet.has(id));
}

/**
 * The LEFT JOIN that attaches a coach's override to a query exposing the exercise
 * row under alias `e`. `coachId` null → matches nothing and the base values stand.
 * Binds the override under alias `ceo`, which the helpers below read.
 */
export function joinCoachOverride(client: Client, coachId: bigint | number | null) {
  return client`
    left join coach_exercise_overrides ceo
      on ceo.exercise_id = e.id
     and ceo.coach_id = ${coachId}
  `;
}

/**
 * The MERGED content columns — the coach's override wins, else the base value.
 * Requires aliases `e` and `ceo` (from `joinCoachOverride`) in scope. `prefix`
 * namespaces the output aliases (e.g. `'exercise_'` → `exercise_name`) WITHOUT
 * re-stating the precedence, so the rule stays single-sourced whatever the
 * reader's column naming.
 *
 * NOTE: this now emits `name` too. A reader that also selects `e.name` under the
 * same alias would emit a DUPLICATE column — drop the raw one and let the merge
 * provide it (that's the point: the coach's name is the true name for them).
 */
export function mergedExerciseContent(client: Client, prefix = '') {
  return csv(
    client,
    COACH_OVERRIDE_FIELDS.map(
      (f) => client`coalesce(ceo.${client(f)}, e.${client(f)}) as ${client(`${prefix}${f}`)}`,
    ),
  );
}

/**
 * "This coach has actually forked this base exercise" — at least one field set.
 * An override row that exists with everything cleared is NOT a fork: the coach
 * customized it and then undid it, and the catalog must call it BASE again.
 */
function anyOverrideSet(client: Client) {
  return COACH_OVERRIDE_FIELDS.map((f) => client`ceo.${client(f)} is not null`).reduce(
    (acc, frag) => client`${acc} or ${frag}`,
  );
}

/**
 * The origin label, DERIVED — never stored, so it can't go stale. `own` short-
 * circuits: a coach's own exercise is edited directly and has no override row by
 * construction. Requires `e` and `ceo` in scope.
 */
export function exerciseOriginExpr(client: Client) {
  return client`
    case
      when e.coach_id is not null then 'own'
      when ${anyOverrideSet(client)} then 'customized'
      else 'base'
    end
  `;
}

/**
 * The catalog's origin facet as a WHERE predicate (SQL can't filter on the
 * SELECT alias). Same three buckets as `exerciseOriginExpr`, single-sourced off
 * the same `anyOverrideSet` so the filter and the row label can never disagree —
 * a row shown as "Base" is exactly a row the "Base" filter returns. `null` = no
 * filter ("Todos").
 */
export function exerciseOriginFilter(client: Client, origin: ExerciseOrigin | null) {
  switch (origin) {
    case 'own':
      return client`e.coach_id is not null`;
    case 'customized':
      return client`(e.coach_id is null and (${anyOverrideSet(client)}))`;
    case 'base':
      return client`(e.coach_id is null and not (${anyOverrideSet(client)}))`;
    default:
      return client`true`;
  }
}

/**
 * Upsert a coach's override for a BASE exercise. Only the SUPPLIED fields are
 * written; on conflict only those columns update (a partial save never wipes a
 * field the coach didn't touch). A `null` field clears that override (the
 * read-side coalesce then falls back to the base). No-op when the patch carries
 * no override field.
 *
 * The caller must have verified the exercise exists AND is BASE — an override on
 * the coach's OWN exercise would create a confusing dual state (direct row edits
 * plus a shadowing override). The single write path (update-exercise's router)
 * guarantees this: own → direct, base → override, never both.
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
 * An exercise as a COACH sees and authors it:
 *   • the plain content fields (name/cues/description/video_url) are MERGED — the
 *     value to DISPLAY. A consumer that just renders can't get it wrong.
 *   • `base_*` — the shared BASE value (the editor's placeholder / "heredado de").
 *   • `override_*` — this coach's RAW override (the editor's value, null = none).
 *   • `origin` — base | customized | own, for the catalog's filter and row label.
 * GET /api/exercises and the PATCH response share this shape so the picker and the
 * catalog screen handle exactly one row type.
 */
export type CoachExerciseRow = CatalogExercise & {
  coach_id: string | null;
  origin: ExerciseOrigin;
  base_name: string;
  base_cues: string | null;
  base_description: string | null;
  base_video_url: string | null;
  override_name: string | null;
  override_cues: string | null;
  override_description: string | null;
  override_video_url: string | null;
};

/** The full coach-facing SELECT list (merged + base + raw override + origin). */
export function coachExerciseColumns(client: Client) {
  const baseCols = csv(
    client,
    COACH_OVERRIDE_FIELDS.map((f) => client`e.${client(f)} as ${client(`base_${f}`)}`),
  );
  const overrideCols = csv(
    client,
    COACH_OVERRIDE_FIELDS.map((f) => client`ceo.${client(f)} as ${client(`override_${f}`)}`),
  );
  return client`
    e.id::text                 as id,
    e.slug                     as slug,
    e.coach_id::text           as coach_id,
    e.category::text           as category,
    e.modality                 as modality,
    e.primary_muscle_groups    as primary_muscle_groups,
    e.equipment                as equipment,
    e.default_metrics_json     as default_metrics_json,
    e.hyrox_station_position   as hyrox_station_position,
    ${mergedExerciseContent(client)},
    ${baseCols},
    ${overrideCols},
    ${exerciseOriginExpr(client)} as origin
  `;
}

/**
 * The catalog display ORDER shared by every picker (coach GET /api/exercises,
 * athlete GET /api/athlete/exercises, the Biblioteca catalog): category priority
 * (hyrox stations first … other last), then name. Orders by the MERGED name — a
 * coach who renamed an exercise finds it under the name THEY use. Requires `e`
 * and `ceo` in scope; use as `order by ${exerciseCatalogOrder(sql)}`.
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
    coalesce(ceo.name, e.name) asc
  `;
}

/**
 * Where an exercise stands for THIS coach, before deciding how to write it:
 *   • `'base'` — shared identity. A forkable edit becomes their override; an
 *     identity edit is refused (duplicate it instead).
 *   • `'own'`  — the whole row is theirs. Every field is edited directly.
 *   • `null`   — doesn't exist, or belongs to another coach. The caller turns both
 *     into the same 404 so the API never reveals another coach's exercise.
 */
export async function loadExerciseScope(
  client: Client,
  coach_id: bigint,
  exercise_id: bigint,
): Promise<'base' | 'own' | null> {
  const rows = await client<{ owned: boolean }[]>`
    select (e.coach_id is not null) as owned
    from exercises e
    where e.id = ${exercise_id}
      and ${visibleToCoach(client, coach_id)}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return row.owned ? 'own' : 'base';
}

/**
 * Load one exercise for a coach (merged + base + their raw override), scoped to
 * what they may see. Used as the PATCH response so the editor reflects exactly
 * what was saved. Null when the exercise doesn't exist OR belongs to another
 * coach — the caller turns both into the same 404, so the API never reveals that
 * another coach's exercise exists.
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
      and ${visibleToCoach(client, coach_id)}
    limit 1
  `;
  return rows[0] ?? null;
}
