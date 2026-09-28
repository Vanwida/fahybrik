import 'server-only';

// EL escritor de una plantilla en la base de datos. Todo camino que guarda el
// contenido de un entreno (`template_segments` + `template_blocks` + el reloj sin
// movimientos) pasa por aquí — ver la cabecera de `./template-content.ts` y
// docs/DECISIONS.md (2026-08-11 «no añadir otra ruta que escriba
// template_segments por su cuenta» y 2026-09-28 «un solo escritor»).
//
// Tres pasos, y cada llamador usa los que le tocan:
//   1. `buildTemplateContent` — bloques → filas canónicas, con la modalidad y el
//      nombre del CATÁLOGO de cada ejercicio (mig 0053: la modalidad es del
//      ejercicio, no de quien escribe la prescripción).
//   2. `assertExecutableContent` — el listón mínimo (dosis ejecutable). Lo pasan
//      la biblioteca del coach y el entreno libre que se guarda para hacerlo
//      después. NO un entreno ya hecho: un entreno hecho no se pierde
//      (DECISIONS 2026-09-24).
//   3. `writeTemplateContent` — borra y vuelve a escribir, dentro de la
//      transacción del llamador, y devuelve los segmentos en su orden.

import type { Sql, TransactionClient } from '@/lib/db';
import { canonicalPrescription, type Modality, type Prescription } from '@fahybrid/shared/domain/prescription';
import type { CircuitConfig } from '@fahybrid/shared/schema/program-templates';
import {
  circuitFromColumns,
  circuitToColumns,
  serializeTemplateContent,
  undosedContentLines,
  type TemplateBlockColumns,
  type TemplateContent,
  type TemplateContentBlock,
} from './template-content';

type Client = Sql | TransactionClient;
type JsonParam = Parameters<Sql['json']>[0];

/** Un segmento recién escrito, en el orden de la sesión. */
export interface WrittenSegment {
  id: number;
  position: number;
  block_position: number;
}

/** Lo que el catálogo dice de un ejercicio y el escritor necesita. */
interface ExerciseFacts {
  modality: Modality | null;
  name: string;
}

/** Una plantilla con alguna línea que el atleta no podría ejecutar. */
export class UndosedContentError extends Error {
  constructor(public readonly reasons: string[]) {
    super(
      reasons.length === 1
        ? `Una línea sin dosis: ${reasons[0]}`
        : `${reasons.length} líneas sin dosis. ${reasons.slice(0, 3).join(' · ')}`,
    );
    this.name = 'UndosedContentError';
  }
}

/** JSON plano para una columna jsonb (sin bigint), nunca un string. */
function toJson(value: unknown): JsonParam {
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? Number(v) : v)),
  ) as JsonParam;
}

async function loadExerciseFacts(client: Client, ids: number[]): Promise<Map<number, ExerciseFacts>> {
  if (ids.length === 0) return new Map();
  // tenancy: verified-owner — ids que el llamador ya comprobó visibles para su coach.
  const rows = await client<Array<{ id: string; name: string; modality: string | null }>>`
    select id::text as id, name, modality::text as modality
    from exercises
    where id = any(${ids}::bigint[])
  `;
  return new Map(
    rows.map((r) => [Number(r.id), { name: r.name, modality: (r.modality as Modality | null) ?? null }]),
  );
}

/**
 * Bloques → filas canónicas, con la modalidad y el nombre del catálogo. La
 * visibilidad de cada ejercicio para el coach la decide ANTES el llamador (unos
 * rechazan un id ajeno, otros lo saltan): aquí solo se leen hechos del catálogo.
 */
