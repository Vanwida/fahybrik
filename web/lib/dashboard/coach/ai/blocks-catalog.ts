import 'server-only';

import type { Sql } from '@/lib/db';
import { joinCoachOverride } from '@/lib/exercises/coach-override';
import type { BlockUseModifiers } from '@fahybrid/shared/schema/program-templates';
import {
  checkPrescriptionCompleteness,
  isExecutable,
  safeParsePrescription,
} from '@fahybrid/shared/domain/prescription';
import type { LibraryBlockExercise } from '@/lib/dashboard/programming/block-to-part';
import type { GroupSlug } from './focus-constraints';
import type { UntypedGroupSummary } from './week-notices';

/**
 * La BIBLIOTECA del coach cargada para componer: sus bloques + la taxonomía de
 * grupos. Aquí solo se LEE y se CLASIFICA; quién va qué día lo deciden los
 * composers.
 *
 * Extraído de `suggest-week-from-blocks.ts` (que pasaba de 500 líneas) para que
 * cada pieza tenga un dueño: cargar/clasificar aquí, componer allí.
 */

// ---------------------------------------------------------------------------
// Methodology groups — la taxonomía vive en la DB, no en el código
// ---------------------------------------------------------------------------

/**
 * Un grupo metodológico (mig 0030). `slug` es su identidad estable; `name_es` es
 * lo que ve el coach.
 *
 * OJO: los nombres NO se hardcodean. Había un `GROUP_NAMES_ES` copiado a mano en
 * el composer que duplicaba esta tabla — si el coach renombra un grupo, el prompt
 * y los avisos seguirían diciendo el nombre viejo. Se lee de la DB y punto.
 */
export interface MethodologyGroup {
  id: number;
  slug: string;
  name_es: string;
}

export async function loadMethodologyGroups(client: Sql): Promise<MethodologyGroup[]> {
  const rows = await client<Array<{ id: number; slug: string; name_es: string }>>`
    select id, slug, name_es from methodology_groups order by sort_order asc, id asc
  `;
  return rows.map((r) => ({ id: Number(r.id), slug: r.slug, name_es: r.name_es }));
}

