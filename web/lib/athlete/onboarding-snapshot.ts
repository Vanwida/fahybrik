// EL CUESTIONARIO DE ENTRADA, LEÍDO RESPUESTA A RESPUESTA.
//
// El hueco (auditoría de la app del atleta, F-01): el atleta contesta 19
// pantallas, ve «Listo», y si UNA respuesta no cabía en el esquema el servidor
// rechazaba el cuestionario ENTERO con un 400 — que la app descarta en silencio.
// Se perdían marcas, carreras, lesiones y disponibilidad, el coach nunca veía
// «Alta pendiente» y el atleta no volvía a ver el cuestionario. Reproducible con
// el deslizador «¿Cuánto depende de ti?» en «Nada» (0), que la app permite. Y
// había tres respuestas que ni siquiera daban 400 sino 500 (la base las
// rechazaba al guardar): no marcar ningún día como «Programa» (0 días), un 1RM de
// 0 kg y «Triatlón» como disciplina.
//
// Ahora cada respuesta se valida SOLA. La que no cabe se recorta (un texto largo)
// o se descarta (un número imposible, un valor que no existe), queda anotada
// para el coach («respuesta fuera de rango», con lo que llegó) y el resto se
// guarda. Solo un cuerpo sin cuestionario es un 400.
//
// Recortar un número al borde (una altura de 300 → 260) sería inventar un dato:
// un número imposible se descarta y se enseña tal cual llegó.

import { z } from 'zod';

const MAX_FREE_TEXT_CHARS = 4_000;
const MAX_PASSTHROUGH_ARRAY_ITEMS = 64;
/** Muy por encima del cuestionario legítimo (~95 claves); tope contra el relleno. */
export const MAX_SNAPSHOT_KEYS = 128;
const MAX_INJURIES = 32;
const MAX_RACES = 12;

const intRange = (min: number, max: number) => z.number().int().min(min).max(max);
/** Escala subjetiva 1–10. */
const scale1to10 = intRange(1, 10);
/** Una fecha de calendario que Postgres acepta (`::date`), no solo con forma. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  });
/** HH:MM de un día (`::time`). */
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** Una marca de tiempo: 0 segundos no es una marca. */
const seconds = (max: number) => intRange(1, max);
/** Un 1RM: 0 kg no es una marca (y `athlete_strength_maxes` exige > 0). */
const kg = (max: number) => z.number().positive().max(max);

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Los valores de `discipline` en la base (0271 añade `triathlon`, que la app ofrece). */
export const DISCIPLINES = ['hyrox', 'crossfit', 'hybrid', 'running', 'triathlon', 'strength', 'other'] as const;

const dayAvailabilitySchema = z.enum(['program', 'other_activity', 'rest']);
const preferredTypeSchema = z.enum([
  'isolated_run',
  'strength_gym',
  'hyrox_transitions',
  'ergo_conditioning',
  'specific_material',
]);
const equipmentSchema = z.enum([
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
]);
const watchBrandSchema = z.enum(['apple_watch', 'garmin', 'polar', 'coros', 'suunto', 'whoop', 'oura', 'other']);

const injurySchema = z.object({
  area: z.string().min(1).max(80),
  type: z.string().max(80),
  active: z.boolean(),
  note: z.string().max(500).optional(),
});
export type OnboardingInjury = z.infer<typeof injurySchema>;

const raceSchema = z.object({
  name: z.string().min(1).max(200),
  event_type: z.enum(['hyrox', 'deka', 'other']),
  format: z.enum(['singles', 'doubles', 'relay']),
  division: z.enum(['open', 'pro']),
  gender_category: z.enum(['men', 'women', 'mixed']),
  priority: z.enum(['target', 'secondary', 'tune_up']),
  race_date: isoDate,
  location: z.string().max(200).optional(),
  goal_time_seconds: seconds(86_400).optional(),
});
export type OnboardingRace = z.infer<typeof raceSchema>;

/**
 * Cada respuesta MODELADA con el dominio que la base acepta. Los rangos repiten
 * los CHECK de `athletes` y las cotas sanas de cada marca.
 */
