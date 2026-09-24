// Programar · vocabulario compartido de la rejilla: qué modalidad colorea un
// bloque clasificado con un grupo metodológico (1–10, dato heredado de los
// bloques importados) y los nombres de los días. Puro, cliente-seguro.

import type { V2Modality } from '@/components/v2/constants';

// ── methodology_group_id → modality ──────────────────────────────────────────
// The 10 coach groups (migration 0030) collapse onto the 5-hue modality axis.
// Source of truth; never inline this mapping in a component.
//   1 Fuerza Base · 2 Pliométrica            → fuerza
//   3 Series Ergómetros                       → ergo
//   4 Series Running · 5 Zona 2 / Recuperación→ carrera
//   6 WODs/Metcons · 7 Simulaciones · 9 Circuitos → circuito
//   8 Core/Movilidad · 10 Tapering            → calentamiento
const GROUP_TO_MODALITY: Record<number, V2Modality> = {
  1: 'fuerza',
  2: 'fuerza',
  3: 'ergo',
  4: 'carrera',
  5: 'carrera',
  6: 'circuito',
  7: 'circuito',
  8: 'calentamiento',
  9: 'circuito',
  10: 'calentamiento',
};

/** Map a methodology group id to its modality. Unknown / missing → null. */
export function modalityForGroup(group_id: number | null | undefined): V2Modality | null {
  if (group_id == null) return null;
  return GROUP_TO_MODALITY[group_id] ?? null;
}

// ── Spanish day labels (Mon→Sun) ─────────────────────────────────────────────
export const DAY_LABELS_FULL = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;
