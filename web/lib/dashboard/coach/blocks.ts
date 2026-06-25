import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { Block, BlockUpdate } from '@fahybrid/shared/schema/blocks';
import type { WeekDayPartItem } from '@fahybrid/shared/schema/program-templates';
import { safeParsePrescription, type Prescription } from '@fahybrid/shared/domain/prescription';

// Blocks library (Biblioteca de Bloques) — Pablo's reusable training blocks
// (migration 0037). One block = one concrete prescription stored verbatim,
// classified into a methodology_group. Feeds the coach catalog + the IA
// day/week composer. coach_id is NULL = Pablo's global library (single-coach).

/**
 * List blocks, optionally filtered to a single methodology group.
 * @param groupId  methodology_group_id (1..10), or null for all groups.
 */
export async function listBlocks(
  groupId: number | null,
  client: Sql = defaultSql,
): Promise<Block[]> {
  const rows =
    groupId === null
      ? await client<BlockRow[]>`
          select id, slug, title, description, methodology_group_id,
                 format, source_ref, needs_review
          from blocks
          where coach_id is null
          order by methodology_group_id asc, id asc
        `
      : await client<BlockRow[]>`
          select id, slug, title, description, methodology_group_id,
                 format, source_ref, needs_review
          from blocks
          where coach_id is null
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

/** Bloque individual por id (biblioteca global de Pablo, coach_id null). */
export async function getBlockById(
  blockId: number,
  client: Sql = defaultSql,
): Promise<Block | null> {
  const rows = await client<BlockRow[]>`
    select id, slug, title, description, methodology_group_id,
           format, source_ref, needs_review
    from blocks
    where id = ${blockId}
      and coach_id is null
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
 * Actualiza los campos editables por el coach de un bloque de la biblioteca
 * maestra (title / description / methodology_group_id / nivel / días). NO toca
 * los `block_exercises` estructurados. Mutar afecta a TODA materialización futura
 * del bloque. Devuelve el bloque actualizado o null si no existe (coach_id null).
 *
 * `patch` ya viene validado por `blockUpdateSchema` (Zod) en la ruta. Construye
 * la lista de SET dinámicamente con tagged templates: cada fragmento es
 * parametrizado, nunca interpolación de strings.
 */
export async function updateBlock(
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
  if (assignments.length === 0) return getBlockById(blockId, client);

  // Une los fragmentos parametrizados con comas, todos como tagged templates.
  const setClause = assignments.reduce((acc, frag, i) =>
    i === 0 ? frag : client`${acc}, ${frag}`,
  );

  const rows = await client<BlockRow[]>`
    update blocks
    set ${setClause}
    where id = ${blockId}
      and coach_id is null
    returning id, slug, title, description, methodology_group_id,
              format, source_ref, needs_review
  `;
  const r = rows[0];
  if (!r) return null;
  return mapBlockRow(r);
}
