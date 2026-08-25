import type { Sql } from '@/lib/db';
import { sql as defaultSql, withOwnOrAmbientTx } from '@/lib/db';
import type {
  ProgramSequence,
  ProgramSequenceItem,
  ProgramSequenceSave,
} from '@fahybrid/shared/schema/program-sequences';
import { cloneMonthTemplateDeep } from '@fahybrid/shared/domain/coach/program-months';

// =============================================================================
// Program sequences server core (migration 0059).
//
// A "Secuencia" = one matrix cell (coach × athlete_level × days_per_week): an
// ORDERED list of microciclos (program_month_templates) + an end-policy + a
// per-loop progression rule. This module is the single source of truth for
// reading the matrix and atomically saving one cell, modelled on the
// phases.ts atomic-save pattern (whole ordered set diffed in ONE transaction).
//
// Strictly coach-scoped: every read/write filters by coach_id from the session.
// =============================================================================

export class SaveSequenceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SaveSequenceError';
  }
}

// ---------------------------------------------------------------------------
// Row shapes returned by the DB.
// ---------------------------------------------------------------------------
type SequenceRow = {
  id: string;
  coach_id: string;
  level_id: string;
  days_per_week: number;
  end_policy: string;
  progression_pct: string | number | null;
  progression_applies_to: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  sequence_id: string;
  position: number;
  month_template_id: string;
};

function mapItemRow(r: ItemRow): ProgramSequenceItem {
  return {
    id: Number(r.id),
    sequence_id: Number(r.sequence_id),
    position: r.position,
    month_template_id: Number(r.month_template_id),
  };
}

function mapSequenceRow(r: SequenceRow, items: ProgramSequenceItem[]): ProgramSequence {
  return {
    id: Number(r.id),
    coach_id: Number(r.coach_id),
    level_id: Number(r.level_id),
    days_per_week: r.days_per_week,
    end_policy: r.end_policy as ProgramSequence['end_policy'],
    progression_pct: r.progression_pct == null ? null : Number(r.progression_pct),
    progression_applies_to:
      r.progression_applies_to as ProgramSequence['progression_applies_to'],
    created_at: r.created_at,
    updated_at: r.updated_at,
    items,
  };
}

// Guard: the tables may not exist yet (0059 not applied). Degrade gracefully.
async function tablesExist(client: Sql): Promise<boolean> {
  const exists = await client<{ t: string | null }[]>`
    select to_regclass('public.program_sequences')::text as t
  `;
  return Boolean(exists[0]?.t);
}

// =============================================================================
// listCoachSequences — every sequence (+ ordered items) of a coach, for the
// matrix view. Returns [] when the tables are absent or the coach has none.
// =============================================================================
export async function listCoachSequences(
  coachId: number | bigint,
  client: Sql = defaultSql,
): Promise<ProgramSequence[]> {
  if (!(await tablesExist(client))) return [];

  const seqRows = await client<SequenceRow[]>`
    select id::text, coach_id::text, level_id::text, days_per_week,
           end_policy, progression_pct, progression_applies_to,
           created_at, updated_at
    from program_sequences
    where coach_id = ${String(coachId)}
    order by level_id asc, days_per_week asc
  `;
  if (seqRows.length === 0) return [];

  const seqIds = seqRows.map((r) => r.id);
  const itemRows = await client<ItemRow[]>`
    select id::text, sequence_id::text, position,
           month_template_id::text
    from program_sequence_items
    where sequence_id = any(${seqIds}::bigint[])
    order by sequence_id asc, position asc
  `;

  const itemsBySeq = new Map<string, ProgramSequenceItem[]>();
  for (const row of itemRows) {
    const list = itemsBySeq.get(row.sequence_id) ?? [];
    list.push(mapItemRow(row));
    itemsBySeq.set(row.sequence_id, list);
  }

  return seqRows.map((r) => mapSequenceRow(r, itemsBySeq.get(r.id) ?? []));
}

// =============================================================================
// getCoachSequenceCell — one matrix cell (coach × level × days) + ordered items.
// Returns null when the cell has no sequence yet (or the tables are absent).
// =============================================================================
export async function getCoachSequenceCell(
  coachId: number | bigint,
  levelId: number | bigint,
  daysPerWeek: number,
  client: Sql = defaultSql,
): Promise<ProgramSequence | null> {
  if (!(await tablesExist(client))) return null;

  const seqRows = await client<SequenceRow[]>`
    select id::text, coach_id::text, level_id::text, days_per_week,
           end_policy, progression_pct, progression_applies_to,
           created_at, updated_at
    from program_sequences
    where coach_id = ${String(coachId)}
      and level_id = ${String(levelId)}
      and days_per_week = ${daysPerWeek}
    limit 1
  `;
  const seq = seqRows[0];
  if (!seq) return null;

  const itemRows = await client<ItemRow[]>`
    select id::text, sequence_id::text, position,
           month_template_id::text
    from program_sequence_items
    where sequence_id = ${seq.id}
    order by position asc
  `;
  return mapSequenceRow(seq, itemRows.map(mapItemRow));
}

