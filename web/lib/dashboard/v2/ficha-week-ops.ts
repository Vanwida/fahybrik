import 'server-only';

// Herramientas de SEMANA de la ficha (menú de cada fila del calendario, P13):
//   copy    — copiar los entrenos de una semana a otra (cada copia con su
//             instancia propia, mismo día de la semana);
//   shift   — desplazar ±N días los entrenos pendientes de la semana;
//   scale   — escalar el volumen: `pct` = reducir x %, `factor` = ×f en los dos
//             sentidos (0,2–1,5) (series/rondas, o tiempo/distancia de un
//             trabajo continuo; la intensidad no se toca);
//   deload  — lo mismo con el % de descarga del coach (su método, mig 0237).
// El MECANISMO de escalar es el de «Progresar» del editor de programas
// (progress-ops.ts): una sola forma de descargar en todo el producto.
//
// Solo se tocan entrenos del coach PENDIENTES (programados y sin hacer): lo hecho
// es historia. Un entreno que aún comparte plantilla de biblioteca se bifurca
// primero a su instancia (la biblioteca nunca se toca desde un atleta).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  legacyItemToPrescription,
  prescriptionToParams,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import { resolveProgressionSteps } from '@fahybrid/shared/domain/coach/progression-steps';
import { BOX_TIMEZONE, addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { progressPrescription } from '@/lib/dashboard/programming/progress-ops';
import { cloneTemplateAsInstance } from '@/lib/dashboard/coach/template-instance';
import { createDaySession, DaySessionError } from '@/lib/dashboard/coach/day-sessions';
import { recordAudit, type Actor } from '@/lib/audit/record-edit';

export type WeekOp =
  | { op: 'copy'; to_week_start: string }
  | { op: 'shift'; days: number }
  | { op: 'scale'; pct: number }
  | { op: 'scale'; factor: number }
  | { op: 'deload' };

export interface WeekOpResult {
  op: WeekOp['op'];
  /** Entrenos movidos (shift): para deshacer exacto. */
  moved: Array<{ id: string; from: string; to: string }>;
  /** Entrenos creados (copy): para deshacer. */
  created: Array<{ id: string; date: string }>;
  /** Entrenos que no se pudieron tocar y por qué. */
  skipped: Array<{ id: string; date: string; reason: string }>;
  /** Líneas de prescripción cambiadas (scale / deload). */
  lines_changed: number;
  /** Cuánto baja el volumen, en % (scale / deload); negativo = sube (factor 1,2 → −20). */
  pct: number | null;
  /** El factor de volumen aplicado (scale / deload): 0,7 = −30 %, 1,2 = +20 %. */
  factor: number | null;
}

export class WeekOpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'WeekOpError';
  }
}

const shift = (iso: string, days: number) => isoDateString(addDays(parseIsoDate(iso), days));

interface PendingRow {
  id: string;
  date: string;
  template_id: string;
  is_instance: boolean;
  notes: string | null;
}

async function assertOwned(client: Sql, coach_id: number, athlete_id: number): Promise<string> {
  const rows = await client<Array<{ today: string }>>`
    select to_char((now() at time zone coalesce(timezone, ${BOX_TIMEZONE}))::date, 'YYYY-MM-DD') as today
    from athletes where id = ${athlete_id} and coach_id = ${coach_id}
  `;
  if (!rows[0]) throw new WeekOpError('not_found', 'Atleta no encontrado', 404);
  return rows[0].today;
}

async function pendingInWeek(client: Sql, athlete_id: number, week_start: string): Promise<PendingRow[]> {
  return client<PendingRow[]>`
    select wa.id::text as id, to_char(wa.scheduled_for, 'YYYY-MM-DD') as date, wa.template_id::text as template_id,
           (t.instance_athlete_id = wa.athlete_id) as is_instance, wa.notes
    from workout_assignments wa
    join templates t on t.id = wa.template_id
    where wa.athlete_id = ${athlete_id}
      and wa.origin = 'coach'
      and wa.status = 'scheduled'
      and not exists (select 1 from workout_executions we where we.assignment_id = wa.id)
      and wa.scheduled_for between ${week_start}::date and ${shift(week_start, 6)}::date
    order by wa.scheduled_for, wa.id
  `;
}

/**
 * Garantiza que la asignación tiene su instancia privada. Si todavía apunta a
 * una plantilla de biblioteca, la copia y la reapunta. Devuelve la plantilla
 * en la que escribir.
 */
export async function ensureInstance(
  client: Sql,
  athlete_id: number,
  assignment_id: number,
): Promise<number> {
  const rows = await client<Array<{ template_id: string; is_instance: boolean }>>`
    select wa.template_id::text as template_id, (t.instance_athlete_id = wa.athlete_id) as is_instance
    from workout_assignments wa join templates t on t.id = wa.template_id
    where wa.id = ${assignment_id} and wa.athlete_id = ${athlete_id}
  `;
  const row = rows[0];
  if (!row) throw new WeekOpError('not_found', 'Entreno no encontrado', 404);
  if (row.is_instance) return Number(row.template_id);
  const inst = await cloneTemplateAsInstance({ client, source_template_id: Number(row.template_id), athlete_id });
  if (!inst) throw new WeekOpError('no_template', 'La plantilla de origen ya no existe', 409);
  await client`
    update workout_assignments
    set template_id = ${inst.template_id}, template_version = ${inst.version}, updated_at = now()
    where id = ${assignment_id} and athlete_id = ${athlete_id}
  `;
  return inst.template_id;
}

