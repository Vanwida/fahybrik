import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  addDays,
  isoDateString,
  parseIsoDate,
  mondayOfWeek,
} from '@fahybrid/shared/domain/dates';
import { getMonthTemplate } from './program-months';
import { getWeekTemplate } from './program-weeks';
import { parseWeekSlotsFromDb } from './program-week-slots';
import { hydrateBlockParts, slotLabelForSessionIndex } from './instantiate-program';
import type {
  WeekSlots,
  WeekSession,
  WeekDayPart,
} from '@fahybrid/shared/schema/program-templates';
import { templateFormat } from '@fahybrid/shared/schema/_primitives';

// =============================================================================
// Publish preview — qué recibirá el atleta ANTES de confirmar.
//
// Espeja EXACTAMENTE la materialización de `instantiateMonthFromTemplate`
// (mismo orden de semanas/días/sesiones, mismas etiquetas de slot, misma
// hidratación de bloques de biblioteca vía `hydrateBlockParts`) pero NO
// persiste nada: en vez de insertar `workout_assignments`/`templates`, devuelve
// un resumen estructurado de cada sesión con sus bloques + nº de ejercicios.
//
// CERO datos inventados: una sesión sin estructura (template_id que no existe,
// o bloques `needs_review` sin desglosar) se marca `materializes: false` y se
// reporta honesto ("bloque sin desglosar — el atleta verá la prescripción").
// `session_count` cuenta solo las sesiones que crearían un workout_assignment
// real, igual que el contador de la materialización.
// =============================================================================

export type PreviewBlock = {
  /** Título del bloque (calentamiento, AMRAP…). */
  title: string;
  /** Formato del bloque (amrap, for_time, circuit…) o null si no aplica. */
  format: string | null;
  /** Nombres de ejercicios estructurados del bloque (orden de prescripción). */
  exercises: string[];
  /**
   * true si el bloque viene de la Biblioteca pero NO tiene estructura
   * (needs_review): el atleta verá la prescripción verbatim, no ejercicios
   * con vídeo/analíticas. Honesto, no inventado.
   */
  needs_review: boolean;
};

export type PreviewSession = {
  /** 'am' | 'pm' | 'slot:N' — misma etiqueta que materializa el slot. */
  slot: string;
  /** Foco de la sesión, si lo definió el coach. */
  focus: string | null;
  /** Bloques de la sesión con sus ejercicios. */
  blocks: PreviewBlock[];
  /** Nº de ejercicios reales (= template_segments que se crearían). */
  exercise_count: number;
  /**
   * true si esta sesión crearía un workout_assignment real (tiene al menos un
   * ejercicio estructurado, o referencia un template reutilizable existente).
   * false → la materialización la saltaría (sesión vacía / sin estructura).
   */
  materializes: boolean;
  /** Nombre del template reutilizable, si la sesión referencia uno. */
  template_name: string | null;
};

export type PreviewDay = {
  /** 1 (lunes) … 7 (domingo). */
  day_of_week: number;
  /** Fecha ISO real (YYYY-MM-DD) en la que cae el día. */
  date: string;
  sessions: PreviewSession[];
};

export type PreviewWeek = {
  /** 1-indexado dentro del microciclo. */
  week_number: number;
  /** Nombre de la plantilla de semana. */
  name: string;
  /** Lunes ISO de la semana. */
  week_start: string;
  /** Domingo ISO de la semana. */
  week_end: string;
  days: PreviewDay[];
};

export type PublishPreview = {
  month_template_id: string;
  month_name: string;
  level: string;
  /** Lunes ISO del primer día (normalizado al lunes de la semana). */
  start_date: string;
  /** Domingo ISO del último día del microciclo. */
  end_date: string;
  /** Nº de semanas del microciclo. */
  week_count: number;
  /**
   * Nº de sesiones que se materializarían como workout_assignment real.
   * Si es 0 → el microciclo está vacío y publicar no entregaría nada.
   */
  session_count: number;
  weeks: PreviewWeek[];
};

export class PublishPreviewError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'PublishPreviewError';
  }
}

// Every value the `template_format` enum accepts — the single shared source
// (canonical catalog ∪ legacy DB members). Used to validate a block's format.
const TEMPLATE_FORMATS = templateFormat.options;

