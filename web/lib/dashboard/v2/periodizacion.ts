// v2 · PERIODIZACIÓN — server loader for the coach's framework data:
//   · Niveles (athlete_levels)        — the "who" axis, with live athlete counts.
//
// AGNOSTIC: 100% coach-owned data. Niveles carry a free código + etiqueta +
// descripción (the classification criteria live in the description as text, a
// confirmed product decision). The N1–N5 examples are editable seed data, never
// system concepts. There is no phase entity — the ORDER of microciclos in a
// sequence IS the periodization.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

// =============================================================================
// NIVELES
// =============================================================================

/** One coach level as the v2 client needs it (ids as strings — bigint-safe). */
export interface V2LevelItem {
  id: string;
  /** Short code shown as the chip (LevelBadge), e.g. "N1" or "Elite". */
  name: string;
  /** Human-readable label, e.g. "Iniciación". */
  label: string;
  /** The distinguishing criterion (thresholds live here as free text). */
  description: string | null;
  sort_order: number;
  /** How many athletes currently hold this level (drives the row meta + delete guard). */
  athlete_count: number;
}

type LevelCountRow = {
  id: string;
  name: string;
  label: string;
  description: string | null;
  sort_order: number;
  athlete_count: string;
};

/**
 * Load the coach's levels ordered by sort_order, each with its live athlete
 * count. One round-trip (LEFT JOIN + GROUP BY) — no N+1. Athletes with no level
 * never inflate a level's count (the join is on athletes.level_id).
 */
export async function loadCoachLevels(
  coachId: number | bigint,
  client: Sql = defaultSql,
): Promise<V2LevelItem[]> {
  const rows = await client<LevelCountRow[]>`
    select
      al.id::text         as id,
      al.name             as name,
      al.label            as label,
      al.description      as description,
      al.sort_order       as sort_order,
      count(a.id)::text   as athlete_count
    from athlete_levels al
    left join athletes a on a.level_id = al.id
    where al.coach_id = ${String(coachId)}
    group by al.id, al.name, al.label, al.description, al.sort_order
    order by al.sort_order asc, al.id asc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    label: r.label,
    description: r.description,
    sort_order: r.sort_order,
    athlete_count: Number(r.athlete_count),
  }));
}

// =============================================================================
// PAGE DATA — the levels axis for the server page.
// =============================================================================

export interface V2PeriodizacionData {
  levels: V2LevelItem[];
}

export async function loadPeriodizacionData(
  coachId: number | bigint,
  client: Sql = defaultSql,
): Promise<V2PeriodizacionData> {
  const levels = await loadCoachLevels(coachId, client);
  return { levels };
}
