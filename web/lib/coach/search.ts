// Búsqueda del panel del coach (⌘K) — PLAN §4.9. Cuatro grupos tipados, como mucho
// CINCO filas por grupo, TODO con el `coach_id` de la sesión en el WHERE:
//
//   athletes  — sus atletas.
//   programs  — sus programas de biblioteca (`program_month_templates` sin atleta: las
//               copias personalizadas de un atleta se llegan por su ficha, no por aquí).
//   groups    — sus grupos (`program_sequences`). La columna `name` la añade otra obra en
//               paralelo (DOM): se detecta en caliente y, sin nombre, el grupo se llama
//               como su regla («Nivel N3 · 5 días»), igual que lo pinta el panel.
//   library   — sus entrenos (plantillas de biblioteca, sin instancias ni tests de
//               calibración) y sus bloques. Coinciden por su TÍTULO o por un ejercicio
//               que contienen, buscado en castellano, inglés, sus alias y el nombre que
//               el coach le puso — así «wall balls» encuentra el bloque aunque su título
//               sea «Estaciones».
//
// Comparación: sin tildes ni mayúsculas (`fahybrid_normalize_term`, 0172 — la misma
// función que indexa los nombres de ejercicio) y POR PALABRAS: «vidal marc» encuentra a
// Marc Vidal. Orden: empieza por la consulta > una palabra empieza por ella > contiene;
// a igualdad, el nombre más corto (el más específico).
//
// Pantallas y acciones del ⌘K son estáticas y viven en el cliente; aquí solo datos.

import { DEFAULT_LEVEL_AXIS_LABEL } from '@fahybrid/shared/domain/coach/level-axis';
import type { PendingQuery, Row } from 'postgres';
import { sql } from '@/lib/db';

/** A composable SQL fragment (what `sql`…`` returns before it is awaited). */
type Fragment = PendingQuery<Row[]>;

export const SEARCH_GROUP_LIMIT = 5;

export interface SearchAthlete {
  id: string;
  name: string;
  avatar_url: string | null;
  /** El nombre corto del nivel del coach (su eje), o null. */
  level: string | null;
  lifecycle: string;
}
export interface SearchProgram {
  id: string;
  name: string;
  weeks: number;
}
export interface SearchGroup {
  id: string;
  name: string;
}
export interface SearchLibraryItem {
  id: string;
  kind: 'entreno' | 'bloque';
  name: string;
}
export interface CoachSearchResults {
  athletes: SearchAthlete[];
  programs: SearchProgram[];
  groups: SearchGroup[];
  library: SearchLibraryItem[];
}

export const EMPTY_SEARCH: CoachSearchResults = { athletes: [], programs: [], groups: [], library: [] };

/** La consulta partida en palabras normalizadas como en SQL (minúsculas, sin tildes). */
export function searchTokens(q: string): string[] {
  return q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 6);
}

/** Todas las palabras aparecen en `expr` (ya normalizado). */
function allTokensIn(expr: Fragment, tokens: string[]) {
  return sql`not exists (select 1 from unnest(${tokens}::text[]) tok where strpos(${expr}, tok) = 0)`;
}

/** 0 empieza por la consulta · 1 una palabra empieza por ella · 2 la contiene. */
function rankOf(expr: Fragment, phrase: string) {
  return sql`case
    when ${expr} like ${`${phrase}%`} then 0
    when ${expr} like ${`% ${phrase}%`} then 1
    else 2 end`;
}

let sequenceNameColumn: Promise<boolean> | null = null;
/** ¿`program_sequences.name` existe ya? (lo añade la obra de grupos; se tolera ambos estados). */
function hasSequenceName(): Promise<boolean> {
  sequenceNameColumn ??= sql<{ ok: boolean }[]>`
    select exists (
      select 1 from information_schema.columns
      where table_schema = current_schema() and table_name = 'program_sequences' and column_name = 'name'
    ) as ok
  `
    .then((r) => r[0]?.ok === true)
    .catch(() => {
      sequenceNameColumn = null;
      return false;
    });
  return sequenceNameColumn;
}

async function searchAthletes(coach: number, tokens: string[], phrase: string): Promise<SearchAthlete[]> {
  const norm = sql`fahybrid_normalize_term(a.full_name)`;
  return sql<SearchAthlete[]>`
    select a.id::text as id, a.full_name as name, a.avatar_url, lv.name as level,
           a.lifecycle_status::text as lifecycle
    from athletes a
    left join athlete_levels lv on lv.id = a.level_id and lv.coach_id = a.coach_id
    where a.coach_id = ${coach} and ${allTokensIn(norm, tokens)}
    order by (a.lifecycle_status::text = 'baja') asc, ${rankOf(norm, phrase)}, length(a.full_name), a.full_name
    limit ${SEARCH_GROUP_LIMIT}
  `;
}

