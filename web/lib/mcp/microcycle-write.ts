// Composición de receta: las tres puertas del día MCP + serializeDay/upsert.
// Las tools (`tools-microcycle.ts`) son boca fina sobre esto.

import { normalizeFormat } from '@fahybrid/shared/domain/prescription';
import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import type { EditorSessionInput, WeekDay } from '@fahybrid/shared/schema/program-templates';
import type { Sql, TransactionClient } from '@/lib/db';
import {
  ProgramMonthError,
  type MonthTemplateWithWeeksOwned,
} from '@/lib/dashboard/coach/program-months';
import { upsertWeekTemplate } from '@/lib/dashboard/coach/program-weeks';
import {
  mergeDayIntoDays,
  serializeDay,
} from '@/lib/dashboard/v2/editor-serialize';
import {
  ContentError,
  gateContent,
  normalizeContentBlocks,
  resolveContentExercises,
  type ContentBlock,
  type ContentExercise,
  type NormalizedContentBlock,
} from './write-content';

export const WEEKDAY_NAMES = [
  '',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
] as const;

export type WeekInput = {
  focus?: string | undefined;
  days: Array<{ weekday: number; title: string; blocks: ContentBlock[] }>;
};

export type PreparedWeek = {
  focus: string | undefined;
  days: Array<{ weekday: number; title: string; blocks: NormalizedContentBlock[] }>;
};

export type PreparedContent = {
  weeks: PreparedWeek[];
  exercises: Map<number, ContentExercise>;
  avisos: string[];
};

export function itemCount(blocks: ContentBlock[]): number {
  return blocks.reduce((n, b) => n + b.items.length, 0);
}

export function trainingDayCount(weeks: PreparedWeek[]): number {
  return weeks.reduce((n, w) => n + w.days.length, 0);
}

function weekdayLabel(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? `día ${weekday}`;
}

function blockFormatOf(block: NormalizedContentBlock): TemplateFormat {
  if (block.format) return block.format;
  const scheme = block.items[0]?.prescription.scheme;
  return (scheme ? normalizeFormat(scheme) : undefined) ?? 'sets';
}

/**
 * Un día de receta → la sesión que serializa el editor.
 * El título del ENTRENO (`focus`) es el del día, nunca el del primer bloque.
 * Copiar el del bloque fue el apaño que dejó «Fuerza tren superior · Warm up»
 * como nombre de un calentamiento.
 */
export function editorSessionFromContent(params: {
  title: string;
  blocks: NormalizedContentBlock[];
  exercises: Map<number, ContentExercise>;
}): EditorSessionInput {
  const title = params.title.trim();
  return {
    uid: crypto.randomUUID(),
    slot: 'am',
    ...(title ? { focus: title } : {}),
    blocks: params.blocks.map((block) => ({
      uid: crypto.randomUUID(),
      title: block.title,
      format: blockFormatOf(block),
      items: block.items.map((item) => ({
        uid: crypto.randomUUID(),
        exercise_id: item.exercise_id,
        exercise_name: params.exercises.get(item.exercise_id)?.name ?? '',
        prescription: item.prescription,
        ...(item.notes ? { notes: item.notes } : {}),
      })),
    })),
  };
}

/**
 * Las tres puertas de `write-content.ts` sobre TODOS los días, ANTES de escribir.
 * Un blocking en la semana 2 no deja creada la semana 1.
 */
export async function prepareWeeksContent(params: {
  coach_id: bigint;
  weeks: WeekInput[];
}): Promise<{ error: string } | PreparedContent> {
  const { coach_id, weeks } = params;
  const allBlocks = weeks.flatMap((w) => w.days.flatMap((d) => d.blocks));

  let normalized: PreparedWeek[];
  try {
    normalized = weeks.map((week) => ({
      focus: week.focus,
      days: week.days.map((day) => ({
        weekday: day.weekday,
        title: day.title,
        blocks: normalizeContentBlocks(day.blocks),
      })),
    }));
  } catch (err) {
    if (err instanceof ContentError) return { error: err.message };
    throw err;
  }

  if (allBlocks.length === 0) {
    return { weeks: normalized, exercises: new Map(), avisos: [] };
  }

  let exercises: Map<number, ContentExercise>;
  try {
    exercises = await resolveContentExercises({
      coach_id,
      blocks: normalized.flatMap((w) => w.days.flatMap((d) => d.blocks)),
    });
  } catch (err) {
    if (err instanceof ContentError) return { error: err.message };
    throw err;
  }

  const blocking: string[] = [];
  const avisos: string[] = [];
  for (const [i, week] of normalized.entries()) {
    for (const day of week.days) {
      const gate = gateContent(day.blocks, exercises);
      const prefix = `Semana ${i + 1} · ${weekdayLabel(day.weekday)}`;
      for (const reason of gate.blocking) blocking.push(`${prefix}: ${reason}`);
      for (const aviso of gate.avisos) avisos.push(`${prefix}: ${aviso}`);
    }
  }
  if (blocking.length > 0) {
    return {
      error:
        'No he escrito nada: hay líneas que el atleta no podría ejecutar. ' +
        `${blocking.join(' · ')}. Complétalas y vuelve a intentarlo.`,
    };
  }
  return { weeks: normalized, exercises, avisos };
}

export async function persistPreparedWeeks(params: {
  coach_id: number;
  month: MonthTemplateWithWeeksOwned;
  prepared: PreparedContent;
  client: Sql | TransactionClient;
}): Promise<void> {
  const { coach_id, month, prepared, client } = params;
  if (prepared.weeks.length !== month.weeks.length) {
    throw new ProgramMonthError(
      'invalid_payload',
      `Este microciclo tiene ${month.weeks.length} semanas; el JSON trae ${prepared.weeks.length}.`,
      400,
    );
  }

  for (let i = 0; i < prepared.weeks.length; i++) {
    const week = month.weeks[i]!;
    const next = prepared.weeks[i]!;
    let days: WeekDay[] = week.slots_json.days;
    for (const day of next.days) {
      const original: WeekDay =
        days.find((d) => d.day_of_week === day.weekday) ?? {
          day_of_week: day.weekday,
          sessions: [],
        };
      const nextDay = serializeDay({
        day_of_week: day.weekday,
        sessions: [
          editorSessionFromContent({
            title: day.title,
            blocks: day.blocks,
            exercises: prepared.exercises,
          }),
        ],
        original,
      });
      days = mergeDayIntoDays(days, nextDay);
    }
    await upsertWeekTemplate({
      coach_id,
      id: Number(week.id),
      payload: {
        name: week.name,
        focus: next.focus ?? week.focus,
        coach_notes: week.coach_notes,
        slots_json: { days },
      },
      client,
    });
  }
}