export async function buildTemplateContent(
  client: Client,
  blocks: readonly TemplateContentBlock[],
): Promise<{ content: TemplateContent; modalityByExercise: Map<number, Modality | null> }> {
  const ids = [
    ...new Set(
      blocks.flatMap((b) => b.items.map((it) => Number(it.exercise_id))).filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  const facts = await loadExerciseFacts(client, ids);
  const withFacts: TemplateContentBlock[] = blocks.map((block) => ({
    ...block,
    items: block.items.map((it) => {
      const known = facts.get(Number(it.exercise_id));
      return {
        ...it,
        exercise_name: it.exercise_name || known?.name || '',
        exercise_modality: known ? known.modality : (it.exercise_modality ?? null),
      };
    }),
  }));
  const modalityByExercise = new Map([...facts].map(([id, f]) => [id, f.modality]));
  return { content: serializeTemplateContent(withFacts), modalityByExercise };
}

/** Los circuitos de una plantilla (`template_blocks`), por `block_position`. */
export async function loadTemplateCircuits(
  client: Client,
  templateId: number,
): Promise<Map<number, CircuitConfig>> {
  // tenancy: verified-owner — la plantilla la resolvió el llamador con su coach.
  const rows = await client<Array<TemplateBlockColumns & { block_position: number }>>`
    select block_position, rounds, pacing, work_seconds,
           rest_between_stations_seconds, rest_between_rounds_seconds
    from template_blocks
    where template_id = ${templateId}
  `;
  return new Map(rows.map((r) => [r.block_position, circuitFromColumns(r)]));
}

/** El listón mínimo: toda línea tipada tiene que poder ejecutarse. */
export function assertExecutableContent(
  content: TemplateContent,
  modalityByExercise: ReadonlyMap<number, Modality | null>,
): void {
  const reasons = undosedContentLines(content, modalityByExercise);
  if (reasons.length > 0) throw new UndosedContentError(reasons);
}

/**
 * Reescribe el contenido de una plantilla: sus segmentos, sus circuitos y el
 * reloj sin movimientos. Corre dentro de la transacción del llamador.
 *
 * EL RELOJ. Un entreno libre de solo cronómetro (un AMRAP de 12′ sin nombrar
 * movimientos) es un bloque sin líneas: no hay ejercicio al que colgar un
 * segmento, e inventar uno metería en la analítica por ejercicio un movimiento
 * que nadie hizo. Su prescripción (formato + estructura) vive en
 * `templates.meta_json.prescription`, y la lee el MISMO cargador que usan la app y
 * el panel del coach (`loadAssignmentDetail` → `clock_prescription`). Solo existe
 * mientras la plantilla no tiene líneas: en cuanto alguien le escribe ejercicios,
 * se retira, para que nunca haya dos descripciones de la misma sesión.
 */
export async function writeTemplateContent(
  client: Client,
  templateId: number,
  content: TemplateContent,
  opts: { clock?: Prescription | null } = {},
): Promise<WrittenSegment[]> {
  // tenancy: verified-owner — el llamador comprobó que la plantilla es de su coach (o del atleta).
  await client`delete from template_segments where template_id = ${templateId}`;
  // tenancy: verified-owner — misma plantilla.
  await client`delete from template_blocks where template_id = ${templateId}`;

  const written: WrittenSegment[] = [];
  for (const seg of content.segments) {
    // tenancy: verified-owner — misma plantilla.
    const rows = await client<Array<{ id: string }>>`
      insert into template_segments (
        template_id, position, block_position, block_title, block_format,
        exercise_id, params_json, notes, prescription_json
      )
      values (
        ${templateId}, ${seg.position}, ${seg.block_position}, ${seg.block_title},
        ${seg.block_format}, ${seg.exercise_id}, ${client.json(toJson(seg.params_json))},
        ${seg.notes}, ${seg.prescription_json ? client.json(toJson(seg.prescription_json)) : null}
      )
      returning id::text as id
    `;
    written.push({ id: Number(rows[0]!.id), position: seg.position, block_position: seg.block_position });
  }

  for (const block of content.blocks) {
    const c = circuitToColumns(block.circuit);
    // tenancy: verified-owner — misma plantilla.
    await client`
      insert into template_blocks (
        template_id, block_position, rounds, pacing, work_seconds,
        rest_between_stations_seconds, rest_between_rounds_seconds
      )
      values (
        ${templateId}, ${block.block_position}, ${c.rounds}, ${c.pacing}, ${c.work_seconds},
        ${c.rest_between_stations_seconds}, ${c.rest_between_rounds_seconds}
      )
    `;
  }

  const clock = content.segments.length === 0 && opts.clock ? canonicalPrescription(opts.clock) : null;
  if (clock) {
    // tenancy: verified-owner — misma plantilla.
    await client`
      update templates
      set meta_json = jsonb_set(
        case when jsonb_typeof(meta_json) = 'object' then meta_json else '{}'::jsonb end,
        '{prescription}', ${client.json(toJson(clock))}
      )
      where id = ${templateId}
    `;
  } else {
    // tenancy: verified-owner — misma plantilla.
    await client`
      update templates set meta_json = meta_json - 'prescription'
      where id = ${templateId}
        and jsonb_typeof(meta_json) = 'object'
        and meta_json ? 'prescription'
    `;
  }

  return written;
}
