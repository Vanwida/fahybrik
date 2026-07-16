import type { TransactionSql } from 'postgres';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { Block, BlockUpdate, BlockWrite } from '@fahybrid/shared/schema/blocks';
import type { WeekDayPartItem } from '@fahybrid/shared/schema/program-templates';
import {
  prescriptionToParams,
  safeParsePrescription,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';

type AnySql = Sql | TransactionSql<{ readonly bigint: bigint }>;

// Blocks library (Biblioteca de Bloques) — a coach's reusable training blocks
// (migration 0037). One block = one concrete prescription stored verbatim,
// classified into a methodology_group. Feeds the coach catalog + the IA
// day/week composer. The library is PER-COACH content (like microciclos): each
// block belongs to its owning coach (`coach_id`); a brand-new coach starts with
// an empty library and builds their own.

/**
 * Un bloque + su estado ESTRUCTURAL, para las superficies que necesitan saber si
 * el atleta puede ejecutarlo (Biblioteca › Bloques y el rail del editor de día).
 *
 * `typed` es la única señal honesta de "ejecutable": sale de la existencia de
 * `block_exercises`. NO es `needs_review` — son cosas distintas y en los datos
 * reales discrepan (hay bloques marcados para revisar que SÍ están tipados).
 * Un bloque sin tipar solo tiene la prosa verbatim en `description`: se muestra,
 * pero no se puede insertar en un día (se perdería el texto).
 *
 * `part_count` = `block_position` distintos = cuántas piezas inserta el bloque
 * en el día. Un bloque NO es siempre una pieza: los importados del Excel llegan
 * a 6 (p.ej. "10' row z2" = row + ski + bike + run).
 */
export interface BlockWithStructure extends Block {
  typed: boolean;
  exercise_count: number;
  part_count: number;
}

type BlockWithStructureRow = BlockRow & {
  exercise_count: string | number;
  part_count: string | number;
};

/**
 * List a coach's blocks with their structural state, in ONE round-trip.
 * Same ordering/scoping contract as `listBlocks`.
 * @param coachId  owning coach (the current session coach).
 * @param groupId  methodology_group_id (1..10), or null for all groups.
 */
export async function listBlocksWithStructure(
  coachId: number | bigint,
  groupId: number | null = null,
  client: Sql = defaultSql,
): Promise<BlockWithStructure[]> {
  const cid = Number(coachId);
  const rows = await client<BlockWithStructureRow[]>`
    select b.id, b.slug, b.title, b.description, b.methodology_group_id,
           b.format, b.source_ref, b.needs_review,
           count(be.id) as exercise_count,
           count(distinct be.block_position) as part_count
      from blocks b
      left join block_exercises be on be.block_id = b.id
     where b.coach_id = ${cid}
       ${groupId === null ? client`` : client`and b.methodology_group_id = ${groupId}`}
     group by b.id
     order by b.methodology_group_id asc, b.id asc
  `;
  return rows.map((r) => {
    const exercise_count = Number(r.exercise_count);
    return {
      ...mapBlockRow(r),
      typed: exercise_count > 0,
      exercise_count,
      part_count: Number(r.part_count),
    };
  });
}

/**
 * List a coach's blocks, optionally filtered to a single methodology group.
 * @param coachId  owning coach (the current session coach).
 * @param groupId  methodology_group_id (1..10), or null for all groups.
 */
export async function listBlocks(
  coachId: number | bigint,
  groupId: number | null,
  client: Sql = defaultSql,
): Promise<Block[]> {
  const cid = Number(coachId);
  const rows =
    groupId === null
      ? await client<BlockRow[]>`
          select id, slug, title, description, methodology_group_id,
                 format, source_ref, needs_review
          from blocks
          where coach_id = ${cid}
          order by methodology_group_id asc, id asc
        `
      : await client<BlockRow[]>`
          select id, slug, title, description, methodology_group_id,
                 format, source_ref, needs_review
          from blocks
          where coach_id = ${cid}
            and methodology_group_id = ${groupId}
          order by id asc
        `;
  return rows.map(mapBlockRow);
}

type BlockRow = {
  id: number;
  slug: string;
  title: string;
  description: string;
  methodology_group_id: number;
  format: string | null;
  source_ref: string | null;
  needs_review: boolean;
};

function mapBlockRow(r: BlockRow): Block {
  return {
    ...r,
    id: Number(r.id),
    methodology_group_id: Number(r.methodology_group_id),
    needs_review: Boolean(r.needs_review),
  };
}

/** Fila estructurada de `block_exercises` (0038) + nombre del ejercicio (join). */
export type BlockExerciseRow = {
  block_id: string;
  position: number;
  block_position: number;
  exercise_id: string;
  exercise_name: string;
  params_json: Record<string, unknown> | null;
  // Prescripción estructurada por-set (0043). Nullable: bloques antiguos /
  // needs_review no la tienen y el item degrada a params_json.
  prescription_json: unknown;
  notes: string | null;
};

/**
 * Mapeo canónico `block_exercises` → `WeekDayPartItem`. Única fuente de verdad
 * compartida por la hidratación servidor (materializador, `hydrateBlockParts`)
 * y el endpoint `GET /api/coach/blocks/[id]` que el week-studio consume al
 * insertar un bloque de biblioteca. Mantiene el shape idéntico en ambos caminos
 * (uid estable `be-<blockId>-<position>`, exercise_id numérico, params canónicos).
 */
export function blockExerciseToItem(row: BlockExerciseRow): WeekDayPartItem {
  const item: WeekDayPartItem = {
    uid: `be-${Number(row.block_id)}-${row.position}`,
    exercise_id: Number(row.exercise_id),
    exercise_name: row.exercise_name.slice(0, 200),
    params_json: row.params_json ?? {},
    notes: row.notes ?? undefined,
  };
  // Carry the structured per-set prescription forward when the block row has a
  // valid one, so the studio edits structure (not the scalar fallback) for
  // library blocks. Defensive parse: a malformed JSONB is simply dropped.
  if (row.prescription_json != null) {
    const parsed = safeParsePrescription(row.prescription_json);
    if (parsed.success) item.prescription_json = parsed.data as Prescription;
  }
  return item;
}

/**
 * Carga los `block_exercises` estructurados de un bloque de biblioteca y los
 * devuelve como `WeekDayPartItem[]` (orden por `position`). Vacío si el bloque
 * no tiene estructura (needs_review) o no existe. Usa el mapeo compartido para
 * espejar EXACTO lo que el materializador hidrata en `template_segments`.
 */
export async function getBlockExerciseItems(
  blockId: number,
  client: Sql = defaultSql,
): Promise<WeekDayPartItem[]> {
  const rows = await client<BlockExerciseRow[]>`
    select be.block_id::text, be.position, be.block_position,
           be.exercise_id::text, e.name as exercise_name,
           be.params_json, be.prescription_json, be.notes
    from block_exercises be
    join exercises e on e.id = be.exercise_id
    where be.block_id = ${blockId}
    order by be.position
  `;
  return rows.map(blockExerciseToItem);
}

/** Bloque individual por id, propiedad del coach indicado (su biblioteca). */
export async function getBlockById(
  coachId: number | bigint,
  blockId: number,
  client: Sql = defaultSql,
): Promise<Block | null> {
  const rows = await client<BlockRow[]>`
    select id, slug, title, description, methodology_group_id,
           format, source_ref, needs_review
    from blocks
    where id = ${blockId}
      and coach_id = ${Number(coachId)}
    limit 1
  `;
  const r = rows[0];
  if (!r) return null;
  return mapBlockRow(r);
}

/**
 * Fila de ejercicio estructurado para la vista BIBLIOTECA (no el studio). A
 * diferencia de `getBlockExerciseItems` (que mapea a `WeekDayPartItem` para el
 * materializador y pierde `reps_scheme`/`load_pct_range`), aquí conservamos los
 * campos que la biblioteca muestra verbatim: el esquema por-serie de Pablo
 * ("10/10/8/8/6") y el rango de %carga ("65-80"). Solo lectura.
 */
export type BlockLibraryExercise = {
  position: number;
  block_position: number;
  exercise_name: string;
  params_json: Record<string, unknown>;
  reps_scheme: string | null;
  notes: string | null;
};

/** Ejercicios estructurados de un bloque para la biblioteca (orden por position). */
export async function getBlockLibraryExercises(
  blockId: number,
  client: Sql = defaultSql,
): Promise<BlockLibraryExercise[]> {
  const rows = await client<
    Array<{
      position: number;
      block_position: number;
      exercise_name: string;
      params_json: Record<string, unknown> | null;
      reps_scheme: string | null;
      notes: string | null;
    }>
  >`
    select be.position, be.block_position, e.name as exercise_name,
           be.params_json, be.reps_scheme, be.notes
    from block_exercises be
    join exercises e on e.id = be.exercise_id
    where be.block_id = ${blockId}
    order by be.position
  `;
  return rows.map((r) => ({
    position: Number(r.position),
    block_position: Number(r.block_position),
    exercise_name: r.exercise_name,
    params_json: r.params_json ?? {},
    reps_scheme: r.reps_scheme,
    notes: r.notes,
  }));
}

/**
 * Actualiza los campos editables por el coach de un bloque de SU biblioteca
 * (title / description / methodology_group_id / nivel / días). NO toca los
 * `block_exercises` estructurados. Mutar afecta a TODA materialización futura
 * del bloque. Devuelve el bloque actualizado o null si no existe / no es del coach.
 *
 * `patch` ya viene validado por `blockUpdateSchema` (Zod) en la ruta. Construye
 * la lista de SET dinámicamente con tagged templates: cada fragmento es
 * parametrizado, nunca interpolación de strings.
 */
export async function updateBlock(
  coachId: number | bigint,
  blockId: number,
  patch: BlockUpdate,
  client: Sql = defaultSql,
): Promise<Block | null> {
  const assignments = [];
  if (patch.title !== undefined) assignments.push(client`title = ${patch.title}`);
  if (patch.description !== undefined) assignments.push(client`description = ${patch.description}`);
  if (patch.methodology_group_id !== undefined)
    assignments.push(client`methodology_group_id = ${patch.methodology_group_id}`);
  if (patch.min_level_id !== undefined)
    assignments.push(client`min_level_id = ${patch.min_level_id}`);
  if (patch.max_level_id !== undefined)
    assignments.push(client`max_level_id = ${patch.max_level_id}`);
  if (patch.days_per_week !== undefined)
    assignments.push(client`days_per_week = ${patch.days_per_week}`);
  if (assignments.length === 0) return getBlockById(coachId, blockId, client);

  // Une los fragmentos parametrizados con comas, todos como tagged templates.
  const setClause = assignments.reduce((acc, frag, i) =>
    i === 0 ? frag : client`${acc}, ${frag}`,
  );

  const rows = await client<BlockRow[]>`
    update blocks
    set ${setClause}
    where id = ${blockId}
      and coach_id = ${Number(coachId)}
    returning id, slug, title, description, methodology_group_id,
              format, source_ref, needs_review
  `;
  const r = rows[0];
  if (!r) return null;
  return mapBlockRow(r);
}

// ── Full create / replace of a library block + its structured exercises ───────
// A library block is structurally a mini-session: the `blocks` row + a flat list
// of `block_exercises` grouped by `block_position`. Mirrors the create-template +
// insert-segments transaction in templates.ts. prescription_json is the structured
// source of truth; params_json is the re-derived scalar summary (kept in sync the
// same way template_segments do). Library blocks belong to the creating coach.

/**
 * Build a unique, slugSchema-valid slug from a title:
 * lowercase → non-alphanumerics to '-' → collapse/trim '-' → append a base-36
 * timestamp for uniqueness. Falls back to "bloque" when the title has no
 * alphanumerics, so the result always starts with [a-z0-9] (slugSchema rule).
 */
export function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  const stem = base.length > 0 ? base : 'bloque';
  return `${stem}-${Date.now().toString(36)}`;
}

