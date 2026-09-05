// Portones de contenido y deshacer de una sesión recién creada. Vive aparte
// de `tools-write.ts` para que ese fichero se quede en las tools.

import { sql } from '@/lib/db';
import { TemplateError } from '@/lib/dashboard/coach/templates';
import { InvalidAuthoringLineError } from '@/lib/dashboard/v2/editor-serialize';
import { prescriptionToText, type Prescription } from '@fahybrid/shared/domain/prescription';
import {
  ContentError,
  contentToSegments,
  gateContent,
  normalizeContentBlocks,
  resolveContentExercises,
  type ContentBlock,
  type NormalizedContentBlock,
} from './write-content';

export function itemCount(blocks: ContentBlock[]): number {
  return blocks.reduce((n, b) => n + b.items.length, 0);
}

export async function prepareContent(params: { coach_id: bigint; blocks: ContentBlock[] }): Promise<
  | { error: string }
  | {
      blocks: NormalizedContentBlock[];
      exercises: Awaited<ReturnType<typeof resolveContentExercises>>;
      segments: ReturnType<typeof contentToSegments>;
      avisos: string[];
    }
> {
  let blocks: NormalizedContentBlock[];
  try {
    blocks = normalizeContentBlocks(params.blocks);
  } catch (err) {
    if (err instanceof ContentError) return { error: err.message };
    throw err;
  }

  let exercises: Awaited<ReturnType<typeof resolveContentExercises>>;
  try {
    exercises = await resolveContentExercises({ coach_id: params.coach_id, blocks });
  } catch (err) {
    if (err instanceof ContentError) return { error: err.message };
    throw err;
  }

  const gate = gateContent(blocks, exercises);
  if (gate.blocking.length > 0) {
    return {
      error:
        'No he escrito nada: hay líneas que el atleta no podría ejecutar. ' +
        `${gate.blocking.join(' · ')}. Complétalas y vuelve a intentarlo.`,
    };
  }

  try {
    return {
      blocks,
      exercises,
      segments: contentToSegments(blocks, exercises),
      avisos: gate.avisos,
    };
  } catch (err) {
    if (err instanceof InvalidAuthoringLineError || err instanceof ContentError) {
      return { error: err.message };
    }
    throw err;
  }
}

export function contentWriteError(err: unknown): string | null {
  if (err instanceof InvalidAuthoringLineError) return err.message;
  if (err instanceof TemplateError) return err.message;
  if (err instanceof ContentError) return err.message;
  return null;
}

export async function rollbackCreatedSession(params: {
  coach_id: bigint;
  athlete_id: number;
  assignment_id: number;
  template_id: number;
}): Promise<void> {
  await sql`
    delete from workout_assignments
    where id = ${params.assignment_id} and athlete_id = ${params.athlete_id}
  `;
  await sql`
    delete from templates
    where id = ${params.template_id}
      and coach_id = ${Number(params.coach_id)}
      and instance_athlete_id = ${params.athlete_id}
  `;
}

export function snapshotBlocks(
  blocks: Array<{
    title: string;
    format: string | null;
    items: Array<{
      exercise_id: number | null;
      exercise_name: string;
      prescription: Prescription;
      notes?: string | undefined;
    }>;
  }>,
): Array<Record<string, unknown>> {
  return blocks.map((block) => ({
    title: block.title,
    format: block.format,
    items: block.items.map((item) => ({
      exercise_id: item.exercise_id,
      exercise_name: item.exercise_name,
      prescription: item.prescription,
      dose: prescriptionToText(item.prescription).trim() || null,
      ...(item.notes ? { notes: item.notes } : {}),
    })),
  }));
}
