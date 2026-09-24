import 'server-only';

// El entreno de UN día de un atleta, para el panel-editor de la ficha: el modelo
// del editor (los mismos bloques/líneas/prescripciones que la biblioteca), su
// estado y las zonas de carrera del atleta (la regla de ritmo). Guardar escribe
// en la INSTANCIA del atleta; si el entreno aún comparte plantilla de biblioteca
// se bifurca antes (P5: el editor viejo solo veía las instancias y decía «Sin
// entreno este día» a un día con entreno).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadSessionEditorModel } from '@/lib/dashboard/v2/editor-data';
import type { SessionEditorModel } from '@/lib/dashboard/v2/editor-types';
import { loadAthleteZoneProfiles } from '@/lib/dashboard/v2/zone-profile';
import { decodeCoachAssignmentNotes, updateDaySession } from '@/lib/dashboard/coach/day-sessions';
import { updateAthleteInstanceDay } from '@/lib/dashboard/coach/template-instance';
import type { Actor } from '@/lib/audit/record-edit';
import { ensureInstance } from './ficha-week-ops';

export interface FichaSessionEditor {
  assignment_id: string;
  athlete_name: string;
  date: string;
  status: 'scheduled' | 'completed' | 'partial' | 'missed' | 'skipped';
  done: boolean;
  /** Se puede editar (programado y sin hacer). */
  editable: boolean;
  title: string;
  /** Aún comparte la plantilla de biblioteca: guardar la bifurca. */
  shared_template: boolean;
  model: SessionEditorModel;
  run_zones: { code: string; fast_s: number; slow_s: number | null }[];
}

export async function loadFichaSessionEditor(params: {
  coach_id: number | bigint;
  athlete_id: number;
  assignment_id: number;
  client?: Sql;
}): Promise<FichaSessionEditor | null> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const rows = await client<
    Array<{
      id: string;
      athlete_name: string;
      date: string;
      status: FichaSessionEditor['status'];
      executed: boolean;
      template_id: string;
      is_instance: boolean;
      notes: string | null;
      name: string | null;
      origin: string;
    }>
  >`
    select wa.id::text, a.full_name as athlete_name, to_char(wa.scheduled_for, 'YYYY-MM-DD') as date,
           wa.status::text as status,
           exists (select 1 from workout_executions we where we.assignment_id = wa.id) as executed,
           wa.template_id::text as template_id, (t.instance_athlete_id = wa.athlete_id) as is_instance,
           wa.notes, t.name, wa.origin::text as origin
    from workout_assignments wa
    join athletes a on a.id = wa.athlete_id and a.coach_id = ${coachId}
    join templates t on t.id = wa.template_id
    where wa.id = ${params.assignment_id} and wa.athlete_id = ${params.athlete_id}
  `;
  const r = rows[0];
  if (!r) return null;
  const [model, zones] = await Promise.all([
    loadSessionEditorModel({ coach_id: coachId, template_id: Number(r.template_id) }),
    loadAthleteZoneProfiles({ coach_id: coachId, athlete_id: params.athlete_id, client }).catch(() => []),
  ]);
  if (!model) return null;
  const done = r.status === 'completed' || r.status === 'partial' || r.executed;
  const run = zones.find((z) => z.modality === 'run');
  return {
    assignment_id: r.id,
    athlete_name: r.athlete_name,
    date: r.date,
    status: r.status,
    done,
    editable: r.status === 'scheduled' && !done && r.origin !== 'self',
    title: decodeCoachAssignmentNotes(r.notes).display_title ?? r.name ?? 'Entreno',
    shared_template: !r.is_instance,
    model,
    run_zones: (run?.zones_json ?? []).map((z) => ({ code: z.code, fast_s: z.fast_s, slow_s: z.slow_s })),
  };
}

export class FichaSessionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'FichaSessionError';
  }
}

/**
 * Guarda el contenido (nombre + segmentos) de un entreno pendiente en la
 * instancia del atleta, bifurcándola si hace falta. El título que ve el atleta
 * pasa a ser el nuevo nombre.
 */
export async function saveFichaSession(params: {
  coach_id: number | bigint;
  athlete_id: number;
  assignment_id: number;
  name: string;
  segments: unknown[];
  actor: Actor;
  client?: Sql;
}): Promise<{ template_id: number }> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const rows = await client<Array<{ date: string; status: string; executed: boolean; notes: string | null }>>`
    select to_char(wa.scheduled_for, 'YYYY-MM-DD') as date, wa.status::text as status,
           exists (select 1 from workout_executions we where we.assignment_id = wa.id) as executed, wa.notes
    from workout_assignments wa
    join athletes a on a.id = wa.athlete_id and a.coach_id = ${coachId}
    where wa.id = ${params.assignment_id} and wa.athlete_id = ${params.athlete_id}
  `;
  const r = rows[0];
  if (!r) throw new FichaSessionError('not_found', 'Entreno no encontrado', 404);
  if (r.status !== 'scheduled' || r.executed) {
    throw new FichaSessionError('not_pending', 'Ese entreno ya está hecho: no se edita.', 409);
  }
  const templateId = await ensureInstance(client, params.athlete_id, params.assignment_id);
  const out = await updateAthleteInstanceDay({
    coach_id: coachId,
    athlete_id: params.athlete_id,
    iso_date: r.date,
    payload: { template_id: templateId, name: params.name, segments: params.segments },
    actor: params.actor,
    client,
  });
  // Un título puesto a mano en la asignación ganaría al nombre nuevo: se alinea.
  if (decodeCoachAssignmentNotes(r.notes).display_title) {
    await updateDaySession({
      coach_id: coachId,
      athlete_id: params.athlete_id,
      assignment_id: params.assignment_id,
      display_title: params.name,
      notes: decodeCoachAssignmentNotes(r.notes).notes,
      client,
    });
  }
  return out;
}
