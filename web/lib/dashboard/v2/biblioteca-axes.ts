// v2 · BIBLIOTECA — client-safe filter axes. Holds the TWO orthogonal filter axes
// (POR MODALIDAD / POR OBJETIVO) and their type aliases. This module is free of any
// server-only dependency (no DB, no `server-only`), so client components can import
// the runtime constants without dragging the postgres driver into the browser bundle.
// The server loader (`biblioteca-data.ts`) re-exports these so there is still a single
// import surface for callers that also need the data loader.

import type { V2Modality } from '@/components/v2/constants';

// The library has TWO orthogonal filter axes (spec SCREEN 4 left rail):
//   · POR MODALIDAD — the training-modality color axis (Todas/Carrera/Ergómetro/
//     Fuerza/Circuito/Mixta). "Mixta" = formats that combine modalities (HYROX
//     sim, conditioning) where no single modality dominates.
//   · POR OBJETIVO — the training goal (Base·Z2 / Umbral / VO₂ / Fuerza máx).
// Both are CLOSED sets so a chip can never render an unknown key.

export type V2LibModalityFilter = V2Modality | 'mixta';
export type V2LibObjective = 'base_z2' | 'umbral' | 'vo2' | 'fuerza_max';

export const LIB_MODALITY_FILTERS: ReadonlyArray<{ id: 'todas' | V2LibModalityFilter; label: string }> = [
  { id: 'todas', label: 'Todas' },
  { id: 'carrera', label: 'Carrera' },
  { id: 'ergo', label: 'Ergómetro' },
  { id: 'fuerza', label: 'Fuerza' },
  { id: 'circuito', label: 'Circuito' },
  { id: 'mixta', label: 'Mixta' },
];

export const LIB_OBJECTIVES: ReadonlyArray<{ id: V2LibObjective; label: string }> = [
  { id: 'base_z2', label: 'Base · Z2' },
  { id: 'umbral', label: 'Umbral' },
  { id: 'vo2', label: 'VO₂' },
  { id: 'fuerza_max', label: 'Fuerza máx' },
];