// Insert the flat block_exercises rows for a block. `position` (global order) is
// the array index; block_position / format / title / prescription come per row.
async function insertBlockExercises(
  client: AnySql,
  blockId: number,
  exercises: BlockWrite['exercises'],
): Promise<void> {
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i]!;
    const paramsJson = JSON.parse(
      JSON.stringify(prescriptionToParams(ex.prescription_json as Prescription), (_, v) =>
        typeof v === 'bigint' ? Number(v) : v,
      ),
    );
    const prescriptionJson = client.json(
      JSON.parse(JSON.stringify(ex.prescription_json)) as Parameters<typeof client.json>[0],
    );
    await client`
      insert into block_exercises (
        block_id, position, block_position, exercise_id,
        params_json, prescription_json, block_format, block_title, notes
      )
      values (
        ${blockId},
        ${i},
        ${ex.block_position},
        ${ex.exercise_id},
        ${client.json(paramsJson)},
        ${prescriptionJson},
        ${ex.block_format ?? null},
        ${ex.block_title ?? null},
        ${ex.notes ?? null}
      )
    `;
  }
}

/** Create a library block owned by the given coach + its structured exercises. */
export async function createBlock(
  coachId: number | bigint,
  input: BlockWrite,
  client: Sql = defaultSql,
): Promise<number> {
  let blockId = 0;
  await client.begin(async (tx) => {
    const rows = await tx<Array<{ id: string }>>`
      insert into blocks (
        slug, title, description, methodology_group_id, format,
        needs_review, coach_id
      )
      values (
        ${slugifyTitle(input.title)},
        ${input.title},
        ${input.description ?? input.title},
        ${input.methodology_group_id},
        ${input.format ?? null},
        ${false},
        ${Number(coachId)}
      )
      returning id::text as id
    `;
    blockId = Number(rows[0]!.id);
    await insertBlockExercises(tx, blockId, input.exercises);
  });
  return blockId;
}

