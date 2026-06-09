// Pure domain helpers that turn the athlete's STRUCTURED intake answers
// (Step 5 availability, Step 6 preferred week, Step 7 equipment, Step 4
// injuries) into concrete planner inputs. No DB, no `server-only`, no
// `@/lib` — these are consumed by both the web and the dashboard
// materializers and by the coach intake review.
//
// The single hard rule this module encodes: a week template authored by Pablo
// uses canonical weekdays (1=Mon..7=Sun), but the ATHLETE only trains on the
// days they marked `program`. This module remaps the template's training days
// onto the athlete's available days — filtering out rest/other-activity days
// and (softly) honouring the athlete's preferred day-TYPE layout — WITHOUT
// touching the session content itself.

import type { WeekDay, WeekSession } from '../../schema/program-templates';

// =============================================================================
// Weekday vocabulary (shared with availability_json / preferred_week_json keys)
// =============================================================================

export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** day_of_week (1=Mon..7=Sun, the program-template convention) → key. */
export function dowToKey(dow: number): WeekdayKey | null {
  return dow >= 1 && dow <= 7 ? WEEKDAY_KEYS[dow - 1]! : null;
}
/** key → day_of_week (1=Mon..7=Sun). */
export function keyToDow(key: WeekdayKey): number {
  return WEEKDAY_KEYS.indexOf(key) + 1;
}

// =============================================================================
// Step 5 — availability_json  ({mon..sun -> program|other_activity|rest})
// =============================================================================

export const AVAILABILITY_VALUES = ['program', 'other_activity', 'rest'] as const;
export type AvailabilityValue = (typeof AVAILABILITY_VALUES)[number];
export type Availability = Partial<Record<WeekdayKey, AvailabilityValue>>;

export function parseAvailability(raw: unknown): Availability {
  const out: Availability = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const key of WEEKDAY_KEYS) {
    const v = r[key];
    if (v === 'program' || v === 'other_activity' || v === 'rest') out[key] = v;
  }
  return out;
}

/** Weekday keys (Mon→Sun order) the athlete marked as `program`. */
export function programDays(av: Availability): WeekdayKey[] {
  return WEEKDAY_KEYS.filter((k) => av[k] === 'program');
}

/**
 * training_days_per_week DERIVED from availability (count of program days).
 * Returns null when availability is empty so callers can fall back to the
 * stored/self-declared value instead of forcing 0.
 */
export function deriveTrainingDaysPerWeek(av: Availability): number | null {
  const n = programDays(av).length;
  return n > 0 ? n : null;
}

// =============================================================================
// Step 6 — preferred_week_json  ({mon..sun -> [type slug ...]})
// =============================================================================

export const PREFERRED_TYPES = [
  'isolated_run',
  'strength_gym',
  'hyrox_transitions',
  'ergo_conditioning',
  'specific_material',
] as const;
export type PreferredType = (typeof PREFERRED_TYPES)[number];
export type PreferredWeek = Partial<Record<WeekdayKey, PreferredType[]>>;

export function parsePreferredWeek(raw: unknown): PreferredWeek {
  const out: PreferredWeek = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const key of WEEKDAY_KEYS) {
    const v = r[key];
    if (!Array.isArray(v)) continue;
    const types = v.filter((t): t is PreferredType =>
      (PREFERRED_TYPES as readonly string[]).includes(t as string),
    );
    if (types.length > 0) out[key] = types;
  }
  return out;
}

// =============================================================================
// Session-type classification  (WeekDay -> PreferredType)
// =============================================================================

/**
 * methodology_group_id (1..10, see migration 0030) → preferred-week type slug.
 * This is the bridge between Pablo's 10 pedagogical groups and the 5 athlete
 * preference buckets. Groups with no strong day-type signal (core/mobility,
 * tapering, generic WODs) fall through to `specific_material`.
 */
const GROUP_TO_TYPE: Record<number, PreferredType> = {
  1: 'strength_gym', // fuerza-base
  2: 'strength_gym', // fuerza-explosiva-pliometrica
  3: 'ergo_conditioning', // series-ergometros
  4: 'isolated_run', // series-running
  5: 'isolated_run', // zona2-recuperacion (run/zone-2)
  6: 'ergo_conditioning', // wods-metcons
  7: 'hyrox_transitions', // simulaciones-carrera
  9: 'hyrox_transitions', // circuitos-funcionales
  10: 'specific_material', // tapering-activacion
  8: 'specific_material', // core-movilidad-preventivos
};

const FOCUS_KEYWORDS: Array<{ re: RegExp; type: PreferredType }> = [
  { re: /\b(run|running|carrera|series|trote|tempo|fartlek|z2|zona ?2)\b/i, type: 'isolated_run' },
  { re: /\b(squat|deadlift|press|fuerza|strength|gym|lift|hipthrust|hip thrust)\b/i, type: 'strength_gym' },
  { re: /\b(hyrox|transition|transici|sim|estaci|station|sled|wall ?ball)\b/i, type: 'hyrox_transitions' },
  { re: /\b(row|ski|erg|ergo|bike|assault|metcon|wod|conditioning)\b/i, type: 'ergo_conditioning' },
];

