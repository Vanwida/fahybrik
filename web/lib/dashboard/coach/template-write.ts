import 'server-only';

// El contenido de un entreno de la biblioteca o de un día del atleta que manda el
// panel (o el conector), por el escritor ÚNICO de plantillas
// (`@/lib/templates/template-content-db`, docs/DECISIONS.md 2026-09-28).

import type { TransactionSql } from 'postgres';
import type { CircuitConfig } from '@fahybrid/shared/schema/program-templates';
import type { Sql } from '@/lib/db';
import { invisibleExerciseIds } from '@/lib/exercises/coach-override';
import {
  blocksFromRows,
  InvalidAuthoringLineError,
  undosedContentLines,
} from '@/lib/templates/template-content';
import {
  buildTemplateContent,
  UndosedContentError,
  writeTemplateContent,
} from '@/lib/templates/template-content-db';
import { TemplateError } from './template-error';
import type { TemplateSegmentInput } from './templates';

type AnySql = Sql | TransactionSql<{ readonly bigint: bigint }>;

/**
 * Los ejercicios tienen que ser visibles para este coach, el contenido se VUELVE
 * a serializar en el servidor (las reglas no dependen de que el cliente esté al
 * día), toda línea tipada tiene que poder ejecutarse, y solo entonces se
 * reescribe. Todo antes de borrar nada: un cuerpo inválido deja la plantilla
 * intacta.
 */
export async function writeTemplatePayload(
  tx: AnySql,
  coach_id: number | bigint,
  template_id: number,
  segments: TemplateSegmentInput[],
  blocks: Array<{ block_position: number; circuit: CircuitConfig }>,
  opts: { fresh?: boolean } = {},
): Promise<void> {
  if (segments.length > 0) await assertSegmentExercisesVisible(tx, coach_id, segments);
  let built: Awaited<ReturnType<typeof buildTemplateContent>>;
  try {
    built = await buildTemplateContent(
      tx,
      blocksFromRows(
        segments.map((s) => ({ ...s, params_json: s.params_json as Record<string, unknown> })),
        blocks,
      ),
    );
  } catch (err) {
    if (err instanceof InvalidAuthoringLineError) throw new TemplateError('invalid_line', err.message, 400);
    throw err;
  }
  const undosed = undosedContentLines(built.content, built.modalityByExercise);
  if (undosed.length > 0) {
    throw new TemplateError('undosed_line', new UndosedContentError(undosed).message, 422);
  }
  await writeTemplateContent(tx, template_id, built.content, { fresh: opts.fresh === true });
}

/**
 * Gate for CLIENT-supplied segment exercise ids (same rule as the import
 * confirm): every one must be visible to this coach — base catalog or their own
 * PROPIO, never another coach's. Nonexistent and foreign are the SAME rejection.
 */
async function assertSegmentExercisesVisible(
  client: AnySql,
  coach_id: number | bigint,
  segments: TemplateSegmentInput[],
): Promise<void> {
  const missing = await invisibleExerciseIds(
    client,
    coach_id,
    segments.map((s) => s.exercise_id),
  );
  if (missing.length > 0) {
    throw new TemplateError(
      'invalid_exercise',
      missing.length === 1
        ? '1 ejercicio no existe o no es tuyo.'
        : `${missing.length} ejercicios no existen o no son tuyos.`,
      404,
    );
  }
}
