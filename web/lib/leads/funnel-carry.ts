import 'server-only';

// Funnel lead → athlete STRUCTURED carry-over (alta, #17 / opción B).
//
// At alta we now carry the full web-funnel intake into the athlete profile so a
// converted athlete opens the app already known — NO 19-step re-ask. This module
// is the single, explicit, testable translation layer from the stable `leads`
// snake_case codes to the athlete columns (mirrors the shapes the iOS-onboarding
// submit route writes, so the two paths never drift).
//
// Scope decisions (objective, build-right):
//  - Only fields the funnel asks RELIABLY map to structured columns. run/strength
//    _experience are NOT directly asked → left null (the coach / week-1 tests fill
//    them); inventing them from soft hints would be worse than null.
//  - Self-reported race MARKS (marca_5k/10k/hyrox, fc_maxima) are free text and
//    "orientativos" — they are NOT written to athlete_benchmarks (that feeds zones
//    /plan and must be ground-truth). They stay in coach notes verbatim; the
//    precise numbers come from the week-1 calibration tests.
//  - Everything non-structured stays in intake_notes (buildCoachNotes, alta-mapping).
//
// LOSSY conversions (a funnel RANGE code → one scalar column): the exact answer→
// number table IS the `*_BY_CODE` Record for each field below — read it to know
// precisely what value came from what answer. The chosen scalars are representative
// midpoints of each range (e.g. duracion_sesion 'min_45_60' → 52 min; sueno
// 'suficiente' → 6/10), kept within each column's CHECK constraint.

export type OnboardingGoalType =
  | 'first_hyrox'
  | 'improve_hyrox_mark'
  | 'improve_running'
  | 'complete_fun'
  | 'other';
export type FacilityType = 'commercial_gym' | 'crossfit_box' | 'multiple' | 'other';
export type DeviceType =
  | 'apple_watch'
  | 'iphone'
  | 'garmin'
  | 'concept2'
  | 'whoop'
  | 'oura'
  | 'other';

export interface InjuryEntry {
  area: string;
  type: string;
  active: boolean;
  note?: string;
}

// objetivo (primer_hyrox|mejorar_marca|podio|hibrido_general|otro) → goal_type.
// podio maps to improve_hyrox_mark (chasing a better placing = a better mark).
const GOAL_BY_CODE: Record<string, OnboardingGoalType> = {
  primer_hyrox: 'first_hyrox',
  mejorar_marca: 'improve_hyrox_mark',
  podio: 'improve_hyrox_mark',
  hibrido_general: 'complete_fun',
  otro: 'other',
};

// material (box_completo|gimnasio|basico_casa|solo_running) → facility_type.
const FACILITY_BY_CODE: Record<string, FacilityType> = {
  box_completo: 'crossfit_box',
  gimnasio: 'commercial_gym',
  basico_casa: 'other',
  solo_running: 'other',
};

// duracion_sesion range → representative minutes (within the 10–360 CHECK).
const SESSION_MIN_BY_CODE: Record<string, number> = {
  min_30_45: 38,
  min_45_60: 52,
  min_60_90: 75,
  min_mas_90: 100,
};

// sueno → sleep_quality (1–10, higher = better).
const SLEEP_BY_CODE: Record<string, number> = {
  bien_7_9: 8,
  suficiente: 6,
  menos_6: 4,
  problemas: 2,
};

// estres → stress_level (1–10, higher = more stressed).
const STRESS_BY_CODE: Record<string, number> = {
  bajo: 2,
  moderado: 5,
  alto: 7,
  muy_alto: 9,
};

// anos_entrenando range → representative whole years.
const EXP_YEARS_BY_CODE: Record<string, number> = {
  menos_1: 1,
  de_1_3: 2,
  de_3_5: 4,
  mas_5: 6,
};

// wearable → device_type (+ a display model for brands device_type can't name).
const WATCH_BY_CODE: Record<string, { brand: DeviceType | null; model: string | null }> = {
  garmin: { brand: 'garmin', model: null },
  apple_watch: { brand: 'apple_watch', model: null },
  whoop: { brand: 'whoop', model: null },
  coros: { brand: 'other', model: 'Coros' },
  polar: { brand: 'other', model: 'Polar' },
  otro: { brand: 'other', model: null },
  no_uso: { brand: null, model: null },
};