/**
 * Best-effort classification of a training day into ONE preferred type, used to
 * softly bias placement. Reads structured `methodology_group_id` first (strong
 * signal), then falls back to focus/title keywords. Returns null when the day
 * has no training sessions or no usable signal (then placement is type-agnostic).
 */
export function classifyDayType(day: Pick<WeekDay, 'sessions' | 'focus'>): PreferredType | null {
  const sessions = day.sessions.filter((s) => s.kind === 'workout');
  if (sessions.length === 0) return null;

  // 1) Structured methodology group on any block of any session.
  const counts = new Map<PreferredType, number>();
  for (const s of sessions) {
    for (const b of s.blocks ?? []) {
      const gid = b.methodology_group_id;
      if (gid != null && GROUP_TO_TYPE[gid]) {
        const t = GROUP_TO_TYPE[gid]!;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
  }
  if (counts.size > 0) {
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }

  // 2) Fallback: day/session focus or block titles.
  const text = [
    day.focus ?? '',
    ...sessions.map((s) => s.focus ?? ''),
    ...sessions.flatMap((s) => (s.blocks ?? []).map((b) => b.title ?? '')),
  ].join(' ');
  for (const { re, type } of FOCUS_KEYWORDS) {
    if (re.test(text)) return type;
  }
  return null;
}

// =============================================================================
// The core remap — template days → athlete's available days
// =============================================================================

export type RemapResult = {
  /** WeekDays with their `day_of_week` rewritten onto the athlete's program days. */
  days: WeekDay[];
  /** Program days that received no session (fewer template sessions than slots). */
  unfilled_program_dows: number[];
  /** Template training days that were dropped (more sessions than program slots). */
  dropped_training_days: number;
};

/**
 * Remap a week template's training days onto the days the athlete actually
 * trains, honouring (softly) their preferred day-TYPE layout.
 *
 * Rules:
 *  - Only `program` days from availability receive sessions; rest/other_activity
 *    days are left empty (no session lands on them).
 *  - Each template training day (a WeekDay with ≥1 workout session) is assigned
 *    to a program day. We first try to honour `preferred_week`: a training day
 *    classified as type T is placed on a still-free program day that lists T as
 *    a preference (best match by preference order). Unmatched training days fill
 *    the remaining program days in calendar order. Soft preference — never drops
 *    a session just because the type doesn't match a preferred slot.
 *  - When the template has MORE training days than the athlete has program days,
 *    the surplus is dropped (and counted) — the athlete can't train more days
 *    than they declared available. When it has FEWER, spare program days stay
 *    empty (and are reported as `unfilled_program_dows`).
 *
 * If availability is empty (athlete skipped Step 5) the template is returned
 * UNCHANGED — we never invent a schedule the athlete didn't ask for.
 */
export function remapWeekDaysToAvailability(params: {
  days: WeekDay[];
  availability: Availability;
  preferredWeek?: PreferredWeek;
}): RemapResult {
  const { days } = params;
  const progDays = programDays(params.availability);

  // No availability signal → identity (back-compat with templates as authored).
  if (progDays.length === 0) {
    return { days, unfilled_program_dows: [], dropped_training_days: 0 };
  }

  // Split template days into training days (≥1 workout) and the rest (ignored —
  // rest days are implicit: any program day without a session is a rest day).
  const trainingDays = days
    .filter((d) => d.sessions.some((s: WeekSession) => s.kind === 'workout'))
    // Keep the coach's intended ordering (calendar order in the template).
    .sort((a, b) => a.day_of_week - b.day_of_week);

  const slots = progDays.map(keyToDow); // target day_of_week values, Mon→Sun
  const preferred = params.preferredWeek ?? {};

  const assignedSlot = new Set<number>();
  const result: WeekDay[] = [];
  const leftover: WeekDay[] = [];

  // Pass 1 — type-preference matching. For each training day, try to land it on
  // a free program day that prefers its type.
  for (const td of trainingDays) {
    const type = classifyDayType(td);
    let chosen: number | null = null;
    if (type) {
      for (const dow of slots) {
        if (assignedSlot.has(dow)) continue;
        const key = dowToKey(dow);
        if (key && (preferred[key] ?? []).includes(type)) {
          chosen = dow;
          break;
        }
      }
    }
    if (chosen != null) {
      assignedSlot.add(chosen);
      result.push({ ...td, day_of_week: chosen });
    } else {
      leftover.push(td);
    }
  }

  // Pass 2 — fill remaining training days into the remaining program slots in
  // calendar order. Surplus (no slot left) is dropped.
  let dropped = 0;
  const freeSlots = slots.filter((d) => !assignedSlot.has(d));
  let fi = 0;
  for (const td of leftover) {
    const dow = freeSlots[fi];
    if (dow == null) {
      dropped += 1;
      continue;
    }
    assignedSlot.add(dow);
    result.push({ ...td, day_of_week: dow });
    fi += 1;
  }

  const unfilled = slots.filter((d) => !assignedSlot.has(d));
  result.sort((a, b) => a.day_of_week - b.day_of_week);
  return { days: result, unfilled_program_dows: unfilled, dropped_training_days: dropped };
}

// =============================================================================
// Step 7 — equipment compatibility  (equipment_json -> exercise.equipment tags)
// =============================================================================

export const EQUIPMENT_SLUGS = [
  'barbells_plates',
  'dumbbells',
  'sleds',
  'bags_kb',
  'open_space',
  'pulleys',
  'treadmill',
  'stationary_bike',
  'rower',
  'skierg',
  'other',
] as const;
export type EquipmentSlug = (typeof EQUIPMENT_SLUGS)[number];

/**
 * Athlete equipment slug → the `exercises.equipment` tags it unlocks. Only the
 * SPECIALIZED, hard-to-substitute machines are modelled here — an exercise that
 * needs one of these tags is incompatible if the athlete owns none of the slugs
 * that provide it. Gym basics (barbell/dumbbell/cable) are intentionally NOT
 * gated: a commercial gym / box is assumed to have them, and we'd rather under-
 * flag than block half the catalog.
 */
const EQUIP_SLUG_TO_TAGS: Partial<Record<EquipmentSlug, string[]>> = {
  skierg: ['ski_erg'],
  rower: ['rower'],
  sleds: ['sled'],
  stationary_bike: ['assault_bike', 'bike_erg'],
};

/** The exercise.equipment tags we gate on (union of the specialized tags). */
export const GATED_EQUIPMENT_TAGS: readonly string[] = Object.values(EQUIP_SLUG_TO_TAGS).flat();

export function parseEquipment(raw: unknown): EquipmentSlug[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is EquipmentSlug =>
    (EQUIPMENT_SLUGS as readonly string[]).includes(s as string),
  );
}

/**
 * Given the athlete's owned equipment slugs, return the set of SPECIALIZED
 * exercise-equipment tags they LACK. An exercise tagged with any of these is
 * not performable as written → coach should substitute (e.g. no skierg → swap
 * the ski segment for an equivalent).
 */
export function missingEquipmentTags(owned: EquipmentSlug[]): string[] {
  const ownedTags = new Set(
    owned.flatMap((slug) => EQUIP_SLUG_TO_TAGS[slug] ?? []),
  );
  return GATED_EQUIPMENT_TAGS.filter((tag) => !ownedTags.has(tag));
}

// =============================================================================
// Step 4 — injury contraindications  (injuries_json -> flagged movements)
// =============================================================================

export type ParsedInjury = {
  area: string;
  type?: string;
  active: boolean;
};

export function parseActiveInjuries(raw: unknown): ParsedInjury[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedInjury[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.area !== 'string' || r.area.length === 0) continue;
    // `active` defaults to true (an injury logged at intake is assumed current
    // unless explicitly cleared) — matches intake.ts parseInjuries.
    const active = typeof r.active === 'boolean' ? r.active : true;
    out.push({
      area: r.area,
      active,
      ...(typeof r.type === 'string' ? { type: r.type } : {}),
    });
  }
  return out;
}

