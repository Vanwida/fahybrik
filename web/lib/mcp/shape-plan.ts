// Lo que el conector pone en el cable para EL PLAN y SUS SESIONES.
//
// Mismas dos reglas que `shape.ts`, por las mismas razones: mapeo EXPLÍCITO campo
// a campo (cero spread, cero passthrough — lo que sale del edificio es una
// decisión) y tamaño de conversación (los payloads del panel están hechos para
// PÍXELES; un asistente no ve una rejilla de 28 días).
//
// LO QUE SE CAE, Y POR QUÉ
// ------------------------
//   · `prescription_json` en crudo. La dosis viaja ESCRITA («4×1000m @ 4:00-4:10/km
//     · r2'») con el formateador canónico del dominio, que es lo que el coach lee
//     en el panel y el atleta en el móvil. Un objeto de sets anidados obliga al
//     asistente a interpretar la gramática, y la interpreta mal.
//   · Los días vacíos del MES. En la semana un día de descanso es información (el
//     coach mira si hay hueco); en un mes son veinte líneas que no dicen nada.
//   · Los 25 campos de un tramo medido. Un tramo de fuerza no tiene ritmo por km:
//     ahí un `null` no significaría «no se sabe» sino «no aplica», así que solo
//     viaja lo que ese aparato midió de verdad, más una línea legible.
//
// LO QUE SE QUEDA aunque parezca detalle: la banda RESUELTA de cada línea
// (`resolved_intensity` / `resolved_load`). «Z4» no se puede juzgar sin saber que
// para ESTE atleta eran 4:15-4:25/km, y es exactamente lo que el atleta vio.

import { formatDuration, formatTarget } from '@fahybrid/shared/domain/prescription';
import { longDateEs } from '@fahybrid/shared/domain/dates';
import type {
  AthletePlanPayload,
  PlanSession,
  PlanSessionStatus,
} from '@/lib/dashboard/coach/athlete-plan';
import type { CoachSessionDetail } from '@/lib/dashboard/coach/athlete-session-adapter';
import type { AssignmentDetailBlock } from '@/lib/athlete/assignment-detail';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';
import { doseText, type SessionContentSummary } from '@/lib/coach/session-content';
import { mcpMicrocicloPhrase } from '@fahybrid/shared/domain/coach/microciclo-rail';

// ---------------------------------------------------------------------------
// get_plan
// ---------------------------------------------------------------------------

/** Cómo se dice cada estado de una sesión. El token viaja igual, con su frase. */
const STATUS_ES: Record<PlanSessionStatus, string> = {
  scheduled: 'por hacer',
  completed: 'hecha',
  partial: 'cortada a medias',
  missed: 'sin hacer',
  skipped: 'saltada a propósito',
};

function planSession(
  s: PlanSession,
  content: SessionContentSummary | undefined,
): Record<string, unknown> {
  return {
    // El id con el que se pide el detalle: `get_session({ session_id })`.
    assignment_id: s.assignment_id,
    title: s.title,
    status: s.status,
    status_es: STATUS_ES[s.status],
    format: s.format,
    duration_min: s.duration_min,
    rpe: s.rpe,
    // De qué va, cuando hay plantilla con ejercicios detrás. Null = no hay
    // contenido que resumir (plantilla vacía o reloj de box), no «está vacía».
    content: content
      ? {
          block_count: content.block_count,
          exercise_count: content.exercise_count,
          lines: content.lines,
          more_lines: content.more,
        }
      : null,
  };
}

function planDay(
  day: AthletePlanPayload['weeks'][number]['days'][number],
  contents: Map<string, SessionContentSummary>,
  withContent: boolean,
): Record<string, unknown> {
  return {
    iso_date: day.iso_date,
    label: `${day.label} ${longDateEs(day.iso_date)}`,
    is_today: day.is_today,
    sessions: day.sessions.map((s) =>
      planSession(s, withContent ? contents.get(s.assignment_id) : undefined),
    ),
  };
}