async function scaleSessions(
  client: Sql,
  athlete_id: number,
  rows: PendingRow[],
  factor: number,
): Promise<number> {
  let changed = 0;
  await client.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    for (const r of rows) {
      const templateId = await ensureInstance(tx, athlete_id, Number(r.id));
      const segs = await tx<
        Array<{ id: string; params_json: Record<string, unknown> | null; prescription_json: Prescription | null; notes: string | null }>
      >`
        select id::text, params_json, prescription_json, notes
        from template_segments where template_id = ${templateId}
        order by position
      `;
      for (const s of segs) {
        const before =
          s.prescription_json ?? legacyItemToPrescription({ params_json: s.params_json, notes: s.notes });
        const after = progressPrescription(before, { kind: 'volume', factor }, 1);
        if (JSON.stringify(after) === JSON.stringify(before)) continue;
        await tx`
          update template_segments
          set prescription_json = ${tx.json(after as never)},
              params_json = ${tx.json(prescriptionToParams(after) as never)},
              updated_at = now()
          where id = ${Number(s.id)}
        `;
        changed += 1;
      }
    }
  });
  return changed;
}

export async function applyWeekOp(params: {
  coach_id: number | bigint;
  athlete_id: number;
  week_start: string;
  op: WeekOp;
  actor: Actor;
  client?: Sql;
}): Promise<WeekOpResult> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const ath = params.athlete_id;
  const today = await assertOwned(client, coachId, ath);
  const result: WeekOpResult = { op: params.op.op, moved: [], created: [], skipped: [], lines_changed: 0, pct: null, factor: null };

  if (params.op.op === 'shift') {
    const days = params.op.days;
    const rows = await pendingInWeek(client, ath, params.week_start);
    await client.begin(async (txRaw) => {
      const tx = txRaw as unknown as Sql;
      for (const r of rows) {
        const to = shift(r.date, days);
        if (to < today) {
          result.skipped.push({ id: r.id, date: r.date, reason: 'Quedaría en un día ya pasado' });
          continue;
        }
        await tx`update workout_assignments set scheduled_for = ${to}::date, updated_at = now() where id = ${Number(r.id)}`;
        result.moved.push({ id: r.id, from: r.date, to });
      }
    });
  } else if (params.op.op === 'copy') {
    const target = params.op.to_week_start;
    if (target === params.week_start) throw new WeekOpError('same_week', 'Elige otra semana de destino.', 400);
    if (shift(target, 6) < today) throw new WeekOpError('past_week', 'No se puede copiar a una semana ya pasada.', 400);
    const rows = await client<Array<{ id: string; date: string; template_id: string; notes: string | null }>>`
      select wa.id::text as id, to_char(wa.scheduled_for, 'YYYY-MM-DD') as date, wa.template_id::text as template_id, wa.notes
      from workout_assignments wa
      where wa.athlete_id = ${ath} and wa.origin = 'coach'
        and wa.scheduled_for between ${params.week_start}::date and ${shift(params.week_start, 6)}::date
      order by wa.scheduled_for, wa.id
    `;
    const offset = Math.round((parseIsoDate(target).getTime() - parseIsoDate(params.week_start).getTime()) / 86_400_000);
    for (const r of rows) {
      const date = shift(r.date, offset);
      if (date < today) {
        result.skipped.push({ id: r.id, date, reason: 'Día ya pasado' });
        continue;
      }
      try {
        const title = r.notes?.match(/^coach_title:(.*)$/m)?.[1]?.trim() || undefined;
        const created = await createDaySession({
          coach_id: coachId,
          athlete_id: ath,
          iso_date: date,
          template_id: Number(r.template_id),
          display_title: title,
          client,
        });
        result.created.push({ id: created.assignment_id, date });
      } catch (err) {
        if (err instanceof DaySessionError) {
          result.skipped.push({
            id: r.id,
            date,
            reason: err.code === 'no_microcycle' ? 'Esa semana no tiene programa asignado' : err.message,
          });
          continue;
        }
        throw err;
      }
    }
  } else {
    // Todo es un FACTOR de volumen: reducir x % = 1 − x/100; la descarga, con el
    // % del coach (su método); «escalar» puede venir ya como factor (sube o baja).
    let factor: number;
    if (params.op.op === 'scale') {
      factor = 'factor' in params.op ? params.op.factor : 1 - params.op.pct / 100;
    } else {
      const rows = await client<
        Array<{ progression_load_step_pct: string | null; progression_sets_step: number | null; deload_volume_pct: number | null }>
      >`
        select progression_load_step_pct::text, progression_sets_step, deload_volume_pct
        from coaches where id = ${coachId}
      `;
      factor =
        1 -
        resolveProgressionSteps(
          rows[0] ?? { progression_load_step_pct: null, progression_sets_step: null, deload_volume_pct: null },
        ).deload_volume_pct /
          100;
    }
    const rows = await pendingInWeek(client, ath, params.week_start);
    // `pct` = cuánto BAJA (positivo, como siempre); una subida sale negativa.
    result.pct = Math.round((1 - factor) * 100);
    result.factor = factor;
    result.lines_changed = await scaleSessions(client, ath, rows, factor);
  }

  await recordAudit(client, {
    entity_type: 'athletes',
    entity_id: BigInt(ath),
    action: 'update',
    actor: params.actor,
    diff: {
      kind: 'week_op',
      week_start: params.week_start,
      op: params.op,
      moved: result.moved.length,
      created: result.created.length,
      lines_changed: result.lines_changed,
    },
  }).catch(() => undefined);

  return result;
}