// =============================================================================
// saveCoachSequence — atomic full-set upsert of ONE matrix cell.
//
// The editor sends the WHOLE ordered item set + policy for a (level, days) cell.
// In ONE transaction we:
//   * upsert the program_sequences row for the cell (insert if new, update policy
//     + progression if it exists);
//   * replace its items wholesale, deriving `position` (1..N) from array order.
// Items are replaced rather than diffed because they carry no client-stable id
// (an item is just position → microciclo); a wholesale replace inside the txn is
// the simplest correct model and avoids transient UNIQUE(sequence_id, position)
// violations on reorder.
//
// Validates that every referenced month_template_id is OWNED by this
// coach before writing (no cross-coach references). Strictly coach-scoped.
// =============================================================================
export async function saveCoachSequence(
  coachId: number | bigint,
  payload: ProgramSequenceSave,
  client: Sql = defaultSql,
): Promise<ProgramSequence> {
  if (!(await tablesExist(client))) {
    throw new SaveSequenceError(
      'table_absent',
      'Las secuencias aún no están disponibles (migración 0059 sin aplicar).',
    );
  }

  const coach = String(coachId);
  const levelId = String(payload.level_id);
  const progressionPct = payload.progression_pct ?? null;
  const progressionAppliesTo = payload.progression_applies_to ?? null;

  // Ownership guard: the level must belong to this coach.
  const ownedLevel = await client<{ id: string }[]>`
    select id::text from athlete_levels
    where id = ${levelId} and coach_id = ${coach}
    limit 1
  `;
  if (!ownedLevel[0]) {
    throw new SaveSequenceError('invalid_level', 'El nivel no pertenece a este coach.');
  }

  // Ownership guard: every microciclo (month_template) referenced must belong to
  // this coach AND be a LIBRARY microciclo (athlete_id is null, 0164). A sequence
  // is the shared level×días matrix — wiring a personal plan into it would leak
  // one athlete's bespoke content into the periodization every athlete on that
  // cell receives, which is exactly the failure mode this system exists to avoid.
  // De-dupe before checking.
  const monthIds = [...new Set(payload.items.map((it) => String(it.month_template_id)))];
  if (monthIds.length > 0) {
    const ownedMonths = await client<{ id: string }[]>`
      select id::text from program_month_templates
      where coach_id = ${coach} and athlete_id is null and id = any(${monthIds}::bigint[])
    `;
    const ownedSet = new Set(ownedMonths.map((r) => r.id));
    const missing = monthIds.filter((id) => !ownedSet.has(id));
    if (missing.length > 0) {
      throw new SaveSequenceError(
        'invalid_month_template',
        `Microciclo(s) no encontrados, no pertenecen al coach, o son un plan personal: ${missing.join(', ')}.`,
      );
    }
  }

  await withOwnOrAmbientTx(client, async (tx) => {
    // Upsert the cell. The unique (coach_id, level_id, days_per_week) lets us
    // INSERT ... ON CONFLICT update the policy/progression in place.
    const seqRows = await tx<{ id: string }[]>`
      insert into program_sequences
        (coach_id, level_id, days_per_week, end_policy,
         progression_pct, progression_applies_to)
      values (
        ${coach}, ${levelId}, ${payload.days_per_week}, ${payload.end_policy},
        ${progressionPct}, ${progressionAppliesTo}
      )
      on conflict (coach_id, level_id, days_per_week) do update set
        end_policy = excluded.end_policy,
        progression_pct = excluded.progression_pct,
        progression_applies_to = excluded.progression_applies_to,
        updated_at = now()
      returning id::text
    `;
    const sequenceId = seqRows[0]!.id;

    // Replace items wholesale, deriving contiguous 1..N positions from order.
    await tx`delete from program_sequence_items where sequence_id = ${sequenceId}`;
    for (let i = 0; i < payload.items.length; i++) {
      const item = payload.items[i]!;
      await tx`
        insert into program_sequence_items
          (sequence_id, position, month_template_id)
        values (
          ${sequenceId}, ${i + 1},
          ${String(item.month_template_id)}
        )
      `;
    }
  });

  const saved = await getCoachSequenceCell(
    coachId,
    payload.level_id as number | bigint,
    payload.days_per_week,
    client,
  );
  // Non-null by construction (we just upserted it).
  return saved!;
}

