import type {
  NextRace,
  RaceDivision,
  RaceFormat,
  RaceGender,
  RacePriority,
} from '@fahybrid/shared/schema';

// ─────────────────────────────────────────────────────────────────────────────
// Spanish race labels + formatters — single source of truth for every coach
// race surface (athletes-list countdown badge + ficha race section).
//
// NOTE: the backend's `raceCategoryLabel` (lib/races/next-race.ts) emits ENGLISH
// ("HYROX · Singles · Open · Men") for the iOS/API contract. The coach dashboard
// is Spanish, so the UI builds its own category line from these maps — do NOT
// reuse the English helper here.
//
// This module is client-safe (no `server-only`): the ficha race section is a
// client component and imports these formatters directly.
// ─────────────────────────────────────────────────────────────────────────────

export const RACE_FORMAT_LABEL: Record<RaceFormat, string> = {
  singles: 'Individual',
  doubles: 'Dobles',
  relay: 'Relevos',
};

export const RACE_DIVISION_LABEL: Record<RaceDivision, string> = {
  open: 'Open',
  pro: 'Pro',
  elite: 'Elite',
};

export const RACE_GENDER_LABEL: Record<RaceGender, string> = {
  men: 'Hombres',
  women: 'Mujeres',
  mixed: 'Mixto',
};

export const RACE_PRIORITY_LABEL: Record<RacePriority, string> = {
  target: 'Objetivo',
  secondary: 'Secundaria',
  tune_up: 'Intermedia',
};

/**
 * "Individual · Open · Hombres" — the category line from a race's
 * format/division/gender. Used in the ficha target highlight + each calendar row.
 */
export function raceCategoryLineEs(race: {
  format: RaceFormat;
  division: RaceDivision;
  gender_category: RaceGender;
}): string {
  return [
    RACE_FORMAT_LABEL[race.format],
    RACE_DIVISION_LABEL[race.division],
    RACE_GENDER_LABEL[race.gender_category],
  ].join(' · ');
}

/**
 * Seconds → "H:MM:SS" (e.g. 4530 → "1:15:30"). Returns null for null/non-positive
 * input so callers can omit the line entirely. Goal/result times are stored as a
 * positive int count of seconds; hours are never zero-padded.
 */
export function formatRaceTime(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(s)}`;
}

/**
 * days_until → human countdown. `days_until` = race_date − today (box tz), so it
 * is never negative on surfaced races. 0 = today.
 */
export function formatDaysUntil(days: number): string {
  if (days <= 0) return '¡hoy!';
  if (days === 1) return 'faltan 1 día';
  return `faltan ${days} días`;
}

/** Compact "· N días" / "· hoy" suffix for the tight list badge. */
export function formatDaysUntilShort(days: number): string {
  if (days <= 0) return 'hoy';
  return `${days} día${days === 1 ? '' : 's'}`;
}

/** Spanish category line for a full NextRace (convenience for the ficha header). */
export function nextRaceCategoryLineEs(race: NextRace): string {
  return raceCategoryLineEs(race);
}
