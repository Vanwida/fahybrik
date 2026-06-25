// Enum→label maps, weekday table, basal-state thresholds, and value formatters
// for the intake evidence rail. Pure data + pure functions (no React) — split
// out of IntakeEvidenceRail.tsx to keep that file under the project line cap.
// Mirrors the former IntakeAnswers enum → human copy.

export const GOAL_TYPE_LABELS: Record<string, string> = {
  first_hyrox: 'Primera HYROX',
  improve_hyrox_mark: 'Mejorar marca HYROX',
  improve_running: 'Mejorar carrera',
  complete_fun: 'Completar / disfrutar',
  other: 'Otro',
};
export const RUN_EXPERIENCE_LABELS: Record<string, string> = {
  enthusiast: 'Le encanta correr',
  comfortable: 'Cómodo corriendo',
  reluctant: 'Corre a regañadientes',
  none: 'Sin experiencia',
};
export const STRENGTH_EXPERIENCE_LABELS: Record<string, string> = {
  loves_lifting: 'Le encanta la fuerza',
  weekly_ish: 'Fuerza semanal',
  with_guidance: 'Fuerza con guía',
  none: 'Sin experiencia',
};
export const AVAILABILITY_LABELS: Record<string, string> = {
  program: 'Programa',
  other_activity: 'Otra',
  rest: 'Libre',
};
export const PREFERRED_TYPE_LABELS: Record<string, string> = {
  isolated_run: 'Carrera',
  strength_gym: 'Fuerza',
  hyrox_transitions: 'HYROX',
  ergo_conditioning: 'Ergo',
  specific_material: 'Material',
};
export const EQUIPMENT_LABELS: Record<string, string> = {
  barbells_plates: 'Barras y discos',
  dumbbells: 'Mancuernas',
  sleds: 'Trineos',
  bags_kb: 'Sacos / kettlebells',
  open_space: 'Espacio abierto',
  pulleys: 'Poleas',
  treadmill: 'Cinta',
  stationary_bike: 'Bici estática',
  rower: 'Remo',
  skierg: 'SkiErg',
  other: 'Otro',
};
export const MISSING_TAG_LABELS: Record<string, string> = {
  ski_erg: 'SkiErg',
  rower: 'Remo',
  sled: 'Trineo',
  assault_bike: 'Assault bike',
  bike_erg: 'BikeErg',
};
export const SEVERITY_LABELS: Record<string, string> = {
  mild: 'Leve',
  moderate: 'Moderada',
  severe: 'Severa',
};
export const FACILITY_TYPE_LABELS: Record<string, string> = {
  commercial_gym: 'Gimnasio comercial',
  crossfit_box: 'Box de CrossFit',
  multiple: 'Varias instalaciones',
  other: 'Otra',
};
export const ACHIEVABLE_LABELS: Record<string, string> = {
  yes: 'Sí',
  no: 'No',
  unknown: 'No lo sabe',
};
export const RACE_PRIORITY_LABELS: Record<string, string> = {
  target: 'Objetivo',
  secondary: 'Secundaria',
  tune_up: 'Tune-up',
};
export const RACE_EVENT_TYPE_LABELS: Record<string, string> = {
  hyrox: 'HYROX',
  deka: 'DEKA',
  other: 'Otra',
};

export const WEEKDAYS: ReadonlyArray<{ key: string; short: string }> = [
  { key: 'mon', short: 'L' },
  { key: 'tue', short: 'M' },
  { key: 'wed', short: 'X' },
  { key: 'thu', short: 'J' },
  { key: 'fri', short: 'V' },
  { key: 'sat', short: 'S' },
  { key: 'sun', short: 'D' },
];

export const LOW_SLEEP_THRESHOLD = 4;
export const HIGH_STRESS_THRESHOLD = 7;
export const EMPTY = '—';

export function labelOr(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return EMPTY;
  return map[key] ?? key;
}

export function formatSeconds(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null) return EMPTY;
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function yesNo(v: boolean | null | undefined): string {
  if (v == null) return EMPTY;
  return v ? 'Sí' : 'No';
}
