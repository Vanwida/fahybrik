// Methodology group identity colors — single source of truth for the
// programming studio's color-coding (MEANING, not decoration). Maps each of
// Pablo's 10 pedagogical groups (methodology_groups 1–10, see migration 0030)
// to a CSS color token + a short coach-facing chip label.
//
// Color is applied as a block's LEFT ACCENT BAR + a small group chip so the
// coach can scan a week by training type. The brand orange (--accent) is
// RESERVED for selection/brand and is intentionally absent here. Color is never
// the only signal — the chip LABEL disambiguates for color-blind safety.
//
// The CSS variables themselves live in app/globals.css (--grp-<slug> +
// --grp-<slug>-tint). This map keeps the id ↔ slug ↔ token ↔ label binding in
// one place so the canvas, chips and any future legend stay consistent.

/** The 10 methodology group slugs, ordered by methodology_groups.id (1–10). */
export const METHODOLOGY_GROUP_SLUGS = [
  'fuerza-base',
  'fuerza-explosiva-pliometrica',
  'series-ergometros',
  'series-running',
  'zona2-recuperacion',
  'wods-metcons',
  'simulaciones-carrera',
  'core-movilidad-preventivos',
  'circuitos-funcionales',
  'tapering-activacion',
] as const;

export type MethodologyGroupSlug = (typeof METHODOLOGY_GROUP_SLUGS)[number];

export interface GroupColor {
  /** methodology_groups.id (1–10). */
  id: number;
  slug: MethodologyGroupSlug;
  /** `var(--grp-<slug>)` — solid hue for the left bar + chip text/rule. */
  color: string;
  /** `var(--grp-<slug>-tint)` — low-alpha fill for the chip background. */
  tint: string;
  /** Short coach-facing label for the group chip (carries the meaning). */
  label: string;
}

/** Neutral identity for ad-hoc blocks with no methodology group (e.g. estructura). */
export const NEUTRAL_GROUP_COLOR: Pick<GroupColor, 'color' | 'tint' | 'label'> = {
  color: 'var(--grp-none)',
  tint: 'var(--grp-none-tint)',
  label: 'A medida',
};

/** id → { slug, color token, tint token, short chip label }. */
export const GROUP_COLORS: Record<number, GroupColor> = {
  1: { id: 1, slug: 'fuerza-base', color: 'var(--grp-fuerza-base)', tint: 'var(--grp-fuerza-base-tint)', label: 'Fuerza' },
  2: { id: 2, slug: 'fuerza-explosiva-pliometrica', color: 'var(--grp-fuerza-explosiva-pliometrica)', tint: 'var(--grp-fuerza-explosiva-pliometrica-tint)', label: 'Pliometría' },
  3: { id: 3, slug: 'series-ergometros', color: 'var(--grp-series-ergometros)', tint: 'var(--grp-series-ergometros-tint)', label: 'Ergómetros' },
  4: { id: 4, slug: 'series-running', color: 'var(--grp-series-running)', tint: 'var(--grp-series-running-tint)', label: 'Running' },
  5: { id: 5, slug: 'zona2-recuperacion', color: 'var(--grp-zona2-recuperacion)', tint: 'var(--grp-zona2-recuperacion-tint)', label: 'Zona 2' },
  6: { id: 6, slug: 'wods-metcons', color: 'var(--grp-wods-metcons)', tint: 'var(--grp-wods-metcons-tint)', label: 'Metcon' },
  7: { id: 7, slug: 'simulaciones-carrera', color: 'var(--grp-simulaciones-carrera)', tint: 'var(--grp-simulaciones-carrera-tint)', label: 'Simulación' },
  8: { id: 8, slug: 'core-movilidad-preventivos', color: 'var(--grp-core-movilidad-preventivos)', tint: 'var(--grp-core-movilidad-preventivos-tint)', label: 'Core' },
  9: { id: 9, slug: 'circuitos-funcionales', color: 'var(--grp-circuitos-funcionales)', tint: 'var(--grp-circuitos-funcionales-tint)', label: 'Circuito' },
  10: { id: 10, slug: 'tapering-activacion', color: 'var(--grp-tapering-activacion)', tint: 'var(--grp-tapering-activacion-tint)', label: 'Tapering' },
};

/**
 * Resolve the color identity for a block's methodology group. Returns the
 * neutral fallback (no specific group) for ad-hoc/estructura blocks where
 * `methodology_group_id` is null/undefined or out of range.
 */
export function groupColorFor(
  methodologyGroupId: number | null | undefined,
): Pick<GroupColor, 'color' | 'tint' | 'label'> {
  if (methodologyGroupId == null) return NEUTRAL_GROUP_COLOR;
  return GROUP_COLORS[methodologyGroupId] ?? NEUTRAL_GROUP_COLOR;
}
