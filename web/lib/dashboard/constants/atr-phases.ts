import type { AtrBlockType } from '@fahybrid/shared/domain/atr/planner';

// Canonical ATR phase nomenclature — ground truth: Documento Maestro, sección 4
// (Modalidad Pro / Elite, p.7): "fases específicas de acumulación, intensificación
// y tapering". Single source of truth for the full-word labels shown in the UI.
// Short keys (ACC/TRANS/REAL) stay as internal codes / compact badges — Pablo knows them.
export const ATR_PHASE_LABEL: Record<AtrBlockType, string> = {
  ACC: 'Acumulación',
  TRANS: 'Intensificación',
  REAL: 'Tapering',
};

/** Returns the full-word phase label, or the raw key if unknown. */
export function atrPhaseLabel(key: string): string {
  return ATR_PHASE_LABEL[key as AtrBlockType] ?? key;
}

// Descripción pedagógica de una línea por fase — alimenta el glosario ATR inline
// del board (fricción F10: la jerga ATR no estaba explicada). Misma fuente de
// verdad que los labels; no inventar nomenclatura nueva.
export const ATR_PHASE_DESCRIPTION: Record<AtrBlockType, string> = {
  ACC: 'Volumen alto, intensidad moderada. Construir base.',
  TRANS: 'Sube intensidad, baja volumen. Trabajo específico.',
  REAL: 'Descarga previa a competir. Afinar y recuperar.',
};

export function atrPhaseDescription(key: string): string | null {
  return ATR_PHASE_DESCRIPTION[key as AtrBlockType] ?? null;
}

/** Orden canónico ACC → TRANS → REAL para listar las fases en el glosario. */
export const ATR_PHASE_ORDER: AtrBlockType[] = ['ACC', 'TRANS', 'REAL'];

/**
 * Clases Tailwind del badge de fase ATR (chip pill). Codificación ÚNICA en todo
 * el dashboard: ACC verde (base/volumen) · TRANS ámbar (intensidad) · REAL
 * naranja Fabrik (pico/competición). Antes duplicado en el hub de microciclos
 * y el catálogo de entrenos (regla DRY: 3 usos → extraer).
 */
export function atrBadgeClass(hint: string | null | undefined): string {
  switch (hint) {
    case 'ACC':
      return 'border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10 text-[color:var(--status-success)]';
    case 'TRANS':
      return 'border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]';
    case 'REAL':
      return 'border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--accent)]';
    default:
      return 'border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] text-[color:var(--text-muted)]';
  }
}

export type { AtrBlockType };
