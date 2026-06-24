import 'server-only';

// v2 · SECUENCIAS — server loader for the periodization matrix (nivel × días).
//
// A "Secuencia" = one matrix cell (coach × athlete_level × days_per_week): an
// ORDERED list of microciclos (program_month_templates) + an end-policy + a
// per-loop progression. This loader assembles the WHOLE-matrix view model the
// client needs in one shot, reusing the EXISTING loaders:
//   · levels      → loadCoachLevels        (athlete_levels, the rows)
//   · microciclos → listMonthTemplates     (the coach's month templates: the
//                   picker source + week-count/name lookup for previews)
//   · phases      → loadCoachPhasesV2       (label + role → color for items)
//   · sequences   → listCoachSequences      (program_sequences + ordered items)
//
// Cells are keyed `${level_id}_${days}` (the matrix coordinate). Each filled cell
// carries a DERIVED preview: item count, total weeks, and a per-item sparkline
// (segment width ∝ that microciclo's weeks, color = the item's phase role; neutral
// when the item has no phase). Weeks/role are resolved from the microciclo and
// phase maps, so the preview is honest data we already have — never invented.
//
// AGNOSTIC: levels via athlete_levels (NOT program_level), phases via
// methodology_phases (NOT atr_block_type). Strictly coach-scoped.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadCoachLevels, loadCoachPhasesV2 } from './periodizacion';
import type { V2LevelItem, V2PhaseItem } from './periodizacion';
import { listMonthTemplates } from '@/lib/dashboard/coach/program-months';
import { listCoachSequences } from '@/lib/dashboard/coach/sequences';
import type { ProgramSequence } from '@fahybrid/shared/schema/program-sequences';
import { SEQUENCE_DAYS_OPTIONS } from '@/components/v2/periodizacion/secuencias/days';

// ── View models ───────────────────────────────────────────────────────────────

/** A microciclo (program_month_templates) as the editor + picker need it. */
export interface V2SequenceMicrociclo {
  id: string;
  name: string;
  /** Weeks defined in this microciclo (via program_month_weeks). */
  week_count: number;
}

/** One ordered item of a sequence, resolved for display (microciclo + phase). */
export interface V2SequenceItem {
  /** The microciclo this slot references. */
  month_template_id: string;
  /** Optional methodology_phases label (null => no phase). */
  phase_id: string | null;
}

/** A whole sequence (one matrix cell) as the client edits it. */
export interface V2Sequence {
  id: string;
  level_id: string;
  days_per_week: number;
  end_policy: ProgramSequence['end_policy'];
  progression_pct: number | null;
  progression_applies_to: ProgramSequence['progression_applies_to'];
  items: V2SequenceItem[];
}

export interface V2SecuenciasData {
  levels: V2LevelItem[];
  phases: V2PhaseItem[];
  microciclos: V2SequenceMicrociclo[];
  /** Sequences keyed by `${level_id}_${days}` (the matrix coordinate). */
  cells: Record<string, V2Sequence>;
}

// ── Shaping helpers ─────────────────────────────────────────────────────────────

function cellKey(levelId: string | number | bigint, days: number): string {
  return `${String(levelId)}_${days}`;
}

function toV2Sequence(s: ProgramSequence): V2Sequence {
  return {
    id: String(s.id),
    level_id: String(s.level_id),
    days_per_week: s.days_per_week,
    end_policy: s.end_policy,
    progression_pct: s.progression_pct,
    progression_applies_to: s.progression_applies_to,
    items: s.items.map((it) => ({
      month_template_id: String(it.month_template_id),
      phase_id: it.phase_id == null ? null : String(it.phase_id),
    })),
  };
}

// ── Public loader ────────────────────────────────────────────────────────────

export async function loadSecuenciasData(
  coachId: number | bigint,
  client: Sql = defaultSql,
): Promise<V2SecuenciasData> {
  const [levels, phases, months, sequences] = await Promise.all([
    loadCoachLevels(coachId, client),
    loadCoachPhasesV2(coachId, client),
    listMonthTemplates({ coach_id: coachId, client }),
    listCoachSequences(coachId, client),
  ]);

  const microciclos: V2SequenceMicrociclo[] = months.map((m) => ({
    id: m.id,
    name: m.name,
    week_count: m.week_count,
  }));

  const cells: Record<string, V2Sequence> = {};
  for (const s of sequences) {
    // Only surface sequences whose cell coordinate is a valid matrix slot.
    if (!SEQUENCE_DAYS_OPTIONS.includes(s.days_per_week as (typeof SEQUENCE_DAYS_OPTIONS)[number])) {
      continue;
    }
    cells[cellKey(s.level_id, s.days_per_week)] = toV2Sequence(s);
  }

  return { levels, phases, microciclos, cells };
}