const FIELD_SCHEMAS = {
  full_name: z.string().max(200),
  date_of_birth: isoDate,
  sex: z.enum(['male', 'female', 'other']),
  height_cm: z.number().min(80).max(260),
  weight_kg: z.number().min(25).max(250),

  goal_type: z.enum(['first_hyrox', 'improve_hyrox_mark', 'improve_running', 'complete_fun', 'other']),
  goal_other_text: z.string().max(500),
  run_experience: z.enum(['enthusiast', 'comfortable', 'reluctant', 'none']),
  strength_experience: z.enum(['loves_lifting', 'weekly_ish', 'with_guidance', 'none']),

  sleep_quality: scale1to10,
  stress_level: scale1to10,
  commitment_level: scale1to10,

  movement_limitations: z.string().max(MAX_FREE_TEXT_CHARS),

  available_from: timeOfDay,
  available_to: timeOfDay,
  session_minutes: intRange(10, 360),
  schedule_flexible: z.boolean(),

  facility_type: z.enum(['commercial_gym', 'crossfit_box', 'multiple', 'other']),
  facility_other_text: z.string().max(500),
  has_track: z.boolean(),
  has_flat_run: z.boolean(),

  watch_brand: watchBrandSchema,
  watch_model: z.string().max(500),
  has_hr_belt: z.boolean(),

  goal_short: z.string().max(MAX_FREE_TEXT_CHARS),
  goal_mid: z.string().max(MAX_FREE_TEXT_CHARS),
  goal_long: z.string().max(MAX_FREE_TEXT_CHARS),
  achievable_2_4_months: z.enum(['yes', 'no', 'unknown']),
  biggest_obstacle: z.string().max(MAX_FREE_TEXT_CHARS),
  // 0 = «Nada»: la app lo ofrece y es una respuesta (0271 abre la columna a 0).
  pct_depends_on_me: intRange(0, 10),
  coach_role: z.string().max(MAX_FREE_TEXT_CHARS),

  one_rm_back_squat_kg: kg(500),
  one_rm_deadlift_kg: kg(500),
  one_rm_bench_press_kg: kg(400),
  one_rm_ohp_kg: kg(300),
  one_rm_clean_kg: kg(300),
  one_rm_snatch_kg: kg(250),
  strict_pull_ups_max: intRange(0, 100),
  push_ups_per_minute: intRange(0, 200),

  time_5k_seconds: seconds(14_400),
  time_10k_seconds: seconds(28_800),
  time_half_seconds: seconds(43_200),
  time_marathon_seconds: seconds(86_400),
  time_2k_row_seconds: seconds(3_600),
  time_1k_ski_seconds: seconds(1_800),
  time_1k_row_seconds: seconds(1_800),
  hybrid_tests_notes: z.string().max(MAX_FREE_TEXT_CHARS),

  lthr_bpm: intRange(80, 220),
  max_hr_bpm: intRange(100, 230),
  ftp_watts: intRange(30, 700),
  threshold_pace_seconds_per_km: intRange(120, 1_200),
  time_1_mile_seconds: intRange(180, 3_600),

  hyrox_best_time_seconds: seconds(14_400),

  healthkit_granted: z.boolean(),
  garmin_connected: z.boolean(),

  training_years: z.number().int().min(0).max(80),
  training_level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  hours_per_week: z.number().int().min(0).max(40),
  primary_discipline: z.enum(DISCIPLINES),
  days_per_week: z.number().int().min(1).max(14),
} as const;

type FieldKey = keyof typeof FIELD_SCHEMAS;
type Fields = { [K in FieldKey]?: z.infer<(typeof FIELD_SCHEMAS)[K]> };

/** El cuestionario ya leído: solo respuestas que caben (más las no modeladas, acotadas). */
export type OnboardingSnapshot = Fields & {
  injuries?: OnboardingInjury[];
  availability?: Partial<Record<(typeof WEEKDAYS)[number], z.infer<typeof dayAvailabilitySchema>>>;
  preferred_week?: Partial<Record<(typeof WEEKDAYS)[number], Array<z.infer<typeof preferredTypeSchema>>>>;
  equipment?: Array<z.infer<typeof equipmentSchema>>;
  hyrox_divisions?: string[];
  races?: OnboardingRace[];
  [extra: string]: unknown;
};

/** Una respuesta que no cabía, y qué se hizo con ella. La lee el coach en el alta. */
export interface IntakeAnswerIssue {
  /** La clave del cuestionario (`pct_depends_on_me`, `races[0].goal_time_seconds`…). */
  field: string;
  /** Lo que llegó, acotado para enseñarlo (un texto largo, sus primeros caracteres). */
  value: string | number | boolean | null;
  /** `descartada` = no se guardó; `recortada` = se guardó acortada. */
  action: 'descartada' | 'recortada';
}