export function mapGoalType(code?: string | null): OnboardingGoalType | null {
  return code ? (GOAL_BY_CODE[code] ?? null) : null;
}
export function mapFacilityType(code?: string | null): FacilityType | null {
  return code ? (FACILITY_BY_CODE[code] ?? null) : null;
}
export function mapSessionMinutes(code?: string | null): number | null {
  return code ? (SESSION_MIN_BY_CODE[code] ?? null) : null;
}
export function mapSleepQuality(code?: string | null): number | null {
  return code ? (SLEEP_BY_CODE[code] ?? null) : null;
}
export function mapStressLevel(code?: string | null): number | null {
  return code ? (STRESS_BY_CODE[code] ?? null) : null;
}
export function mapExperienceYears(code?: string | null): number | null {
  return code ? (EXP_YEARS_BY_CODE[code] ?? null) : null;
}
export function mapWatch(code?: string | null): { brand: DeviceType | null; model: string | null } {
  return (code && WATCH_BY_CODE[code]) || { brand: null, model: null };
}

export interface AvailabilityWindow {
  schedule_flexible: boolean | null;
  available_from: string | null; // HH:MM
  available_to: string | null;
}

// flexibilidad_horaria → a coarse availability window. "cualquier_hora" = flexible;
// morning/evening set a representative window; weekend/limited leave times null
// (the coach refines preferred_week later).
export function mapAvailability(code?: string | null): AvailabilityWindow {
  switch (code) {
    case 'cualquier_hora':
      return { schedule_flexible: true, available_from: null, available_to: null };
    case 'mananas':
      return { schedule_flexible: false, available_from: '06:00', available_to: '12:00' };
    case 'tardes_noches':
      return { schedule_flexible: false, available_from: '17:00', available_to: '22:00' };
    case 'fines_semana':
    case 'muy_limitada':
      return { schedule_flexible: false, available_from: null, available_to: null };
    default:
      return { schedule_flexible: null, available_from: null, available_to: null };
  }
}

// lesion_actual / lesion_zonas / lesiones_pasadas → injuries_json entries.
// Active injuries carry their body zone + severity; past injuries are inactive.
export function mapInjuries(
  actual?: string | null,
  zonas?: string[] | null,
  pasadas?: string[] | null,
): InjuryEntry[] {
  const out: InjuryEntry[] = [];
  const hasActive = actual != null && actual !== 'ninguna';
  if (hasActive) {
    const zs = (zonas ?? []).filter(Boolean);
    if (zs.length) {
      for (const z of zs) out.push({ area: z, type: actual!, active: true });
    } else {
      out.push({ area: 'general', type: actual!, active: true });
    }
  }
  for (const past of (pasadas ?? []).filter((p) => p && p !== 'ninguna')) {
    out.push({ area: past, type: 'antecedente', active: false });
  }
  return out;
}

// ── Target race ────────────────────────────────────────────────────────────
export interface FunnelTargetRace {
  name: string;
  event_type: 'hyrox' | 'deka' | 'other';
  format: 'singles' | 'doubles' | 'relay';
  division: 'open' | 'pro';
  gender_category: 'men' | 'women' | 'mixed';
  /**
   * ISO yyyy-mm-dd, or NULL when the athlete did not say WHEN. The column is
   * nullable and the coach pins the exact date once the athlete registers.
   */
  race_date: string | null;
}

const RACE_NAME_BY_CODE: Record<string, string> = {
  hyrox_barcelona: 'HYROX Barcelona',
  hyrox_madrid: 'HYROX Madrid',
  hyrox_valencia: 'HYROX Valencia',
  deka: 'DEKA',
};

// carrera_cuando → an approximate ISO race_date (the column is date; the coach
// pins the exact one later once the athlete registers). Midpoint-ish of the
// range the ATHLETE picked — an approximation of his own answer, not a guess in
// place of one. An unrecognised or absent answer maps to nothing.
const RACE_DAYS_BY_CODE: Record<string, number> = {
  menos_3m: 45,
  de_3_6m: 135,
  mas_6m: 240,
};

