// =============================================================================
// Dobles CONNECTED PLAN resolver (pure mapping)
//
// Powers GET /api/athlete/dobles/plan — the iOS DoblesConnectedPlan contract
// (ios/FAHYBRIK/Dobles/DoblesService.swift → DoblesConnectedPlan / DoblesPlanDay).
// Two connected athletes each keep their OWN per-athlete week (materialized
// workout_assignments); this maps BOTH weeks — resolved by the shared
// buildAthleteWeekPlan — into the connected-plan the hub renders: self's week +
// a read-only view of the partner's week, each day tagged with how the two share
// (or don't share) that session.
//
// TOGETHERNESS (per day, subject-vs-other on the SAME date) — derived ONLY from
// real assignment data, never invented:
//   rest              subject has no session that day.
//   joint_mandatory   subject's session is a HYROX SIMULATION (template.format =
//                     'hyrox_sim'), shared, and the other athlete has the SAME
//                     template that day → the race-sim they MUST do together.
//   both_done         same template, shared, and BOTH sessions are 'completed'.
//   optional_together same template, shared, not both done → they MAY do it
//                     together (identical plan).
//   each_own          anything else the subject trains (partner rests, a
//                     different template, or a self_only session) → each does
//                     their own; the sub-line names the other's session.
//
// This is A PURE function of two AthleteWeekPlan objects — no DB, unit-testable.
// The DB read lives in buildAthleteWeekPlan (lib/athlete/week-plan.ts); the route
// wires auth + partner resolution + the two week reads to this mapper.
// =============================================================================

import type {
  AthleteWeekDay,
  AthleteWeekDaySession,
  AthleteWeekPlan,
} from '@/lib/athlete/week-plan';

// ── Wire contract (matches iOS DoblesConnectedPlan / DoblesPlanDay, snake_case) ──

export type DoblesTogetherness =
  | 'both_done'
  | 'optional_together'
  | 'each_own'
  | 'joint_mandatory'
  | 'rest';

export interface DoblesPlanDayDTO {
  /** Stable row id (the assignment id, or "rest-<iso>" for a rest day). */
  id: string;
  /** Localized 3-letter day code ("LUN".."DOM"). */
  day_label: string;
  /** Session name, null on rest days. */
  session_title: string | null;
  /** Optional sub-line (e.g. "Guillem hace Metcon" / "Opcional juntos"). */
  detail: string | null;
  togetherness: DoblesTogetherness;
  /** Modality string for the row dot (run/strength/ergo/…). */
  modality: string | null;
}

export interface DoblesConnectedPlanDTO {
  partner_name: string | null;
  /** Whether the partner has shared their week (≥1 shared session). */
  partner_plan_visible: boolean;
  /** Short subtitle prefix, e.g. the microciclo name. Null when none. */
  week_label: string | null;
  /** The self athlete's week (Mon–Sun, rest days included). */
  self_days: DoblesPlanDayDTO[];
  /** The partner's week (read-only), same length + order. */
  partner_days: DoblesPlanDayDTO[];
  /** Optional free-form coach markers; the structured days drive the UI. */
  notes: string[];
  /**
   * The self assignment id the "Entrenar a la vez" screen loads — the first
   * optional-together session of the self week (identical shared plan). Null
   * when there is none this week (the CTA then stays disabled honestly).
   */
  train_together_session_id: string | null;
}

// Mon..Sun (buildAthleteWeekPlan day_of_week is 1..7 = Mon..Sun) → ES 3-letter.
const DAY_LABELS_ES = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'] as const;

// A session is "done" when its assignment is completed.
const DONE_STATUS = 'completed';
// A HYROX full/partial simulation — the joint-mandatory race-sim template.
const HYROX_SIM_FORMAT = 'hyrox_sim';

function dayLabel(dow: number): string {
  return DAY_LABELS_ES[dow - 1] ?? '—';
}

/** The representative session for a day (the first; AM before PM by query order). */
function primarySession(day: AthleteWeekDay): AthleteWeekDaySession | null {
  return day.sessions[0] ?? null;
}

/** The other athlete's session on the same day sharing the subject's template. */
function matchingSession(
  other: AthleteWeekDay,
  templateId: string | null,
): AthleteWeekDaySession | null {
  if (!templateId) return null;
  return other.sessions.find((s) => s.template_id === templateId) ?? null;
}