export function toPlanWeek(
  plan: AthletePlanPayload,
  contents: Map<string, SessionContentSummary>,
): Record<string, unknown> {
  const week = plan.weeks[0];
  return {
    ...planHeader(plan),
    // La semana entera, descansos incluidos: un día sin nada es la respuesta a
    // «¿le queda hueco el viernes?».
    week: week
      ? {
          week_start: week.week_start,
          week_end: week.week_end,
          days: week.days.map((d) => planDay(d, contents, true)),
        }
      : null,
  };
}

export function toPlanMonth(plan: AthletePlanPayload): Record<string, unknown> {
  return {
    ...planHeader(plan),
    weeks: plan.weeks.map((w) => ({
      week_start: w.week_start,
      week_end: w.week_end,
      session_count: w.days.reduce((n, d) => n + d.sessions.length, 0),
      // Solo los días con algo puesto: el mes se lee como una lista de sesiones.
      days: w.days
        .filter((d) => d.sessions.length > 0)
        .map((d) => planDay(d, new Map(), false)),
    })),
  };
}

export function toPlanMacro(plan: AthletePlanPayload): Record<string, unknown> {
  const macro = plan.macro;
  return {
    ...planHeader(plan),
    macro: {
      current_microcycle_index: macro.current_microcycle_index,
      total_assigned_weeks: macro.total_assigned_weeks,
      days_to_target_race: macro.a_event_days,
      /** Los tramos del plan: nombre del microciclo del coach y cuánto dura. */
      blocks: macro.block_spans.map((b) => ({
        name: b.block_type,
        position: b.position,
        first_week: b.first_week,
        week_count: b.week_count,
      })),
      /** Los microciclos asignados con sus fechas, por si pregunta por uno. */
      assignments: macro.phase_assignments.map((a) => ({
        microcycle_id: a.microcycle_id,
        name: a.name,
        level: a.level,
        start_date: a.start_date,
        end_date: a.end_date,
      })),
      /** Semana a semana: cómo fue la adherencia y en qué estado está. */
      weeks: macro.weeks.map((w) => ({
        week_start: w.week_start,
        week_end: w.week_end,
        compliance_pct: w.compliance_pct,
        status: w.status,
        adjusted: w.adjusted,
      })),
    },
  };
}

/** La cabecera común: de quién es el plan, qué tramo se está mirando y qué ve él. */
function planHeader(plan: AthletePlanPayload): Record<string, unknown> {
  return {
    athlete_id: plan.athlete_id,
    athlete_name: plan.athlete_name,
    view: plan.view_mode,
    range: { start: plan.range_start, end: plan.range_end },
    current_block: {
      name: plan.current_block,
      /** Plan hecho SOLO para este atleta, no la periodización compartida. */
      is_personal: plan.is_personal,
      week: plan.macro.block_week,
    },
    // Si el atleta VE ya lo que hay puesto, o sigue en borrador. Lo primero que
    // desmonta un «no me aparece nada en la app».
    publish: plan.microciclo
      ? {
          state: plan.microciclo.publish_state,
          name: plan.microciclo.name,
          week_count: plan.microciclo.week_count,
          draft_week_count: plan.microciclo.draft_week_count,
          session_count: plan.microciclo.session_count,
        }
      : null,
    total_sessions: plan.total_sessions,
  };
}

// ---------------------------------------------------------------------------
// get_session
// ---------------------------------------------------------------------------

/** Por qué no hay bloques que enseñar, dicho para que nadie lo llame error. */
const CONTENT_STATE_ES: Record<CoachSessionDetail['content_state'], string> = {
  blocks: 'con su contenido detallado',
  clock: 'corrida como reloj de box, sin movimientos nombrados',
  no_content: 'con una plantilla que no lleva ejercicios',
  no_template: 'sin plantilla asociada',
};

