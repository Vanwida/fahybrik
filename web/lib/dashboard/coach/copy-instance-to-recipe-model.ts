import { parseIsoDate } from '@fahybrid/shared/domain/dates';
import { prescriptionSchema, type Prescription } from '@fahybrid/shared/domain/prescription';
import {
  circuitConfigSchema,
  type CircuitConfig,
  type WeekDayPart,
} from '@fahybrid/shared/schema/program-templates';
import { templateFormat } from '@fahybrid/shared/schema/_primitives';

const WEEKDAYS_ES = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

export type RecipeTarget =
  | { kind: 'library_template'; id: number; name: string }
  | {
      kind: 'week_session';
      id: number;
      name: string;
      day_of_week: number;
      day_label: string;
      session_index: number;
    };

export type RecipePromotePreview = {
  target: RecipeTarget;
  other_athletes: number;
};

export type InstanceBlockRow = {
  block_position: number;
  block_title: string | null;
  block_format: string | null;
  coach_note?: string | null;
  items: Array<{
    id: string;
    position: number;
    exercise_id: number;
    exercise_name: string;
    params_json: Record<string, unknown>;
    prescription_json: Prescription | null;
    notes: string | null;
  }>;
};

export function sessionIndexInDay(
  templateIdsInDateOrder: readonly number[],
  targetId: number,
): number {
  const i = templateIdsInDateOrder.indexOf(targetId);
  return i < 0 ? 0 : i;
}

export function dayOfWeekFromIso(isoDate: string): number {
  const d = parseIsoDate(isoDate);
  return d.getUTCDay() === 0 ? 7 : d.getUTCDay();
}

export function weekdayLabelEs(dayOfWeek: number): string {
  return WEEKDAYS_ES[dayOfWeek - 1] ?? `Día ${dayOfWeek}`;
}

export function instanceBlocksToWeekParts(
  blocks: InstanceBlockRow[],
  fallbackFormat: string,
  circuitsByPosition: ReadonlyMap<number, CircuitConfig>,
): WeekDayPart[] {
  return blocks.map((block) => {
    const format = asTemplateFormat(block.block_format, fallbackFormat);
    const title = (block.block_title ?? '').trim() || `Bloque ${block.block_position + 1}`;
    const circuit = circuitsByPosition.get(block.block_position);
    const part: WeekDayPart = {
      uid: `promote-b-${block.block_position}`,
      format,
      title: title.slice(0, 120),
      items: block.items.map((it) => {
        const item: WeekDayPart['items'][number] = {
          uid: `promote-i-${it.id}`.slice(0, 64),
          exercise_id: it.exercise_id,
          exercise_name: it.exercise_name.slice(0, 200),
        };
        if (it.params_json && Object.keys(it.params_json).length > 0) {
          item.params_json = it.params_json;
        }
        if (it.prescription_json != null) {
          const dose = prescriptionSchema.safeParse(it.prescription_json);
          if (dose.success) item.prescription_json = dose.data;
        }
        if (it.notes) item.notes = it.notes;
        return item;
      }),
    };
    if (circuit) part.circuit = circuit;
    if (block.coach_note?.trim()) part.coach_note = block.coach_note.trim();
    return part;
  });
}

function asTemplateFormat(raw: string | null, fallback: string): WeekDayPart['format'] {
  const parsed = templateFormat.safeParse(raw);
  if (parsed.success) return parsed.data;
  const fb = templateFormat.safeParse(fallback);
  return fb.success ? fb.data : 'strength_block';
}

export function circuitFromTemplateBlockRow(row: {
  rounds: number | null;
  pacing: string | null;
  work_seconds: number | null;
  rest_between_stations_seconds: number | null;
  rest_between_rounds_seconds: number | null;
}): CircuitConfig | null {
  if (row.rounds == null || row.rounds < 1) return null;
  const pacing =
    row.pacing === 'por_reloj' && row.work_seconds != null && row.work_seconds > 0
      ? { kind: 'por_reloj' as const, work_seconds: row.work_seconds }
      : { kind: 'por_tarea' as const };
  const parsed = circuitConfigSchema.safeParse({
    rounds: row.rounds,
    pacing,
    ...(row.rest_between_stations_seconds != null
      ? { rest_between_stations_seconds: row.rest_between_stations_seconds }
      : {}),
    ...(row.rest_between_rounds_seconds != null
      ? { rest_between_rounds_seconds: row.rest_between_rounds_seconds }
      : {}),
  });
  return parsed.success ? parsed.data : null;
}
