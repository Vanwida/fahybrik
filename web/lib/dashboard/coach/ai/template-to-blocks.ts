import 'server-only';

import type { Sql } from '@/lib/db';
import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import { safeParsePrescription } from '@fahybrid/shared/domain/prescription';
import type { WeekDayPart } from '@fahybrid/shared/schema/program-templates';
import {
  defaultConfigForPartFormat,
  presetById,
} from '@/lib/dashboard/constants/week-day-part-presets';
import { newBlockUid } from '@/lib/dashboard/programming/studio-types';

const VALID_TEMPLATE_FORMATS = new Set<TemplateFormat>([
  'amrap',
  'for_time',
  'emom',
  'intervals',
  'strength_block',
  'hyrox_sim',
  'tempo',
  'circuit',
]);

function coerceFormat(
  raw: string | null | undefined,
  fallback: TemplateFormat,
): TemplateFormat {
  if (raw && VALID_TEMPLATE_FORMATS.has(raw as TemplateFormat)) {
    return raw as TemplateFormat;
  }
  return fallback;
}

/**
 * Lee los `template_segments` de un template del catálogo y los devuelve
 * hidratados como `WeekDayPart[]` listos para inyectar en una `WeekSession`.
 *
 * Estrategia v2 (mig 0020): los segments se agrupan por `block_position`. Cada
 * grupo → 1 `WeekDayPart`. Templates legacy (todos con `block_position = 0`)
 * siguen devolviendo 1 sola part — comportamiento idéntico al v1.
 *
 * Ordering: `block_position ASC, position ASC`.
 *
 * Devuelve `[]` si el template no tiene segments.
 */
export async function loadTemplateAsBlocks(
  templateId: string | number | bigint,
  client: Sql,
): Promise<WeekDayPart[]> {
  type Row = {
    id: string;
    position: number;
    block_position: number;
    block_format: string | null;
    block_title: string | null;
    exercise_id: string;
    exercise_name: string;
    params_json: Record<string, unknown> | null;
    prescription_json: unknown;
    notes: string | null;
    template_name: string;
    template_format: string;
  };

  const segs = await client<Row[]>`
    select
      ts.id::text as id,
      ts.position,
      ts.block_position,
      ts.block_format,
      ts.block_title,
      ts.exercise_id::text as exercise_id,
      e.name as exercise_name,
      ts.params_json,
      ts.prescription_json,
      ts.notes,
      t.name as template_name,
      t.format::text as template_format
    from template_segments ts
    join templates t on t.id = ts.template_id
    join exercises e on e.id = ts.exercise_id
    where ts.template_id = ${Number(templateId)}
    order by ts.block_position asc, ts.position asc
  `;

  if (segs.length === 0) return [];

  const templateFmt = coerceFormat(segs[0]!.template_format, 'strength_block');
  const templateName = segs[0]!.template_name;

  // Agrupar por block_position respetando el orden ya garantizado por el SQL.
  const groups = new Map<number, Row[]>();
  for (const s of segs) {
    const arr = groups.get(s.block_position);
    if (arr) {
      arr.push(s);
    } else {
      groups.set(s.block_position, [s]);
    }
  }

  const orderedKeys = [...groups.keys()].sort((a, b) => a - b);
  const parts: WeekDayPart[] = orderedKeys.map((key) => {
    const groupSegs = groups.get(key)!;
    const head = groupSegs[0]!;
    const fmt = coerceFormat(head.block_format, templateFmt);
    const title =
      (head.block_title && head.block_title.trim()) ||
      (key === 0
        ? templateName || presetById('strength')?.title || 'Principal'
        : `Bloque ${key + 1}`);

    return {
      uid: newBlockUid(),
      format: fmt,
      title,
      config_json: defaultConfigForPartFormat(fmt),
      items: groupSegs.map((s) => {
        // `prescription_json` is the segment's REAL dose; `params_json` is the
        // lossy scalar mirror. Reading only the mirror threw the dose away: a
        // Back Squat stored as 4 sets of 10/8/8/6 @65-80%RM arrives as
        // `{reps_scheme:"10/8/8/6"}`, which the legacy bridge cannot decode, so
        // the coach's own template surfaced as "sin dosis". Carry the structured
        // one when it exists and let the mirror stay the fallback.
        const prescription = safeParsePrescription(s.prescription_json);
        return {
          uid: newBlockUid(),
          exercise_id: Number(s.exercise_id),
          exercise_name: s.exercise_name,
          params_json: (s.params_json ?? {}) as Record<string, unknown>,
          ...(prescription.success ? { prescription_json: prescription.data } : {}),
          ...(s.notes ? { notes: s.notes } : {}),
        };
      }),
    };
  });

  return parts;
}
