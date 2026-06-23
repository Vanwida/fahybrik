import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type {
  MethodologyPhase,
  MethodologyPhaseEdit,
} from '@fahybrid/shared/schema/methodology-phases';
import type { PhaseRole } from '@fahybrid/shared/schema/_primitives';

// The PHASE RESOLVER (resolvePhase + helpers + ResolvedPhase) lives in the
// client-safe `./resolve-phase` module (NO db import) so the roadmap/macro
// display components can bundle it. Re-exported here so existing server callers
// (`@/lib/dashboard/coach/phases`) keep importing from one place.
export { resolvePhase, indexPhasesById, type ResolvedPhase } from './resolve-phase';
// roleColor/roleBadgeClass live in the client-safe `./phase-roles` ramp (the
// single source of truth shared by the resolver and the editor UI). Re-exported
// here so existing server callers of `@/lib/dashboard/coach/phases` keep working.
export { roleColor, roleBadgeClass } from './phase-roles';

// =============================================================================
// loadCoachPhases — fetch a coach's methodology_phases, ordered.
// Returns [] when the coach has none (e.g. before 0052 is applied), which makes
// resolvePhase fall back to the legacy enum cleanly.
// =============================================================================
type PhaseRow = {
  id: string;
  coach_id: string;
  code: string;
  label: string;
  role: string;
  color: string | null;
  default_weeks: number | null;
  sequence_order: number;
  is_deload: boolean;
  created_at: string;
  updated_at: string;
  description: string | null;
};

function mapPhaseRow(r: PhaseRow): MethodologyPhase {
  return {
    id: Number(r.id),
    coach_id: Number(r.coach_id),
    code: r.code,
    label: r.label,
    role: r.role as PhaseRole,
    color: r.color,
    default_weeks: r.default_weeks,
    sequence_order: r.sequence_order,
    is_deload: r.is_deload,
    description: r.description,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function loadCoachPhases(
  coachId: number | bigint,
  client: Sql = defaultSql,
): Promise<MethodologyPhase[]> {
  // Guard: the table may not exist yet (0052 not applied) — degrade to [] so
  // callers fall back to the legacy enum instead of throwing.
  const exists = await client<{ t: string | null }[]>`
    select to_regclass('public.methodology_phases')::text as t
  `;
  if (!exists[0]?.t) return [];

  const rows = await client<PhaseRow[]>`
    select id, coach_id, code, label, role, color,
           default_weeks, sequence_order, is_deload, description,
           created_at, updated_at
    from methodology_phases
    where coach_id = ${String(coachId)}
    order by sequence_order asc, id asc
  `;
  return rows.map(mapPhaseRow);
}

// =============================================================================
// saveCoachPhases — atomic full-set upsert of a coach's ordered phase set.
//
// The editor sends the WHOLE ordered set (insert + update + delete in one
// gesture). We diff it against the coach's current rows inside ONE transaction:
//   * rows with a matching id (owned by this coach)  -> UPDATE
//   * rows without an id (or an id we don't own)      -> INSERT
//   * existing rows not present in the payload        -> DELETE
// `sequence_order` is DERIVED from array position (1..N) so it's always
// contiguous — the client's order in the array IS the periodization order.
// `code` is generated for new rows (slug(label) + ordinal, de-duped per coach).
// Strictly coach-scoped: every read/write filters by coach_id; an id the coach
// doesn't own is treated as a new insert, never an update of someone else's row.
// =============================================================================
export class SavePhasesError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SavePhasesError';
  }
}

/** Stable per-coach machine code from a label: slug + numeric suffix if taken. */
function slugifyPhaseCode(label: string): string {
  const base = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return base.length > 0 ? base : 'fase';
}

