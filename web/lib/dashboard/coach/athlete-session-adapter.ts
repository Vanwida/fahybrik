// Adapter — athlete session (materialized workout_assignment) → drawer shape.
//
// The SessionDrawer (Phase-1 shared editing surface) speaks `WeekSession`
// (program-templates schema: blocks → items → prescriptions). Athlete sessions
// are a DIFFERENT shape: a `workout_assignments` row pointing at a shared
// `templates@version` + per-assignment coach overrides (display title, notes)
// + the athlete's execution reality. This module maps the coach session-detail
// payload (GET /api/coach/athletes/[id]/sessions/[session_id]/detail) into the
// drawer's session shape.
//
// Domain rule: the template blocks are a SHARED object (other athletes'
// assignments reference the same template), so the drawer renders them
// read-only here; what persists per-assignment is the coach title + notes via
// the existing day-session APIs (PATCH /sessions/[id]).
//
// Client-safe: pure functions + type-only imports.

import type {
  WeekDayPart,
  WeekDayPartItem,
  WeekSession,
} from '@fahybrid/shared/schema/program-templates';
import { templateFormat, type TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import type {
  AssignmentDetailBlock,
  AssignmentDetailItem,
  AssignmentDetailWorkout,
} from '@/lib/athlete/assignment-detail';
import type { PlanSessionStatus } from '@/lib/dashboard/coach/athlete-plan';

/** Payload of the coach session-detail endpoint (drawer host fetches this). */
export interface CoachSessionDetail {
  assignment_id: string;
  iso_date: string;
  status: PlanSessionStatus;
  /** Per-assignment title override (decoded from wa.notes), null = template name. */
  display_title: string | null;
  /** Free-form coach notes for this assignment (decoded from wa.notes). */
  coach_notes: string | null;
  /** Template snapshot in logical blocks — null when the assignment has no template. */
  workout: AssignmentDetailWorkout | null;
  /** Athlete's real data — null until there is an execution. */
  execution: {
    duration_min: number | null;
    rpe: number | null;
    athlete_notes: string | null;
    ended_at: string | null;
  } | null;
}

/** Fallback format for blocks whose stored format isn't in the shared enum. */
const FALLBACK_FORMAT: TemplateFormat = 'circuit';

function toTemplateFormat(format: string): TemplateFormat {
  const parsed = templateFormat.safeParse(format);
  return parsed.success ? parsed.data : FALLBACK_FORMAT;
}

function toPartItem(item: AssignmentDetailItem): WeekDayPartItem {
  const exerciseId = Number(item.exercise_id);
  return {
    uid: item.uid,
    exercise_id: Number.isFinite(exerciseId) ? exerciseId : 0,
    exercise_name: item.exercise_name,
    params_json: item.params_json as Record<string, unknown>,
    ...(item.prescription_json ? { prescription_json: item.prescription_json } : {}),
    ...(item.notes ? { notes: item.notes } : {}),
  };
}

function toPart(block: AssignmentDetailBlock): WeekDayPart {
  return {
    uid: block.uid,
    format: toTemplateFormat(block.format),
    title: block.title,
    ...(block.coach_note ? { coach_note: block.coach_note } : {}),
    config_json: block.config_json as WeekDayPart['config_json'],
    items: block.items.map(toPartItem),
  };
}

/**
 * Maps the athlete session detail to the drawer's `WeekSession`. The session
 * title (`focus`) prefers the per-assignment coach override and falls back to
 * the template name.
 */
export function adaptAthleteSessionToDrawer(detail: CoachSessionDetail): WeekSession {
  return {
    kind: 'workout',
    blocks: detail.workout ? detail.workout.blocks.map(toPart) : [],
    focus: detail.display_title ?? detail.workout?.name ?? 'Entreno',
    ...(detail.coach_notes ? { notes: detail.coach_notes } : {}),
  };
}