// =============================================================================
// duplicateSequenceCell — copy a WHOLE matrix cell into another (level × days).
//
// The coach flow: "I have Nivel 3 · 5 días done; build Nivel 3 · 6 días FROM it."
// In ONE transaction we DEEP-CLONE every microciclo of the source cell (each with
// its own independent weeks/slots_json — see cloneMonthTemplateDeep), RETARGET the
// clones to the destination level, upsert the target cell's program_sequences row
// (copying the source's end_policy + progression config), and write the clones as
// the target cell's ordered items (positions 1..N in source order).
//
// V1 guard: the target cell must be EMPTY or nonexistent (no merge semantics) — a
// filled target is rejected honestly. Editing the copy afterwards never touches the
// original because every microciclo/week is a fresh row. Strictly coach-scoped.
// =============================================================================
export async function duplicateSequenceCell(
  coachId: number | bigint,
  source: { level_id: number | bigint; days_per_week: number },
  target: { level_id: number | bigint; days_per_week: number },
  client: Sql = defaultSql,
): Promise<ProgramSequence> {
  if (!(await tablesExist(client))) {
    throw new SaveSequenceError(
      'table_absent',
      'Las secuencias aún no están disponibles (migración 0059 sin aplicar).',
    );
  }
  const coach = String(coachId);

  // Source cell must exist, be owned by this coach, and carry ≥1 microciclo.
  const src = await getCoachSequenceCell(coachId, source.level_id, source.days_per_week, client);
  if (!src || src.items.length === 0) {
    throw new SaveSequenceError(
      'source_empty',
      'La secuencia de origen no tiene microciclos que copiar.',
    );
  }

  // Target level must belong to this coach (also gives us its name for the guard).
  const targetLevelId = String(target.level_id);
  const ownedLevel = await client<{ id: string; name: string }[]>`
    select id::text, name from athlete_levels
    where id = ${targetLevelId} and coach_id = ${coach}
    limit 1
  `;
  if (!ownedLevel[0]) {
    throw new SaveSequenceError('invalid_level', 'El nivel de destino no pertenece a este coach.');
  }

  // V1 guard: never merge into a filled cell — self-copy (same coordinate) is
  // rejected here too, since the source cell has items.
  const targetExisting = await getCoachSequenceCell(
    coachId,
    target.level_id,
    target.days_per_week,
    client,
  );
  if (targetExisting && targetExisting.items.length > 0) {
    throw new SaveSequenceError(
      'target_occupied',
      `${ownedLevel[0].name} · ${target.days_per_week} días ya tiene contenido.`,
    );
  }

  await withOwnOrAmbientTx(client, async (tx) => {
    // Deep-clone each source microciclo, retargeted to the destination level,
    // preserving order. Each clone owns its weeks/slots_json (never a shared ref).
    const clonedMonthIds: string[] = [];
    for (const item of src.items) {
      const newMonthId = await cloneMonthTemplateDeep({
        tx: tx as unknown as Parameters<typeof cloneMonthTemplateDeep>[0]['tx'],
        coach_id: coachId,
        source_month_id: item.month_template_id,
        nameSuffix: ' (copia)',
        levelIdOverride: target.level_id,
      });
      clonedMonthIds.push(newMonthId);
    }

    // Upsert the target cell, copying the source cell's end/progression config.
    const seqRows = await tx<{ id: string }[]>`
      insert into program_sequences
        (coach_id, level_id, days_per_week, end_policy,
         progression_pct, progression_applies_to)
      values (
        ${coach}, ${targetLevelId}, ${target.days_per_week}, ${src.end_policy},
        ${src.progression_pct}, ${src.progression_applies_to}
      )
      on conflict (coach_id, level_id, days_per_week) do update set
        end_policy = excluded.end_policy,
        progression_pct = excluded.progression_pct,
        progression_applies_to = excluded.progression_applies_to,
        updated_at = now()
      returning id::text
    `;
    const sequenceId = seqRows[0]!.id;

    // Target was empty/nonexistent (guarded) — clear any 0-item remnant, then
    // append the clones in order (contiguous positions 1..N).
    await tx`delete from program_sequence_items where sequence_id = ${sequenceId}`;
    for (let i = 0; i < clonedMonthIds.length; i++) {
      await tx`
        insert into program_sequence_items (sequence_id, position, month_template_id)
        values (${sequenceId}, ${i + 1}, ${clonedMonthIds[i]!})
      `;
    }
  });

  const saved = await getCoachSequenceCell(
    coachId,
    target.level_id,
    target.days_per_week,
    client,
  );
  // Non-null by construction (we just upserted it).
  return saved!;
}
