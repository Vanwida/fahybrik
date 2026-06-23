// v2 · PERIODIZACIÓN — server loaders for the coach's framework data:
//   · Niveles (athlete_levels)        — the "who" axis, with live athlete counts.
//   · Fases   (methodology_phases)     — the "color" axis, via the shared loader.
//
// AGNOSTIC: both are 100% coach-owned data. Niveles carry a free código + etiqueta
// + descripción (the classification criteria live in the description as text, a
// confirmed product decision). Fases carry a free label; the ONLY closed field is
// `role` (volume|intensity|peak|recovery|maintenance), which exists solely to give
// a coherent color. The ATR/N1–N5 examples are editable seed data, never system
// concepts.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadCoachPhases } from '@/lib/dashboard/coach/phases';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';

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
// FASES — thin re-shape of the shared loader so the client gets string ids.
// =============================================================================

/** One coach phase as the v2 client needs it (ids as strings — bigint-safe). */
export interface V2PhaseItem {
  id: string;
  code: string;
  label: string;
  role: MethodologyPhase['role'];
  /** Explicit color override; null => derived from role (the normal case). */
  color: string | null;
  default_weeks: number | null;
  sequence_order: number;
  is_deload: boolean;
  description: string | null;
}

function toV2Phase(p: MethodologyPhase): V2PhaseItem {
  return {
    id: String(p.id),
    code: p.code,
    label: p.label,
    role: p.role,
    color: p.color,
    default_weeks: p.default_weeks,
    sequence_order: p.sequence_order,
    is_deload: p.is_deload,
    description: p.description,
  };
}

/** Load the coach's phases ordered by sequence_order (re-uses loadCoachPhases). */
export async function loadCoachPhasesV2(
  coachId: number | bigint,
  client: Sql = defaultSql,
): Promise<V2PhaseItem[]> {
  const phases = await loadCoachPhases(coachId, client);
  return phases.map(toV2Phase);
}

// =============================================================================
// PAGE DATA — both axes in one shape for the server page.
// =============================================================================

export interface V2PeriodizacionData {
  levels: V2LevelItem[];
  phases: V2PhaseItem[];
}

export async function loadPeriodizacionData(
  coachId: number | bigint,
  client: Sql = defaultSql,
): Promise<V2PeriodizacionData> {
  const [levels, phases] = await Promise.all([
    loadCoachLevels(coachId, client),
    loadCoachPhasesV2(coachId, client),
  ]);
  return { levels, phases };
}