export function toSessionDetail(detail: CoachSessionDetail): Record<string, unknown> {
  const verdicts = verdictIndex(detail);
  return {
    assignment_id: detail.assignment_id,
    iso_date: detail.iso_date,
    date_es: longDateEs(detail.iso_date),
    status: detail.status,
    status_es: STATUS_ES[detail.status],
    title: detail.display_title ?? detail.template_name ?? 'Entreno',
    /** 'coach' = se la puso él; 'self' = el atleta se la montó por su cuenta. */
    origin: detail.origin,
    content_state: detail.content_state,
    content_state_es: CONTENT_STATE_ES[detail.content_state],
    coach_notes: detail.coach_notes,
    prescribed: detail.workout
      ? {
          name: detail.workout.name,
          focus: detail.workout.focus,
          coach_note: detail.workout.coach_note,
          estimated_duration_min: detail.workout.estimated_duration_minutes,
          blocks: detail.workout.blocks.map(prescribedBlock),
        }
      : null,
    executed: detail.execution
      ? {
          duration_min: detail.execution.duration_min,
          rpe: detail.execution.rpe,
          score_label: detail.execution.score_label,
          ended_at: detail.execution.ended_at,
          /** Lo que contestó al acabar sobre si el entreno le cuadró. */
          perceived_difficulty: detail.execution.perceived_difficulty,
          athlete_notes: detail.execution.athlete_notes,
          pain_area: detail.execution.pain_area,
          pain_note: detail.execution.pain_note,
        }
      : null,
    // Prescrito ↔ hecho ↔ veredicto, tramo a tramo y en el orden del entreno.
    tramos: tramoRows(detail, verdicts),
    compliance: {
      /** % de tramos de carrera evaluables que cayeron dentro de banda. */
      pct_in_band: detail.run_compliance.summary.pct_dentro,
      in_band: detail.run_compliance.summary.dentro,
      too_fast: detail.run_compliance.summary.fuera_rapido,
      too_slow: detail.run_compliance.summary.fuera_lento,
      /** Tramos prescritos que no se pueden juzgar (sin ejecución o sin banda). */
      no_data: detail.run_compliance.summary.sin_dato,
      evaluable: detail.run_compliance.summary.evaluable,
      total: detail.run_compliance.summary.total,
    },
  };
}

function prescribedBlock(block: AssignmentDetailBlock): Record<string, unknown> {
  return {
    uid: block.uid,
    title: block.title,
    format: block.format,
    coach_note: block.coach_note,
    items: block.items.map((item) => ({
      uid: item.uid,
      exercise: item.exercise_name,
      /** La dosis escrita como se lee: «4×1000m @ 4:00-4:10/km · r2'». */
      dose: doseText(item),
      /** La banda de ritmo REAL de este atleta para la zona pedida. */
      zone: item.resolved_intensity
        ? {
            label: item.resolved_intensity.zone_label,
            range: item.resolved_intensity.range_label,
            unconfirmed: item.resolved_intensity.needs_review,
          }
        : null,
      /** Los kg REALES de este atleta para el %RM pedido. */
      load: item.resolved_load
        ? {
            pct: item.resolved_load.pct_label,
            kg: item.resolved_load.kg_label,
            unconfirmed: item.resolved_load.needs_review,
          }
        : null,
      notes: item.notes,
    })),
  };
}

/** Veredicto de cumplimiento por (línea, lap). La clave es la del propio motor. */
function verdictIndex(detail: CoachSessionDetail): Map<string, string> {
  const index = new Map<string, string>();
  for (const t of detail.run_compliance.tramos) {
    index.set(`${t.item_uid}#${t.position ?? 'none'}`, t.verdict);
  }
  return index;
}

/**
 * Un tramo por cada lap medido, en el orden del entreno, con la línea prescrita a
 * la que pertenece y su veredicto. Una línea prescrita que NO se ejecutó aparece
 * igual, con `executed` en null — un tramo que desaparece es peor que un tramo
 * mal juzgado. Y un lap que no casó con ninguna línea (`item_uid` null) también
 * sale: ese trabajo pasó, aunque nadie lo hubiera pedido.
 */