/**
 * Map an injured body area → movements/loads to flag for the coach. Keyed by a
 * normalized area substring so free-ish area strings still match. Used to
 * surface contraindications in the intake review (NOT to auto-mutate the plan).
 */
const AREA_CONTRAINDICATIONS: Array<{ match: RegExp; flag: string }> = [
  { match: /knee|rodilla/i, flag: 'sentadilla / zancada con carga alta, pliometría' },
  { match: /(low ?back|lumbar|espalda baja|back)/i, flag: 'peso muerto / good morning, cargas axiales pesadas' },
  { match: /shoulder|hombro/i, flag: 'press por encima de cabeza, ski-erg, wall balls' },
  { match: /ankle|tobillo/i, flag: 'pliometría, sled, carrera de alto volumen' },
  { match: /hip|cadera/i, flag: 'hip thrust pesado, zancadas, sled push' },
  { match: /(hamstring|isquio)/i, flag: 'peso muerto rumano, sprints, broad jumps' },
  { match: /wrist|muñeca/i, flag: 'front squat, cleans, soportes en muñeca' },
  { match: /elbow|codo/i, flag: 'tracciones pesadas, press, farmer carry' },
];

export type InjuryContraindication = {
  area: string;
  type?: string;
  flag: string;
};

/** Active-injury contraindications to surface to the coach at intake. */
export function injuryContraindications(injuries: ParsedInjury[]): InjuryContraindication[] {
  return injuries
    .filter((i) => i.active)
    .map((i) => {
      const hit = AREA_CONTRAINDICATIONS.find((c) => c.match.test(i.area));
      return {
        area: i.area,
        flag: hit?.flag ?? 'revisar movimientos que carguen la zona afectada',
        ...(i.type !== undefined ? { type: i.type } : {}),
      };
    });
}