function isoDatePlusDays(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * Build the athlete's TARGET race from the funnel — only when they named a known
 * race (carrera_mente = 'si_se_cual' AND a recognised carrera_cual). Returns null
 * otherwise (unknown venue / undecided → no race row; the athlete picks one later).
 */
export function mapTargetRace(
  row: Record<string, unknown>,
  now: Date = new Date(),
): FunnelTargetRace | null {
  const s = (k: string) => (row[k] as string | null | undefined) ?? '';
  if (s('carrera_mente') !== 'si_se_cual') return null;
  const cual = s('carrera_cual');
  const name = RACE_NAME_BY_CODE[cual];
  if (!name) return null; // otra_fuera / unknown → skip (nothing valid to store)

  const event_type: FunnelTargetRace['event_type'] = cual === 'deka' ? 'deka' : 'hyrox';
  const cat = s('categoria_objetivo');
  const format: FunnelTargetRace['format'] =
    cat === 'dobles_open' || cat === 'dobles_pro' || cat === 'mixto' ? 'doubles' : 'singles';
  const division: FunnelTargetRace['division'] =
    cat === 'individual_pro' || cat === 'dobles_pro' ? 'pro' : 'open';
  const sexo = s('sexo');
  const gender_category: FunnelTargetRace['gender_category'] =
    format === 'doubles' ? 'mixed' : sexo === 'hombre' ? 'men' : sexo === 'mujer' ? 'women' : 'mixed';
  // No `?? 135`: an athlete who never answered WHEN was handed a race dated 4.5
  // months out, and that date is not cosmetic — it lands in `races` as his
  // TARGET, which drives every countdown, the taper and the readiness gates, and
  // can quietly become the "real" date nobody revisits. With no answer the race
  // is stored undated and the coach pins it. Same shape as the two `return null`
  // above: this function already refuses to invent the venue.
  const code = s('carrera_cuando');
  const days = Object.prototype.hasOwnProperty.call(RACE_DAYS_BY_CODE, code)
    ? RACE_DAYS_BY_CODE[code]
    : null;

  return {
    name,
    event_type,
    format,
    division,
    gender_category,
    race_date: days != null ? isoDatePlusDays(days, now) : null,
  };
}

// ── The structured profile carried onto the athlete row ──────────────────────
export interface FunnelProfileCarry {
  goal_type: OnboardingGoalType | null;
  facility_type: FacilityType | null;
  session_minutes: number | null;
  sleep_quality: number | null;
  stress_level: number | null;
  training_experience_years: number | null;
  watch_brand: DeviceType | null;
  watch_model: string | null;
  schedule_flexible: boolean | null;
  available_from: string | null;
  available_to: string | null;
  injuries: InjuryEntry[];
}

/** Map a raw `leads` row to the structured athlete carry (columns only; the race is separate). */
export function buildFunnelProfile(row: Record<string, unknown>): FunnelProfileCarry {
  const s = (k: string) => (row[k] as string | null | undefined) ?? null;
  const arr = (k: string) => (Array.isArray(row[k]) ? (row[k] as string[]) : null);
  const watch = mapWatch(s('wearable'));
  const avail = mapAvailability(s('flexibilidad_horaria'));
  return {
    goal_type: mapGoalType(s('objetivo')),
    facility_type: mapFacilityType(s('material')),
    session_minutes: mapSessionMinutes(s('duracion_sesion')),
    sleep_quality: mapSleepQuality(s('sueno')),
    stress_level: mapStressLevel(s('estres')),
    training_experience_years: mapExperienceYears(s('anos_entrenando')),
    watch_brand: watch.brand,
    watch_model: watch.model,
    schedule_flexible: avail.schedule_flexible,
    available_from: avail.available_from,
    available_to: avail.available_to,
    injuries: mapInjuries(s('lesion_actual'), arr('lesion_zonas'), arr('lesiones_pasadas')),
  };
}