/** Row shape for the block EDITOR load — keeps block_position/format/title that
 *  `getBlockExerciseItems` (WeekDayPartItem mapping) drops. Ordered by position. */
export type BlockExerciseEditRow = {
  block_position: number;
  position: number;
  block_format: string | null;
  block_title: string | null;
  exercise_id: string;
  exercise_name: string;
  params_json: Record<string, unknown> | null;
  prescription_json: unknown;
  notes: string | null;
};

export async function getBlockExerciseRowsForEdit(
  blockId: number,
  client: Sql = defaultSql,
): Promise<BlockExerciseEditRow[]> {
  return client<BlockExerciseEditRow[]>`
    select be.block_position, be.position, be.block_format, be.block_title,
           be.exercise_id::text as exercise_id, e.name as exercise_name,
           be.params_json, be.prescription_json, be.notes
    from block_exercises be
    join exercises e on e.id = be.exercise_id
    where be.block_id = ${blockId}
    order by be.position
  `;
}

/** Replace a library block's editable fields AND its structured exercises in one
 *  transaction. Returns the updated block, or null if it doesn't exist / isn't
 *  owned by the given coach. */
export async function updateBlockFull(
  coachId: number | bigint,
  blockId: number,
  input: BlockWrite,
  client: Sql = defaultSql,
): Promise<Block | null> {
  let updated: BlockRow | null = null;
  await client.begin(async (tx) => {
    const rows = await tx<BlockRow[]>`
      update blocks set
        title                = ${input.title},
        description          = ${input.description ?? input.title},
        methodology_group_id = ${input.methodology_group_id},
        format               = ${input.format ?? null},
        needs_review         = ${false}
      where id = ${blockId}
        and coach_id = ${Number(coachId)}
      returning id, slug, title, description, methodology_group_id,
                format, source_ref, needs_review
    `;
    const r = rows[0];
    if (!r) return; // not found → leave updated null; tx commits no-op
    updated = r;
    await tx`delete from block_exercises where block_id = ${blockId}`;
    await insertBlockExercises(tx, blockId, input.exercises);
  });
  return updated ? mapBlockRow(updated) : null;
}

/** Coach's athlete levels (for the block editor's optional level selector). */
export async function listCoachLevels(
  coachId: number | bigint,
  client: Sql = defaultSql,
): Promise<Array<{ id: number; name: string; label: string }>> {
  const rows = await client<Array<{ id: string; name: string; label: string }>>`
    select id::text as id, name, label
    from athlete_levels
    where coach_id = ${Number(coachId)}
    order by sort_order, id
  `;
  return rows.map((r) => ({ id: Number(r.id), name: r.name, label: r.label }));
}