export async function buildPublishPreview(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  month_template_id: number | bigint;
  start_date: string;
  client?: Sql;
}): Promise<PublishPreview> {
  const client = params.client ?? defaultSql;

  const athleteRows = await client<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${params.athlete_id as number}
      and coach_id = ${params.coach_id as number}
    limit 1
  `;
  if (!athleteRows[0]) {
    throw new PublishPreviewError('not_found', 'Athlete not found', 404);
  }

  const month = await getMonthTemplate({
    coach_id: params.coach_id,
    id: params.month_template_id,
    client,
  });
  if (!month) {
    throw new PublishPreviewError('not_found', 'Month template not found', 404);
  }
  if (month.weeks.length === 0) {
    throw new PublishPreviewError('empty_month', 'Month template has no weeks', 400);
  }

  const startMonday = mondayOfWeek(parseIsoDate(params.start_date));
  const startIso = isoDateString(startMonday);
  const weekCount = month.weeks.length;
  const endIso = isoDateString(addDays(startMonday, weekCount * 7 - 1));

  let sessionCount = 0;
  const weeks: PreviewWeek[] = [];

  for (let wi = 0; wi < month.weeks.length; wi++) {
    const weekMeta = month.weeks[wi]!;
    const weekStart = addDays(startMonday, wi * 7);
    const weekEnd = addDays(weekStart, 6);

    const weekTpl = await getWeekTemplate({
      coach_id: params.coach_id,
      id: Number(weekMeta.week_template_id),
      client,
    });
    if (!weekTpl) {
      throw new PublishPreviewError(
        'week_not_found',
        `Week template ${weekMeta.week_template_id} missing`,
        400,
      );
    }

    const slots: WeekSlots =
      typeof weekTpl.slots_json === 'object' && weekTpl.slots_json !== null
        ? (weekTpl.slots_json as WeekSlots)
        : parseWeekSlotsFromDb(weekTpl.slots_json);

    const days: PreviewDay[] = [];
    for (const day of slots.days) {
      const dayDate = addDays(weekStart, day.day_of_week - 1);
      const sessions: PreviewSession[] = [];

      for (let i = 0; i < day.sessions.length; i++) {
        const session = day.sessions[i]!;
        if (session.kind !== 'workout') continue;
        const preview = await previewSession({ client, session });
        if (preview.materializes) sessionCount += 1;
        sessions.push({ ...preview, slot: slotLabelForSessionIndex(i) });
      }

      // Solo incluimos días con alguna sesión de workout (igual que el board
      // del atleta no muestra días en rest como "sesión").
      if (sessions.length > 0) {
        days.push({
          day_of_week: day.day_of_week,
          date: isoDateString(dayDate),
          sessions,
        });
      }
    }

    weeks.push({
      week_number: wi + 1,
      name: weekTpl.name,
      week_start: isoDateString(weekStart),
      week_end: isoDateString(weekEnd),
      days,
    });
  }

  return {
    month_template_id: String(params.month_template_id),
    month_name: month.name,
    level: month.level,
    start_date: startIso,
    end_date: endIso,
    week_count: weekCount,
    session_count: sessionCount,
    weeks,
  };
}

/**
 * Resumen de una sesión sin persistir. Dos caminos espejo del materializador:
 *  1) `template_id` → template reutilizable: lee nombre + nº de segments.
 *  2) `blocks[]` inline → hidrata bloques de biblioteca y lista ejercicios.
 */
async function previewSession(params: {
  client: Sql;
  session: WeekSession;
}): Promise<Omit<PreviewSession, 'slot'>> {
  const { client, session } = params;

  if (session.template_id != null) {
    const rows = await client<Array<{ name: string; seg_count: number }>>`
      select t.name,
             (select count(*)::int from template_segments s where s.template_id = t.id) as seg_count
      from templates t
      where t.id = ${Number(session.template_id)}
      limit 1
    `;
    const tpl = rows[0];
    // Un template_id que ya no existe → la materialización igualmente inserta
    // el assignment (template_id NOT NULL, FK), así que materializes = true,
    // pero reportamos honesto que no podemos previsualizar su contenido.
    return {
      focus: session.focus ?? null,
      blocks: [],
      exercise_count: tpl?.seg_count ?? 0,
      materializes: true,
      template_name: tpl?.name ?? 'Template asignado',
    };
  }

  const rawBlocks: WeekDayPart[] = session.blocks ?? [];
  const blocks = await hydrateBlockParts(client, rawBlocks);

  const referencedIds = Array.from(
    new Set(blocks.flatMap((b) => (b.items ?? []).map((it) => Number(it.exercise_id)))),
  );
  const existing =
    referencedIds.length > 0
      ? await client<Array<{ id: string }>>`
          select id::text from exercises where id = any(${referencedIds}::bigint[])
        `
      : [];
  const existingIds = new Set(existing.map((r) => Number(r.id)));

  let exerciseCount = 0;
  const previewBlocks: PreviewBlock[] = blocks.map((b) => {
    const realItems = (b.items ?? []).filter((it) => existingIds.has(Number(it.exercise_id)));
    exerciseCount += realItems.length;
    // Bloque de biblioteca sin estructura desglosada → needs_review.
    const fromLibrary = b.source_block_id != null;
    const needsReview = fromLibrary && realItems.length === 0;
    return {
      title: b.title,
      format: (TEMPLATE_FORMATS as readonly string[]).includes(b.format) ? b.format : null,
      exercises: realItems.map((it) => it.exercise_name),
      needs_review: needsReview,
    };
  });

  return {
    focus: session.focus ?? null,
    blocks: previewBlocks,
    exercise_count: exerciseCount,
    // Igual que el materializador: sin ejercicios reales → no se crea assignment.
    materializes: exerciseCount > 0,
    template_name: null,
  };
}