/** Slugs pedidos en el foco → ids reales. Un slug desconocido se ignora. */
export function resolveGroupIds(groups: MethodologyGroup[], slugs: readonly GroupSlug[]): number[] {
  const idBySlug = new Map(groups.map((g) => [g.slug, g.id]));
  const out: number[] = [];
  for (const s of slugs) {
    const id = idBySlug.get(s);
    if (id != null && !out.includes(id)) out.push(id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Composable blocks
// ---------------------------------------------------------------------------

/**
 * Bloque cargado para composición. Superset del shape mínimo que necesita
 * `createPartFromLibraryBlock` (id/title/description/format) más la metadata de
 * clasificación (grupo) y los modificadores por defecto.
 */
export interface ComposableBlock {
  id: number;
  slug: string;
  title: string;
  description: string;
  methodology_group_id: number;
  format: string | null;
  source_ref: string | null;
  default_modifiers: BlockUseModifiers | null;
  /** The block's own exercises + their typed dose (`block_exercises`). */
  exercises: LibraryBlockExercise[];
}

export async function loadComposableBlocks(
  coachId: number | bigint,
  client: Sql,
): Promise<ComposableBlock[]> {
  const rows = await client<
    Array<{
      id: number;
      slug: string;
      title: string;
      description: string;
      methodology_group_id: number;
      format: string | null;
      source_ref: string | null;
      default_modifiers: BlockUseModifiers | null;
    }>
  >`
    select id, slug, title, description, methodology_group_id,
           format, source_ref, default_modifiers
    from blocks
    where coach_id = ${Number(coachId)}
    order by methodology_group_id asc, id asc
  `;
  if (rows.length === 0) return [];

  // The block's REAL dose. This loader used to skip `block_exercises` entirely
  // while the comment claimed it only handled "bloques desglosables", so every
  // block materialised as `items: []` with the prescription stranded in
  // `coach_note` — Pablo's whole method arriving as dead text. One extra query
  // for the lot; blocks are ~100 per coach.
  //
  // The name is the coach's (mig 0132): they compose the week reading THEIR
  // vocabulary, so a base exercise they renamed must show up renamed here too.
  // The override join is a LEFT JOIN and only changes the label — never which
  // rows come back. No visibility predicate: `be.exercise_id` already arrives
  // from a block scoped by `b.coach_id`, and filtering here would make assigned
  // work vanish.
  const exRows = await client<
    Array<{
      block_id: number;
      exercise_id: number;
      exercise_name: string;
      prescription_json: unknown;
      params_json: Record<string, unknown> | null;
      notes: string | null;
    }>
  >`
    select be.block_id,
           be.exercise_id,
           coalesce(ceo.name, e.name) as exercise_name,
           be.prescription_json,
           be.params_json,
           be.notes
    from block_exercises be
    join blocks b on b.id = be.block_id
    join exercises e on e.id = be.exercise_id
    ${joinCoachOverride(client, BigInt(coachId))}
    where b.coach_id = ${Number(coachId)}
    order by be.block_id asc, be.block_position asc, be.position asc
  `;

  const byBlock = new Map<number, LibraryBlockExercise[]>();
  for (const r of exRows) {
    const list = byBlock.get(Number(r.block_id)) ?? [];
    list.push({
      exercise_id: Number(r.exercise_id),
      exercise_name: r.exercise_name,
      prescription_json: r.prescription_json,
      params_json: r.params_json,
      notes: r.notes,
    });
    byBlock.set(Number(r.block_id), list);
  }

  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    methodology_group_id: Number(r.methodology_group_id),
    exercises: byBlock.get(Number(r.id)) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Clasificación — qué se puede usar y qué no
// ---------------------------------------------------------------------------

/**
 * ¿Tiene este bloque contenido TIPADO que insertar?
 *
 * Un bloque sin `block_exercises` es solo prosa: su texto vive en la descripción
 * y no hay ni un ejercicio, ni una dosis, ni nada que el atleta pueda ejecutar en
 * la app ni que las analíticas puedan medir. Insertarlo produce un día que
 * PARECE lleno y está vacío — la mentira más cara que hay aquí, porque pasa el
 * gate de revisión sin una sola marca (sin items no hay nada que marcar).
 *
 * Caso real: de los 99 bloques de Pablo, 27 son prosa — y entre ellos SUS 14
 * simulaciones HYROX y sus 9 WODs. O sea que "enfocado en HYROX" es literalmente
 * inservible desde su biblioteca hoy. La respuesta correcta no es rellenar el
 * hueco con otra cosa y callar: es no usarlos y DECÍRSELO (ver `week-notices`).
 */
export function blockIsTyped(b: ComposableBlock): boolean {
  return b.exercises.length > 0;
}

/**
 * ¿Puede el coach CONFIRMAR una semana que use este bloque?
 *
 * De los 99 bloques de Pablo, 29 tienen ejercicios sin dosis ninguna: su
 * taquigrafía ("Strict shoulder press 4r" dice 4 series y nunca las reps, que se
 * las dice al atleta en el gym). El gate del importador BLOQUEA un item sin
 * dosis — con razón: nadie ejecuta una cantidad de trabajo sin especificar. Pero
 * si el reparto cae en ellos, la semana sale roja y no la puede confirmar.
 *
 * Así que entre SUS bloques preferimos los que sí puede shipear. No se impone
 * nada ni se inventa nada: mismo método, mismos grupos, mismo equilibrio — solo
 * se ordena. Los 29 siguen disponibles si su grupo no tiene alternativa (mejor su
 * bloque marcado que un hueco).
 *
 * Usa el gate real (`checkPrescriptionCompleteness`), no una heurística paralela:
 * si el listón cambia, esto lo sigue solo.
 */
export function blockIsConfirmable(b: ComposableBlock): boolean {
  return b.exercises.every((ex) => {
    const parsed = safeParsePrescription(ex.prescription_json);
    if (!parsed.success) return false;
    const check = checkPrescriptionCompleteness(parsed.data, {
      modality: parsed.data.modality ?? null,
    });
    return isExecutable(check);
  });
}

/**
 * Los bloques sin tipar, agrupados y con el nombre REAL de su grupo, marcando
 * cuáles caen en lo que el coach pidió. Es la materia prima del aviso honesto.
 */
export function summarizeUntypedGroups(params: {
  blocks: readonly ComposableBlock[];
  groups: readonly MethodologyGroup[];
  requested_group_ids: readonly number[];
}): UntypedGroupSummary[] {
  const nameById = new Map(params.groups.map((g) => [g.id, g.name_es]));
  const requested = new Set(params.requested_group_ids);

  const countByGroup = new Map<number, number>();
  for (const b of params.blocks) {
    if (blockIsTyped(b)) continue;
    countByGroup.set(b.methodology_group_id, (countByGroup.get(b.methodology_group_id) ?? 0) + 1);
  }

  return [...countByGroup.entries()]
    // Lo que el coach pidió va primero: es lo que le duele.
    .sort((a, b) => {
      const ra = requested.has(a[0]) ? 0 : 1;
      const rb = requested.has(b[0]) ? 0 : 1;
      return ra !== rb ? ra - rb : b[1] - a[1];
    })
    .map(([gid, count]) => ({
      name: nameById.get(gid) ?? `Grupo ${gid}`,
      count,
      requested: requested.has(gid),
    }));
}
