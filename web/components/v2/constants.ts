// v2 shared constants — single source of truth for the categorical axes the v2
// UI encodes with color (training modality) and the adherence thresholds. Kept
// as data (token var names + labels), never inline hex in components.

/** Training modality — the categorical axis encoded as a left-border / dot. */
export type V2Modality = 'carrera' | 'ergo' | 'fuerza' | 'circuito' | 'calentamiento';

export interface ModalityMeta {
  /** Coach-facing label (Spanish, brand voice). */
  label: string;
  /** CSS var for the solid hue (border / dot / text). */
  colorVar: string;
  /** CSS var for the low-alpha tint (soft fill / chip bg). */
  softVar: string;
}

/** slug ↔ label ↔ token. Source of truth for ModalityCard + any modality chip. */
export const MODALITY_META: Record<V2Modality, ModalityMeta> = {
  carrera: { label: 'Carrera', colorVar: '--v2-mod-carrera', softVar: '--v2-mod-carrera-soft' },
  ergo: { label: 'Ergómetro', colorVar: '--v2-mod-ergo', softVar: '--v2-mod-ergo-soft' },
  fuerza: { label: 'Fuerza', colorVar: '--v2-mod-fuerza', softVar: '--v2-mod-fuerza-soft' },
  circuito: { label: 'Circuito', colorVar: '--v2-mod-circuito', softVar: '--v2-mod-circuito-soft' },
  calentamiento: {
    label: 'Calentamiento',
    colorVar: '--v2-mod-calentamiento',
    softVar: '--v2-mod-calentamiento-soft',
  },
};

/** Adherence thresholds (%) — green ≥ 75 · amber 60–74 · red < 60. One source. */
export const ADHERENCE_GOOD_MIN = 75;
export const ADHERENCE_WARN_MIN = 60;

export type AdherenceBand = 'good' | 'warn' | 'bad';

export function adherenceBand(pct: number): AdherenceBand {
  if (pct >= ADHERENCE_GOOD_MIN) return 'good';
  if (pct >= ADHERENCE_WARN_MIN) return 'warn';
  return 'bad';
}

/** Token var for an adherence band's color (bar fill + % text). */
export const ADHERENCE_BAND_COLOR_VAR: Record<AdherenceBand, string> = {
  good: '--v2-ok',
  warn: '--v2-warn',
  bad: '--v2-danger',
};