function tramoRows(
  detail: CoachSessionDetail,
  verdicts: Map<string, string>,
): Array<Record<string, unknown>> {
  const byItem = new Map<string, SegmentActual[]>();
  for (const a of detail.segment_actuals) {
    if (!a.item_uid) continue;
    const list = byItem.get(a.item_uid) ?? [];
    list.push(a);
    byItem.set(a.item_uid, list);
  }
  for (const list of byItem.values()) list.sort((x, y) => x.position - y.position);

  const rows: Array<Record<string, unknown>> = [];
  for (const block of detail.workout?.blocks ?? []) {
    for (const item of block.items) {
      const actuals = byItem.get(item.uid) ?? [];
      if (actuals.length === 0) {
        rows.push({
          block: block.title,
          exercise: item.exercise_name,
          prescribed: doseText(item),
          executed: null,
          verdict: verdicts.get(`${item.uid}#none`) ?? null,
        });
        continue;
      }
      for (const a of actuals) {
        rows.push({
          block: block.title,
          exercise: item.exercise_name,
          prescribed: doseText(item),
          executed: executedTramo(a),
          verdict: verdicts.get(`${item.uid}#${a.position}`) ?? null,
        });
      }
    }
  }

  for (const a of detail.segment_actuals) {
    if (a.item_uid) continue;
    rows.push({
      block: null,
      exercise: null,
      prescribed: null,
      executed: executedTramo(a),
      verdict: null,
    });
  }
  return rows;
}

/**
 * Lo que ese aparato midió, y solo eso. Las medidas que no tomó no viajan como
 * `null`: en un tramo de fuerza un ritmo por km no es un dato que falte, es un
 * dato que no existe, y un nulo se lee como «no se sabe» (docs/CONTRATO-UI.md §7).
 */
function executedTramo(a: SegmentActual): Record<string, unknown> {
  const out: Record<string, unknown> = {
    position: a.position,
    modality: a.modality,
    label: executedLabel(a),
  };
  if (a.leg_role) out.leg_role = a.leg_role;
  if (a.leg_phase) out.leg_phase = a.leg_phase;
  if (a.duration_seconds != null) out.duration_s = a.duration_seconds;
  if (a.distance_meters != null) out.distance_m = a.distance_meters;
  if (a.avg_pace_s_per_km != null) out.pace_s_per_km = a.avg_pace_s_per_km;
  if (a.avg_pace_s_per_500m != null) out.pace_s_per_500m = a.avg_pace_s_per_500m;
  if (a.reps_completed != null) out.reps = a.reps_completed;
  if (a.weight_used_kg != null) out.weight_kg = a.weight_used_kg;
  if (a.avg_power_w != null) out.power_w = a.avg_power_w;
  if (a.calories != null) out.calories = a.calories;
  if (a.avg_hr != null) out.avg_hr = a.avg_hr;
  if (a.max_hr != null) out.max_hr = a.max_hr;
  if (a.incline_pct != null) out.incline_pct = a.incline_pct;
  if (a.emom_rounds_completed != null) {
    out.emom_rounds = `${a.emom_rounds_completed}/${a.emom_rounds_prescribed ?? '?'}`;
  }
  if (a.source) out.measured_by = a.source;
  if (a.is_structural) out.structural = true;
  return out;
}

/**
 * El tramo hecho, en una línea: «1000 m · 4:05 · 4:05/km · 168 ppm».
 *
 * La grafía de lo PRESCRITO ya la fija el dominio (`prescriptionToText`); lo
 * MEDIDO no tenía línea canónica, así que se compone con los mismos tokens
 * (`formatDuration`, `formatTarget`) para que las dos mitades se lean igual.
 */
