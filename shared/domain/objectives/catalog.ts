import type { EventType } from '../../schema/_primitives';
import type { EventSeries } from '../../schema/events';

// ── Familia del picker (Running · Híbrida · CrossFit · OCR · Otro) ───────────
// Derivada de type + series — no es columna DB. Un solo mapa para web + iOS
// (exportar constantes; iOS replica labels en UI).

export const eventFamilyValues = ['running', 'hybrid', 'crossfit', 'ocr', 'other'] as const;
export type EventFamily = (typeof eventFamilyValues)[number];

export const EVENT_FAMILY_LABEL_ES: Record<EventFamily, string> = {
  running: 'Running',
  hybrid: 'Híbrida',
  crossfit: 'CrossFit',
  ocr: 'OCR',
  other: 'Otro',
};

const HYBRID_SERIES = new Set<EventSeries>([
  'hyrox',
  'deka',
  'athx',
  'deadly_dozen',
  'hunter_race',
]);

const CROSSFIT_SERIES = new Set<EventSeries>([
  'cf_open',
  'cf_quarterfinals',
  'cf_semifinals',
  'cf_games',
  'cf_throwdown',
  'wodapalooza',
]);

const OCR_SERIES = new Set<EventSeries>(['spartan']);

/** Deriva la familia UI a partir del type + series del catálogo. */
export function eventFamily(type: EventType, series: string | null | undefined): EventFamily {
  const s = (series ?? '') as EventSeries;
  if (type === 'crossfit' || CROSSFIT_SERIES.has(s)) return 'crossfit';
  if (type === 'hyrox' || HYBRID_SERIES.has(s)) return 'hybrid';
  if (type === 'running' || s === 'rfea') return 'running';
  if (type === 'ocr' || OCR_SERIES.has(s)) return 'ocr';
  return 'other';
}

/** true ⇔ el objetivo puede usar el goal-gap HYROX (8 carreras + 8 estaciones). */
export function supportsHyroxGoalGap(eventType: string | null | undefined): boolean {
  return (eventType ?? '').toLowerCase() === 'hyrox';
}

// ── Hunter Race (hunter-race.com) ─────────────────────────────────────────────

export const hunterRaceVariants = ['legend', 'alpha', 'sprinter'] as const;
export type HunterRaceVariant = (typeof hunterRaceVariants)[number];

export const HUNTER_RACE_VARIANTS: ReadonlyArray<{
  id: HunterRaceVariant;
  label: string;
  distance_km: number;
  stations: number;
}> = [
  { id: 'legend', label: 'Legend', distance_km: 13, stations: 7 },
  { id: 'alpha', label: 'Alpha', distance_km: 7, stations: 7 },
  { id: 'sprinter', label: 'Sprinter', distance_km: 3.5, stations: 7 },
];

// ── Running — distancias preset (metros) ──────────────────────────────────────

export const runningDistancePresets = ['5k', '10k', 'half', 'marathon', 'custom'] as const;
export type RunningDistancePreset = (typeof runningDistancePresets)[number];

export const RUNNING_DISTANCE_PRESETS: ReadonlyArray<{
  id: RunningDistancePreset;
  label: string;
  meters: number | null;
}> = [
  { id: '5k', label: '5 km', meters: 5000 },
  { id: '10k', label: '10 km', meters: 10000 },
  { id: 'half', label: '21,1 km', meters: 21100 },
  { id: 'marathon', label: '42,2 km', meters: 42200 },
  { id: 'custom', label: 'Otra distancia', meters: null },
];

// ── CrossFit — tipos de competición (series whitelist) ──────────────────────

export const CROSSFIT_SERIES_OPTIONS: ReadonlyArray<{ series: EventSeries; label: string }> = [
  { series: 'cf_open', label: 'Open' },
  { series: 'cf_quarterfinals', label: 'Quarterfinals' },
  { series: 'cf_semifinals', label: 'Semifinals' },
  { series: 'cf_games', label: 'Games' },
  { series: 'cf_throwdown', label: 'Throwdown' },
  { series: 'wodapalooza', label: 'Wodapalooza' },
  { series: 'other', label: 'Otro' },
];

/** Etiqueta legible para una series token (sin hardcodear marcas en copy dinámico). */
export function seriesDisplayLabel(series: string | null | undefined): string | null {
  if (!series) return null;
  const cf = CROSSFIT_SERIES_OPTIONS.find((o) => o.series === series);
  if (cf) return cf.label;
  switch (series) {
    case 'hyrox':
      return 'HYROX';
    case 'deka':
      return 'DEKA';
    case 'athx':
      return 'AthX';
    case 'deadly_dozen':
      return 'Deadly Dozen';
    case 'hunter_race':
      return 'Hunter Race';
    case 'rfea':
      return 'RFEA';
    case 'spartan':
      return 'Spartan';
    case 'other':
      return 'Otro';
    default:
      return series.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