async function searchPrograms(coach: number, tokens: string[], phrase: string): Promise<SearchProgram[]> {
  const norm = sql`fahybrid_normalize_term(m.name)`;
  return sql<SearchProgram[]>`
    select m.id::text as id, m.name,
           (select count(*)::int from program_month_weeks w where w.month_template_id = m.id) as weeks
    from program_month_templates m
    where m.coach_id = ${coach} and m.athlete_id is null and ${allTokensIn(norm, tokens)}
    order by ${rankOf(norm, phrase)}, length(m.name), m.id
    limit ${SEARCH_GROUP_LIMIT}
  `;
}

async function searchGroups(coach: number, tokens: string[], phrase: string): Promise<SearchGroup[]> {
  const named = await hasSequenceName();
  // Sin nombre (o columna aún inexistente), el grupo se llama como su regla nivel × días,
  // con el eje del coach (`coaches.level_axis_label`; misma forma que groupRuleName).
  const axis = sql`coalesce(nullif(btrim(c.level_axis_label), ''), ${DEFAULT_LEVEL_AXIS_LABEL})`;
  const rule = sql`case when s.level_id is not null and s.days_per_week is not null
    then ${axis} || ' ' || coalesce(lv.name, '?') || ' · ' || s.days_per_week
         || case when s.days_per_week = 1 then ' día' else ' días' end
    else 'Grupo ' || s.id end`;
  const display = named ? sql`coalesce(nullif(btrim(s.name), ''), ${rule})` : rule;
  const norm = sql`fahybrid_normalize_term(${display})`;
  return sql<SearchGroup[]>`
    select s.id::text as id, ${display} as name
    from program_sequences s
    left join athlete_levels lv on lv.id = s.level_id and lv.coach_id = s.coach_id
    left join coaches c on c.id = s.coach_id
    where s.coach_id = ${coach} and ${allTokensIn(norm, tokens)}
    order by ${rankOf(norm, phrase)}, length(${display}), s.id
    limit ${SEARCH_GROUP_LIMIT}
  `;
}

/** Nombres de un ejercicio que el coach puede reconocer: el suyo (override), base, ES, EN
 *  y los alias del vocabulario compartido. Alias `e` = exercises. */
function exerciseMatches(coach: number, tokens: string[]) {
  return sql`(
    ${allTokensIn(sql`fahybrid_normalize_term(concat_ws(' ', e.name, e.name_es, e.name_en,
      (select concat_ws(' ', o.name, o.name_es, o.name_en) from coach_exercise_overrides o
        where o.exercise_id = e.id and o.coach_id = ${coach})))`, tokens)}
    or exists (select 1 from exercise_aliases al where al.exercise_id = e.id
               and ${allTokensIn(sql`al.term_normalized`, tokens)})
  )`;
}

async function searchLibrary(coach: number, tokens: string[], phrase: string): Promise<SearchLibraryItem[]> {
  const tNorm = sql`fahybrid_normalize_term(t.name)`;
  const bNorm = sql`fahybrid_normalize_term(b.title)`;
  return sql<SearchLibraryItem[]>`
    select id, kind, name from (
      select t.id::text as id, 'entreno'::text as kind, t.name,
             case when ${allTokensIn(tNorm, tokens)} then ${rankOf(tNorm, phrase)} else 3 end as rnk
      from templates t
      where t.coach_id = ${coach} and t.archived_at is null and t.instance_athlete_id is null
        and not exists (select 1 from coach_calibration_tests ct where ct.template_id = t.id)
        and (
          ${allTokensIn(tNorm, tokens)}
          or exists (select 1 from template_segments sg join exercises e on e.id = sg.exercise_id
                     where sg.template_id = t.id and ${exerciseMatches(coach, tokens)})
        )
      union all
      select b.id::text as id, 'bloque'::text as kind, b.title as name,
             case when ${allTokensIn(bNorm, tokens)} then ${rankOf(bNorm, phrase)} else 3 end as rnk
      from blocks b
      where b.coach_id = ${coach}
        and (
          ${allTokensIn(bNorm, tokens)}
          or exists (select 1 from block_exercises be join exercises e on e.id = be.exercise_id
                     where be.block_id = b.id and ${exerciseMatches(coach, tokens)})
        )
    ) hits
    order by rnk, length(name), kind, id
    limit ${SEARCH_GROUP_LIMIT}
  `;
}

/** Las cuatro búsquedas a la vez, todas con el coach en el WHERE. */
export async function searchCoach(params: {
  coach_id: bigint | number;
  q: string;
}): Promise<CoachSearchResults> {
  const tokens = searchTokens(params.q);
  if (tokens.length === 0) return EMPTY_SEARCH;
  const coach = Number(params.coach_id);
  const phrase = tokens.join(' ');
  const [athletes, programs, groups, library] = await Promise.all([
    searchAthletes(coach, tokens, phrase),
    searchPrograms(coach, tokens, phrase),
    searchGroups(coach, tokens, phrase),
    searchLibrary(coach, tokens, phrase),
  ]);
  return { athletes, programs, groups, library };
}
