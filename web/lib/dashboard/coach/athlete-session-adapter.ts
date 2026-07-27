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
import type { RunComplianceResult } from '@/lib/dashboard/coach/run-compliance';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';

/** Payload of the coach session-detail endpoint (drawer host fetches this). */
export interface CoachSessionDetail {
  assignment_id: string;
  iso_date: string;
  status: PlanSessionStatus;
  /** Per-assignment title override (decoded from wa.notes), null = template name. */
  display_title: string | null;
  /** Free-form coach notes for this assignment (decoded from wa.notes). */
  coach_notes: string | null;
  /** Template snapshot in logical blocks — null when the assignment has no
   *  template AND when the template resolves to zero renderable blocks (see
   *  assignment-detail.ts). `content_state` says WHICH, so the drawer never calls
   *  a real session an error. */
  workout: AssignmentDetailWorkout | null;
  /** Why `workout` is what it is — the drawer's honest empty state:
   *   · 'blocks'     — there is content to render.
   *   · 'clock'      — the athlete ran the app as a box timer and named no
   *                    movements. A real, complete session; nothing is missing
   *                    but the movement names, and those were never claimed.
   *   · 'no_content' — a template exists but carries no exercises.
   *   · 'no_template'— the assignment points at no template at all. */
  content_state: 'blocks' | 'clock' | 'no_content' | 'no_template';
  /** Who authored this session: 'coach' = prescribed, 'self' = the athlete's own
   *  entreno libre. The coach reads a libre differently from their own plan. */
  origin: 'coach' | 'self';
  /** The template's own name. Carried separately from `workout` because a session
   *  with no renderable blocks still HAS a name — a clock's name is its shape
   *  ("AMRAP · 12:00") and losing it would leave the drawer titled "Entreno". */
  template_name: string | null;
  /** Athlete's real data — null until there is an execution. */
  execution: {
    duration_min: number | null;
    rpe: number | null;
    athlete_notes: string | null;
    ended_at: string | null;
    /** Metcon/HYROX headline result, pre-formatted ("42:15", "5 rondas + 8 reps").
     *  Null for non-scored formats or when the athlete didn't record a score. */
    score_label: string | null;
    /** Structured session feedback (#58): calibration verdict vs the plan's intent
     *  ('too_easy' | 'as_expected' | 'too_hard'), null when the athlete didn't answer. */
    perceived_difficulty: 'too_easy' | 'as_expected' | 'too_hard' | null;
    /** Body area the athlete flagged as hurting (generic token), null when nothing hurt. */
    pain_area: string | null;
    /** Optional free-text detail on the discomfort, null when none. */
    pain_note: string | null;
  } | null;
  /** Per-exercise actuals the athlete logged (segment_executions), mapped to the
   *  prescribed item via `item_uid`. Empty when the session has no granular log
   *  (old session / athlete logged only the aggregate) — the UI then shows the
   *  prescription with no "hecho" line, never a fabricated number. */
  segment_actuals: SegmentActual[];
  /** Per-tramo running-compliance verdicts (prescribed band vs executed pace/HR)
   *  + the session aggregate (% of evaluable run tramos in band). Empty tramos /
   *  null pct when the session has no evaluable run work (#66). */
  run_compliance: RunComplianceResult;
}

/**
 * Format the athlete's recorded metcon/HYROX score into the coach-facing label.
 * Time wins (For Time / RFT / HYROX-sim) → "mm:ss"; else AMRAP rounds (+ partial
 * reps). Returns null when no score was recorded (non-scored format). Single
 * source of truth for the score string so the API and any UI render it identically.
 */
export function formatExecutionScore(s: {
  score_time_s: number | null;
  score_rounds: number | null;
  score_reps: number | null;
}): string | null {
  if (s.score_time_s != null) {
    const m = Math.floor(s.score_time_s / 60);
    const sec = s.score_time_s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
  if (s.score_rounds != null) {
    return s.score_reps != null && s.score_reps > 0
      ? `${s.score_rounds} rondas + ${s.score_reps} reps`
      : `${s.score_rounds} rondas`;
  }
  return null;
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