/**
 * Classify ONE day for the SUBJECT athlete relative to the OTHER athlete's same
 * day, and build the DoblesPlanDay. `otherName` labels the each-own sub-line
 * (the partner's first name on self_days, the self name on partner_days).
 */
export function classifyDay(
  subjectDay: AthleteWeekDay,
  otherDay: AthleteWeekDay,
  otherName: string | null,
): DoblesPlanDayDTO {
  const s = primarySession(subjectDay);
  const label = dayLabel(subjectDay.day_of_week);

  if (!s) {
    return {
      id: `rest-${subjectDay.iso_date}`,
      day_label: label,
      session_title: null,
      detail: null,
      togetherness: 'rest',
      modality: null,
    };
  }

  const twin = matchingSession(otherDay, s.template_id); // same template, other side
  // "Together" requires BOTH athletes to share that session: if either side is
  // self_only the coach opted that athlete out, so it reads as each-own (never a
  // togetherness the other athlete didn't actually opt into).
  const bothShared =
    s.partner_visibility === 'shared' && twin?.partner_visibility === 'shared';
  const isSim = s.format === HYROX_SIM_FORMAT;

  let togetherness: DoblesTogetherness;
  let detail: string | null;

  if (isSim && bothShared && twin) {
    togetherness = 'joint_mandatory';
    detail = 'Obligatoria juntos · reparto de estaciones';
  } else if (bothShared && twin) {
    const bothDone = s.status === DONE_STATUS && twin.status === DONE_STATUS;
    togetherness = bothDone ? 'both_done' : 'optional_together';
    detail = bothDone ? null : 'Opcional juntos';
  } else {
    togetherness = 'each_own';
    // Name the other's session when they DO train a (different) one that day.
    const otherPrimary = primarySession(otherDay);
    detail = otherPrimary
      ? `${otherName?.trim() || 'Tu compañero'} hace ${otherPrimary.title}`
      : null;
  }

  return {
    id: s.assignment_id,
    day_label: label,
    session_title: s.title,
    detail,
    togetherness,
    modality: s.modality,
  };
}

/** Whether an athlete's week exposes at least one session to the partner. */
function weekIsShared(week: AthleteWeekPlan): boolean {
  return week.days.some((d) => d.sessions.some((s) => s.partner_visibility === 'shared'));
}

/** First optional-together self assignment id (the train-together CTA target). */
function firstTrainTogetherId(selfDays: DoblesPlanDayDTO[]): string | null {
  const day = selfDays.find((d) => d.togetherness === 'optional_together');
  return day ? day.id : null;
}

export interface DoblesConnectedPlanInput {
  selfWeek: AthleteWeekPlan;
  partnerWeek: AthleteWeekPlan;
  /** Reader's first name (labels each-own sub-lines on partner_days). */
  self_name: string | null;
  /** Partner's first name (title + each-own sub-lines on self_days). */
  partner_name: string | null;
}

/**
 * Build the connected plan from BOTH resolved weeks. Both weeks cover the same
 * Mon–Sun window (buildAthleteWeekPlan(offset=0)) so the day arrays align 1:1 by
 * index. Pure: no DB, no I/O.
 */
export function buildDoblesConnectedPlan(
  input: DoblesConnectedPlanInput,
): DoblesConnectedPlanDTO {
  const { selfWeek, partnerWeek, self_name, partner_name } = input;

  const selfDays = selfWeek.days.map((d, i) =>
    classifyDay(d, partnerWeek.days[i] ?? emptyDay(d), partner_name),
  );
  const partnerDays = partnerWeek.days.map((d, i) =>
    classifyDay(d, selfWeek.days[i] ?? emptyDay(d), self_name),
  );

  return {
    partner_name,
    partner_plan_visible: weekIsShared(partnerWeek),
    // The periodization phase name reads well as the subtitle prefix; null when
    // the week isn't part of a named microcycle (free-planned) — never invented.
    week_label: selfWeek.microciclo_name,
    self_days: selfDays,
    partner_days: partnerDays,
    notes: [],
    train_together_session_id: firstTrainTogetherId(selfDays),
  };
}

/** A rest-only stand-in day when one side's week is shorter/absent. */
function emptyDay(reference: AthleteWeekDay): AthleteWeekDay {
  return {
    day_of_week: reference.day_of_week,
    iso_date: reference.iso_date,
    sessions: [],
    is_rest: true,
    kind: 'rest',
    recovery_suggestions: [],
  };
}
