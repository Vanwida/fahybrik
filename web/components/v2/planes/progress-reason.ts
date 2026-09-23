// Por qué «Progresar selección» no tiene nada que cambiar. Un botón gris que
// dice «Nada que cambiar» sin decir por qué deja al coach adivinando: aquí se
// mira lo que la selección tiene escrito y se dice qué falta.

import type { Prescription, Target } from '@fahybrid/shared/domain/prescription';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import { cellAt, type GridBounds, type GridRange } from '@/lib/dashboard/programming/grid-model';
import { itemPrescription } from '@/lib/dashboard/programming/progress-ops';

export type ProgressMode = 'load' | 'sets' | 'deload';

const isLoad = (t: Target | undefined) => t?.kind === 'percent_rm' || t?.kind === 'kg';

function hasLoad(p: Prescription): boolean {
  return isLoad(p.target) || (p.sets ?? []).some((s) => !s.is_approach && isLoad(s.target));
}

function hasSets(p: Prescription): boolean {
  return (p.sets ?? []).some((s) => !s.is_approach) || p.rounds !== undefined;
}

function hasVolume(p: Prescription): boolean {
  const working = (p.sets ?? []).filter((s) => !s.is_approach);
  if (working.length > 1 || (p.rounds ?? 0) > 1) return true;
  if (p.total_s !== undefined && (p.scheme === 'steady' || p.scheme === 'amrap')) return true;
  const m = working[0]?.measure;
  return working.length === 1 && (m?.kind === 'duration' || m?.kind === 'distance');
}

const WHAT: Record<ProgressMode, { test: (p: Prescription) => boolean; missing: string }> = {
  load: { test: hasLoad, missing: 'Ningún entreno de la selección tiene la carga escrita (%RM o kg).' },
  sets: { test: hasSets, missing: 'Ningún entreno de la selección tiene series o rondas escritas.' },
  deload: { test: hasVolume, missing: 'Ningún entreno de la selección tiene volumen escrito (series, tiempo o distancia).' },
};

/** La frase que explica un «Nada que cambiar». */
export function noChangeReason(grid: WeekDay[][], range: GridRange, bounds: GridBounds, mode: ProgressMode): string {
  const rowsWith: number[] = [];
  let lines = 0;
  for (let row = range.r0; row <= Math.min(range.r1, bounds.rows - 1); row++) {
    for (let col = range.c0; col <= Math.min(range.c1, bounds.cols - 1); col++) {
      for (const s of cellAt(grid, row, col).sessions) {
        for (const b of s.blocks ?? []) {
          for (const it of b.items ?? []) {
            lines += 1;
            if (WHAT[mode].test(itemPrescription(it)) && !rowsWith.includes(row)) rowsWith.push(row);
          }
        }
      }
    }
  }
  if (lines === 0) return 'La selección no tiene entrenos escritos.';
  if (rowsWith.length === 0) return WHAT[mode].missing;
  // Varias semanas: la primera es la base y no cambia.
  if (mode !== 'deload' && range.r1 > range.r0 && rowsWith.every((r) => r === range.r0)) {
    return `Solo la semana ${range.r0 + 1} tiene qué progresar, y es la base (no cambia). Copia sus entrenos a las siguientes y progresa después.`;
  }
  return 'Con este paso no cambia ninguna línea.';
}