export async function saveCoachPhases(
  coachId: number | bigint,
  phases: ReadonlyArray<MethodologyPhaseEdit>,
  client: Sql = defaultSql,
): Promise<MethodologyPhase[]> {
  if (phases.length === 0) {
    throw new SavePhasesError('empty_set', 'Define al menos una fase.');
  }

  const exists = await client<{ t: string | null }[]>`
    select to_regclass('public.methodology_phases')::text as t
  `;
  if (!exists[0]?.t) {
    throw new SavePhasesError(
      'table_absent',
      'Las fases de periodización aún no están disponibles (migración 0052 sin aplicar).',
    );
  }

  await client.begin(async (tx) => {
    // Current rows for THIS coach (the only ones we may update/delete).
    const current = await tx<{ id: string; code: string }[]>`
      select id::text, code from methodology_phases
      where coach_id = ${String(coachId)}
    `;
    const ownedIds = new Set(current.map((r) => r.id));

    // Park every existing code out of the way (prefix) BEFORE the upsert loop so
    // a reorder/rename that swaps two codes can't transiently violate the
    // UNIQUE(coach_id, code) constraint mid-transaction. We then re-assign final
    // codes per row below. `__tmp_<id>` is collision-free (ids are unique).
    if (current.length > 0) {
      await tx`
        update methodology_phases
        set code = '__tmp_' || id::text
        where coach_id = ${String(coachId)}
      `;
    }
    const keptIds = new Set<string>();
    // Codes already assigned in THIS save pass. After parking (above) no
    // untouched row holds a permanent code, so this set is the ONLY uniqueness
    // pressure: a final code is taken iff another row in this pass already took it.
    const seenCodes = new Set<string>();

    // Reserve a unique-per-coach code: prefer the supplied/persisted one; else
    // slug(label). On collision within this pass, append a numeric suffix.
    const reserveCode = (preferred: string | null | undefined, label: string): string => {
      let candidate = ((preferred ?? '').trim() || slugifyPhaseCode(label)).slice(0, 60);
      if (seenCodes.has(candidate)) {
        const root = candidate.slice(0, 55);
        let n = 1;
        do {
          candidate = `${root}-${n}`;
          n += 1;
        } while (seenCodes.has(candidate));
      }
      seenCodes.add(candidate);
      return candidate;
    };

    for (let i = 0; i < phases.length; i++) {
      const p = phases[i]!;
      const seq = i + 1; // 1-indexed, contiguous by array position.
      const color = p.color ?? null;
      const defaultWeeks = p.default_weeks ?? null;
      const description = p.description ?? null;
      const isDeload = p.is_deload ?? false;

      const targetId = p.id != null ? String(p.id) : null;

      if (targetId && ownedIds.has(targetId)) {
        // UPDATE an existing row this coach owns. Keep its original code unless
        // the client sent a different non-empty one (still de-duped vs this pass).
        const existingCode = current.find((r) => r.id === targetId)!.code;
        const code = reserveCode(p.code ?? existingCode, p.label);
        await tx`
          update methodology_phases set
            code = ${code},
            label = ${p.label},
            role = ${p.role},
            color = ${color},
            default_weeks = ${defaultWeeks},
            sequence_order = ${seq},
            is_deload = ${isDeload},
            description = ${description},
            updated_at = now()
          where id = ${targetId} and coach_id = ${String(coachId)}
        `;
        keptIds.add(targetId);
      } else {
        // INSERT a new row (no id, or an id not owned by this coach).
        const code = reserveCode(p.code, p.label);
        await tx`
          insert into methodology_phases
            (coach_id, code, label, role, color, default_weeks,
             sequence_order, is_deload, description)
          values (
            ${String(coachId)}, ${code}, ${p.label}, ${p.role}, ${color},
            ${defaultWeeks}, ${seq}, ${isDeload}, ${description}
          )
        `;
      }
    }

    // DELETE rows the coach removed (present before, absent now).
    const toDelete = current.filter((r) => !keptIds.has(r.id)).map((r) => r.id);
    if (toDelete.length > 0) {
      await tx`
        delete from methodology_phases
        where coach_id = ${String(coachId)} and id = any(${toDelete}::bigint[])
      `;
    }
  });

  return loadCoachPhases(coachId, client);
}

// =============================================================================
// clearCoachPhases — remove ALL of a coach's phases (the "no uso fases" opt-out).
//
// Phases are OPTIONAL by design: a coach who deletes their last phase is opting
// out, not erroring. saveCoachPhases rejects an empty set (the editor always
// sends ≥1 row), so clearing is its own explicit operation. Strictly coach-scoped.
// Idempotent: returns the row count removed (0 when the table is absent / empty).
// =============================================================================
export async function clearCoachPhases(
  coachId: number | bigint,
  client: Sql = defaultSql,
): Promise<number> {
  const exists = await client<{ t: string | null }[]>`
    select to_regclass('public.methodology_phases')::text as t
  `;
  if (!exists[0]?.t) return 0;

  const deleted = await client<{ id: string }[]>`
    delete from methodology_phases
    where coach_id = ${String(coachId)}
    returning id::text
  `;
  return deleted.length;
}
