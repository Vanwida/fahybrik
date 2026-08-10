import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { parseIsoDate } from '@fahybrid/shared/domain/dates';
import { createAuthoredInstance, cloneTemplateAsInstance } from './template-instance';

/** Formato de una sesión autorada cuyo autor no dice ninguno: la tabla de series. */
const AUTHORED_DEFAULT_FORMAT = 'sets';

export class DaySessionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'DaySessionError';
  }
}

export function encodeCoachAssignmentNotes(params: {
  display_title?: string | null | undefined;
  notes?: string | null | undefined;
  existing_notes?: string | null | undefined;
}): string | null {
  const existing = params.existing_notes ?? '';
  const slotLine = existing.match(/^slot:(am|pm)\b/m)?.[0] ?? null;
  const title = params.display_title?.trim();
  const body = params.notes?.trim() ?? '';
  const lines = [slotLine, title ? `coach_title:${title}` : null, body || null].filter(
    (x): x is string => Boolean(x),
  );
  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Inverse of `encodeCoachAssignmentNotes`: splits the raw
 * `workout_assignments.notes` value back into the coach-facing fields
 * (per-assignment display title override + free-form coach notes). The
 * `slot:` line is internal scheduling metadata and never surfaces.
 */
export function decodeCoachAssignmentNotes(raw: string | null | undefined): {
  display_title: string | null;
  notes: string | null;
} {
  if (!raw) return { display_title: null, notes: null };
  const lines = raw.split('\n');
  let displayTitle: string | null = null;
  const bodyLines: string[] = [];
  for (const line of lines) {
    if (/^slot:(am|pm)\b/.test(line)) continue;
    const titleMatch = line.match(/^coach_title:(.*)$/);
    if (titleMatch) {
      displayTitle = titleMatch[1]?.trim() || null;
      continue;
    }
    bodyLines.push(line);
  }
  const body = bodyLines.join('\n').trim();
  return { display_title: displayTitle, notes: body || null };
}

async function assertCoachOwnsAthlete(params: {
  client: Sql;
  coach_id: number | bigint;
  athlete_id: number;
}): Promise<void> {
  const rows = await params.client<Array<{ n: number }>>`
    select count(*)::int as n from athletes
    where id = ${params.athlete_id} and coach_id = ${params.coach_id}
  `;
  if ((rows[0]?.n ?? 0) === 0) {
    throw new DaySessionError('not_found', 'Atleta no encontrado', 404);
  }
}

async function resolveMicrocycleForDate(params: {
  client: Sql;
  athlete_id: number;
  iso_date: string;
}): Promise<string> {
  const rows = await params.client<Array<{ id: string }>>`
    select mc.id::text
    from microcycles mc
    where mc.athlete_id = ${params.athlete_id}
      and mc.start_date <= ${params.iso_date}::date
      and mc.end_date >= ${params.iso_date}::date
    order by mc.start_date asc
    limit 1
  `;
  if (!rows[0]) {
    throw new DaySessionError(
      'no_microcycle',
      'No hay microciclo para esa fecha — asigna un mes primero',
      400,
    );
  }
  return rows[0].id;
}

async function resolveDefaultTemplateId(params: {
  client: Sql;
  coach_id: number | bigint;
}): Promise<number> {
  const rows = await params.client<Array<{ id: string }>>`
    select id::text from templates
    where coach_id = ${params.coach_id}
    order by updated_at desc
    limit 1
  `;
  if (!rows[0]) {
    throw new DaySessionError(
      'no_templates',
      'No hay entrenos en biblioteca — crea una plantilla en Programación',
      400,
    );
  }
  return Number(rows[0].id);
}

export async function updateDaySession(params: {
  coach_id: number | bigint;
  athlete_id: number;
  assignment_id: number;
  display_title?: string | null | undefined;
  notes?: string | null | undefined;
  client?: Sql | undefined;
}): Promise<{ assignment_id: string }> {
  const client = params.client ?? defaultSql;
  await assertCoachOwnsAthlete({
    client,
    coach_id: params.coach_id,
    athlete_id: params.athlete_id,
  });

  const existing = await client<Array<{ notes: string | null }>>`
    select wa.notes
    from workout_assignments wa
    where wa.id = ${params.assignment_id}
      and wa.athlete_id = ${params.athlete_id}
      and wa.status = 'scheduled'
    limit 1
  `;
  if (!existing[0]) {
    throw new DaySessionError('not_found', 'Entreno no encontrado o ya bloqueado', 404);
  }

  const mergedNotes = encodeCoachAssignmentNotes({
    display_title: params.display_title,
    notes: params.notes,
    existing_notes: existing[0].notes,
  });

  const updated = await client<Array<{ id: string }>>`
    update workout_assignments
    set notes = ${mergedNotes},
        updated_at = now()
    where id = ${params.assignment_id}
      and athlete_id = ${params.athlete_id}
    returning id::text
  `;
  if (!updated[0]) {
    throw new DaySessionError('not_found', 'No se pudo actualizar el entreno', 404);
  }
  return { assignment_id: updated[0].id };
}

/**
 * DE DÓNDE SALE EL CONTENIDO de la sesión que se crea. Las dos formas de que una
 * asignación tenga su instancia privada (ver `template-instance.ts`):
 *   · fork     — copia de una plantilla de la biblioteca (`template_id`, o la más
 *                reciente del coach). El defecto histórico y lo que hace el panel.
 *   · authored — instancia VACÍA que el que llama rellena a continuación con el
 *                contenido tipado que le han dictado. No hay plantilla de origen,
 *                así que no se arrastra el formato ni el calentamiento de otra.
 */
export type DaySessionContentSource = 'fork' | 'authored';

export async function createDaySession(params: {
  coach_id: number | bigint;
  athlete_id: number;
  iso_date: string;
  display_title?: string | null | undefined;
  notes?: string | null | undefined;
  template_id?: number | undefined;
  /** Ver `DaySessionContentSource`. Por defecto `fork` — el camino de siempre. */
  content_source?: DaySessionContentSource | undefined;
  /** Solo en `authored`: el formato de la sesión. Sin esto, `sets`. */
  format?: string | undefined;
  client?: Sql | undefined;
}): Promise<{ assignment_id: string; template_id: number }> {
  const client = params.client ?? defaultSql;
  await assertCoachOwnsAthlete({
    client,
    coach_id: params.coach_id,
    athlete_id: params.athlete_id,
  });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.iso_date)) {
    throw new DaySessionError('bad_request', 'Fecha inválida', 400);
  }
  parseIsoDate(params.iso_date);

  const microcycleId = await resolveMicrocycleForDate({
    client,
    athlete_id: params.athlete_id,
    iso_date: params.iso_date,
  });

  // Per-athlete plan bifurcation: the assignment owns a private INSTANCE, never a
  // shared reference — so later edits to this day stay isolated and library edits
  // never reach this athlete. Forkeada de una plantilla o autorada vacía, pero
  // SIEMPRE propia (ver `DaySessionContentSource`).
  let instance: { template_id: number; version: number } | null;
  if (params.content_source === 'authored') {
    instance = await createAuthoredInstance({
      client,
      coach_id: params.coach_id,
      athlete_id: params.athlete_id,
      name: params.display_title?.trim() || 'Entreno',
      format: params.format ?? AUTHORED_DEFAULT_FORMAT,
    });
  } else {
    const sourceTemplateId =
      params.template_id ??
      (await resolveDefaultTemplateId({ client, coach_id: params.coach_id }));
    instance = await cloneTemplateAsInstance({
      client,
      source_template_id: sourceTemplateId,
      athlete_id: params.athlete_id,
    });
  }
  if (!instance) {
    throw new DaySessionError('no_templates', 'La plantilla de origen no existe', 400);
  }
  const templateId = instance.template_id;
  const version = instance.version;

  const notes = encodeCoachAssignmentNotes({
    display_title: params.display_title,
    notes: params.notes,
  });

  const ins = await client<Array<{ id: string }>>`
    insert into workout_assignments (
      athlete_id,
      microcycle_id,
      scheduled_for,
      template_id,
      template_version,
      status,
      notes
    )
    values (
      ${params.athlete_id},
      ${Number(microcycleId)},
      ${params.iso_date}::date,
      ${templateId},
      ${version},
      'scheduled',
      ${notes}
    )
    returning id::text
  `;
  // El `template_id` sale también: quien crea una sesión `authored` necesita saber
  // en qué instancia escribir el contenido, y hoy solo lo sabía esta función.
  return { assignment_id: ins[0]!.id, template_id: templateId };
}