/** Lo que llegó, en una forma que se puede guardar y enseñar sin inflar la fila. */
function preview(value: unknown): IntakeAnswerIssue['value'] {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 80)}…` : value;
  try {
    const text = JSON.stringify(value);
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  } catch {
    return String(value);
  }
}

const TEXT_LIMITS: Partial<Record<FieldKey, number>> = {
  full_name: 200,
  goal_other_text: 500,
  facility_other_text: 500,
  watch_model: 500,
  movement_limitations: MAX_FREE_TEXT_CHARS,
  goal_short: MAX_FREE_TEXT_CHARS,
  goal_mid: MAX_FREE_TEXT_CHARS,
  goal_long: MAX_FREE_TEXT_CHARS,
  biggest_obstacle: MAX_FREE_TEXT_CHARS,
  coach_role: MAX_FREE_TEXT_CHARS,
  hybrid_tests_notes: MAX_FREE_TEXT_CHARS,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Lee el cuestionario respuesta a respuesta. `null` solo si no hay cuestionario
 * (no es un objeto): eso es lo único que sigue siendo un 400.
 */
export function readOnboardingSnapshot(
  raw: unknown,
): { snapshot: OnboardingSnapshot; issues: IntakeAnswerIssue[] } | null {
  if (!isRecord(raw)) return null;
  const snapshot: OnboardingSnapshot = {};
  const issues: IntakeAnswerIssue[] = [];
  const drop = (field: string, value: unknown) => issues.push({ field, value: preview(value), action: 'descartada' });
  const cut = (field: string, value: unknown) => issues.push({ field, value: preview(value), action: 'recortada' });

  let extras = 0;
  for (const [key, value] of Object.entries(raw)) {
    // Una respuesta sin contestar viaja como ausencia; un null explícito es lo mismo.
    if (value === undefined || value === null) continue;

    if (key in FIELD_SCHEMAS) {
      const field = key as FieldKey;
      const parsed = FIELD_SCHEMAS[field].safeParse(value);
      if (parsed.success) {
        (snapshot as Record<string, unknown>)[field] = parsed.data;
        continue;
      }
      const limit = TEXT_LIMITS[field];
      if (limit != null && typeof value === 'string') {
        (snapshot as Record<string, unknown>)[field] = clip(value, limit);
        cut(field, value);
        continue;
      }
      drop(field, value);
      continue;
    }

    switch (key) {
      case 'injuries':
        snapshot.injuries = readInjuries(value, drop, cut);
        continue;
      case 'races':
        snapshot.races = readRaces(value, drop, cut);
        continue;
      case 'availability':
        snapshot.availability = readWeekMap(value, 'availability', dayAvailabilitySchema, drop);
        continue;
      case 'preferred_week':
        snapshot.preferred_week = readPreferredWeek(value, drop);
        continue;
      case 'equipment':
        snapshot.equipment = readList(value, 'equipment', equipmentSchema, 16, drop);
        continue;
      case 'hyrox_divisions':
        snapshot.hyrox_divisions = readList(value, 'hyrox_divisions', z.string().max(40), 8, drop);
        continue;
    }

    // Respuestas no modeladas (el borrador plano de siempre: station_*, a_event_*…):
    // escalares y listas de textos, acotados; nada anidado, y no sin límite de claves.
    if (extras >= MAX_SNAPSHOT_KEYS) {
      drop(key, value);
      continue;
    }
    const extra = readExtra(value);
    if (extra === undefined) {
      drop(key, value);
      continue;
    }
    if (extra.clipped) cut(key, value);
    snapshot[key] = extra.value;
    extras += 1;
  }

  return { snapshot, issues };
}

type Report = (field: string, value: unknown) => void;

function readInjuries(value: unknown, drop: Report, cut: Report): OnboardingInjury[] | undefined {
  if (!Array.isArray(value)) {
    drop('injuries', value);
    return undefined;
  }
  const out: OnboardingInjury[] = [];
  value.forEach((item, i) => {
    const field = `injuries[${i}]`;
    if (out.length >= MAX_INJURIES) return drop(field, item);
    const parsed = injurySchema.safeParse(item);
    if (parsed.success) return void out.push(parsed.data);
    if (!isRecord(item) || typeof item.area !== 'string' || item.area.trim() === '') return drop(field, item);
    // Una lesión con textos largos se guarda recortada: la zona es lo que importa.
    const area = clip(item.area, 80);
    const type = typeof item.type === 'string' ? clip(item.type, 80) : '';
    const note = typeof item.note === 'string' ? clip(item.note, 500) : undefined;
    const active = typeof item.active === 'boolean' ? item.active : true;
    cut(field, item);
    out.push({ area, type, active, ...(note != null ? { note } : {}) });
  });
  return out;
}

function readRaces(value: unknown, drop: Report, cut: Report): OnboardingRace[] | undefined {
  if (!Array.isArray(value)) {
    drop('races', value);
    return undefined;
  }
  const out: OnboardingRace[] = [];
  value.forEach((item, i) => {
    const field = `races[${i}]`;
    if (out.length >= MAX_RACES) return drop(field, item);
    const parsed = raceSchema.safeParse(item);
    if (parsed.success) return void out.push(parsed.data);
    if (!isRecord(item)) return drop(field, item);
    // Lo que sobra se quita (un tiempo objetivo imposible, un nombre largo); la
    // carrera se queda si lo que la identifica (nombre, fecha, tipo) cabe.
    const repaired: Record<string, unknown> = { ...item };
    if (typeof item.name === 'string' && item.name.length > 200) {
      repaired.name = clip(item.name, 200);
      cut(`${field}.name`, item.name);
    }
    if (typeof item.location === 'string' && item.location.length > 200) {
      repaired.location = clip(item.location, 200);
      cut(`${field}.location`, item.location);
    }
    if (item.goal_time_seconds != null && !seconds(86_400).safeParse(item.goal_time_seconds).success) {
      delete repaired.goal_time_seconds;
      drop(`${field}.goal_time_seconds`, item.goal_time_seconds);
    }
    if (item.location != null && typeof item.location !== 'string') delete repaired.location;
    const again = raceSchema.safeParse(repaired);
    if (again.success) return void out.push(again.data);
    drop(field, item);
  });
  return out;
}

function readWeekMap<T extends z.ZodTypeAny>(
  value: unknown,
  name: string,
  item: T,
  drop: Report,
): Partial<Record<(typeof WEEKDAYS)[number], z.infer<T>>> | undefined {
  if (!isRecord(value)) {
    drop(name, value);
    return undefined;
  }
  const out: Partial<Record<(typeof WEEKDAYS)[number], z.infer<T>>> = {};
  for (const [day, v] of Object.entries(value)) {
    const known = (WEEKDAYS as readonly string[]).includes(day);
    const parsed = item.safeParse(v);
    if (known && parsed.success) out[day as (typeof WEEKDAYS)[number]] = parsed.data;
    else drop(`${name}.${day}`, v);
  }
  return out;
}

function readPreferredWeek(value: unknown, drop: Report): OnboardingSnapshot['preferred_week'] {
  if (!isRecord(value)) {
    drop('preferred_week', value);
    return undefined;
  }
  const out: NonNullable<OnboardingSnapshot['preferred_week']> = {};
  for (const [day, v] of Object.entries(value)) {
    if (!(WEEKDAYS as readonly string[]).includes(day)) {
      drop(`preferred_week.${day}`, v);
      continue;
    }
    const kept = readList(v, `preferred_week.${day}`, preferredTypeSchema, 5, drop);
    if (kept) out[day as (typeof WEEKDAYS)[number]] = kept;
  }
  return out;
}

function readList<T extends z.ZodTypeAny>(
  value: unknown,
  name: string,
  item: T,
  max: number,
  drop: Report,
): Array<z.infer<T>> | undefined {
  if (!Array.isArray(value)) {
    drop(name, value);
    return undefined;
  }
  const out: Array<z.infer<T>> = [];
  value.forEach((v, i) => {
    const parsed = item.safeParse(v);
    if (parsed.success && out.length < max) out.push(parsed.data);
    else drop(`${name}[${i}]`, v);
  });
  return out;
}

/** Un valor no modelado: escalar o lista de textos, acotado. `undefined` = no se guarda. */
function readExtra(value: unknown): { value: unknown; clipped: boolean } | undefined {
  if (typeof value === 'boolean') return { value, clipped: false };
  if (typeof value === 'number') return Number.isFinite(value) ? { value, clipped: false } : undefined;
  if (typeof value === 'string') {
    return { value: clip(value, MAX_FREE_TEXT_CHARS), clipped: value.length > MAX_FREE_TEXT_CHARS };
  }
  if (Array.isArray(value)) {
    const strings = value.filter((v): v is string => typeof v === 'string');
    const kept = strings.slice(0, MAX_PASSTHROUGH_ARRAY_ITEMS).map((s) => clip(s, MAX_FREE_TEXT_CHARS));
    const clipped =
      strings.length !== value.length ||
      strings.length > MAX_PASSTHROUGH_ARRAY_ITEMS ||
      strings.some((s) => s.length > MAX_FREE_TEXT_CHARS);
    return { value: kept, clipped };
  }
  return undefined;
}