function executedLabel(a: SegmentActual): string {
  const parts: string[] = [];
  if (a.distance_meters != null) {
    parts.push(
      a.distance_meters >= 1000 && a.distance_meters % 1000 === 0
        ? `${a.distance_meters / 1000} km`
        : `${Math.round(a.distance_meters)} m`,
    );
  }
  if (a.reps_completed != null) parts.push(`${a.reps_completed} reps`);
  if (a.weight_used_kg != null) parts.push(formatTarget({ kind: 'kg', value: a.weight_used_kg }));
  if (a.duration_seconds != null) parts.push(formatDuration(a.duration_seconds));
  if (a.avg_pace_s_per_km != null) {
    parts.push(formatTarget({ kind: 'pace', unit: 'per_km', value_s: a.avg_pace_s_per_km }));
  } else if (a.avg_pace_s_per_500m != null) {
    parts.push(formatTarget({ kind: 'pace', unit: 'per_500m', value_s: a.avg_pace_s_per_500m }));
  }
  if (a.avg_power_w != null) parts.push(formatTarget({ kind: 'watts', value: a.avg_power_w }));
  if (a.calories != null) parts.push(formatTarget({ kind: 'calories', value: a.calories }));
  if (a.avg_hr != null) parts.push(formatTarget({ kind: 'hr_bpm', value: a.avg_hr }));
  return parts.join(' · ');
}

/** La sesión, cuando hay varias el mismo día y hay que elegir. */
export function toSessionChoice(
  s: PlanSession,
  content: SessionContentSummary | undefined,
): Record<string, unknown> {
  return planSession(s, content);
}

// ---------------------------------------------------------------------------
// Resúmenes de una línea
// ---------------------------------------------------------------------------

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function joinEs(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

export function planResumen(plan: AthletePlanPayload): string {
  const parts: string[] = [];
  if (plan.current_block) {
    const week = plan.macro.block_week;
    parts.push(week != null ? `«${plan.current_block}» semana ${week}` : `«${plan.current_block}»`);
  } else {
    parts.push('sin microciclo activo');
  }

  if (plan.view_mode === 'macro') {
    parts.push(
      `${plan.macro.total_assigned_weeks} ${plural(plan.macro.total_assigned_weeks, 'semana asignada', 'semanas asignadas')}`,
    );
    if (plan.macro.a_event_days != null) parts.push(`carrera en ${plan.macro.a_event_days} días`);
    return `${plan.athlete_name}: ${joinEs(parts)}.`;
  }

  const sessions = plan.weeks.flatMap((w) => w.days.flatMap((d) => d.sessions));
  const done = sessions.filter((s) => s.status === 'completed' || s.status === 'partial').length;
  const missed = sessions.filter((s) => s.status === 'missed').length;
  const span =
    plan.view_mode === 'week'
      ? `semana del ${longDateEs(plan.range_start)}`
      : `del ${longDateEs(plan.range_start)} al ${longDateEs(plan.range_end)}`;

  if (sessions.length === 0) return `${plan.athlete_name}, ${span}: nada programado.`;
  const counts = [`${sessions.length} ${plural(sessions.length, 'sesión', 'sesiones')}`];
  if (done > 0) counts.push(`${done} ${plural(done, 'hecha', 'hechas')}`);
  if (missed > 0) counts.push(`${missed} sin hacer`);
  const microPhrase = plan.microciclo ? mcpMicrocicloPhrase(plan.microciclo) : null;
  if (microPhrase) counts.push(microPhrase);
  return `${plan.athlete_name}, ${span}: ${joinEs(counts)}.`;
}

export function sessionResumen(athleteName: string, detail: CoachSessionDetail): string {
  const parts: string[] = [STATUS_ES[detail.status]];
  if (detail.execution?.duration_min != null) parts.push(`${detail.execution.duration_min}'`);
  if (detail.execution?.rpe != null) parts.push(`RPE ${detail.execution.rpe}`);

  const { pct_dentro, evaluable } = detail.run_compliance.summary;
  if (pct_dentro != null) {
    parts.push(`${pct_dentro}% de ${evaluable} ${plural(evaluable, 'tramo', 'tramos')} en banda`);
  }
  if (detail.execution?.pain_area) parts.push(`molestia en ${detail.execution.pain_area}`);

  const title = detail.display_title ?? detail.template_name ?? 'Entreno';
  return `${athleteName}, ${longDateEs(detail.iso_date)} · ${title}: ${joinEs(parts)}.`;
}

export function sessionChoiceResumen(
  athleteName: string,
  isoDate: string,
  count: number,
): string {
  return `${athleteName} tiene ${count} sesiones el ${longDateEs(isoDate)}: pide el detalle con el session_id de la que te interese.`;
}
