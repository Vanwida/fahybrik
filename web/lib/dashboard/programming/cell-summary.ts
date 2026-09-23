// Lo que se lee en una celda de la rejilla sin abrirla: el título del entreno y
// sus bloques con letra (A, B, C) y la dosis compacta. Puro; lo usan la celda,
// la vista previa del atleta y la biblioteca.

import { prescriptionToText } from '@fahybrid/shared/domain/prescription';
import type { WeekDay, WeekDayPart } from '@fahybrid/shared/schema/program-templates';
import type { V2Modality } from '@/components/v2/constants';
import { modalityColorSlug } from '@/lib/dashboard/v2/editor-axes';
import { modalityForGroup } from '@/lib/dashboard/v2/planes-model';
import { cellState, type CellState } from './grid-model';
import { itemPrescription } from './progress-ops';

export interface CellLine {
  letter: string;
  /** «Sentadilla 5×5 @ 75% RM» — sin el descanso, que no cabe en una celda. */
  text: string;
  modality: V2Modality | null;
  optional: boolean;
}

export interface CellEntreno {
  title: string | null;
  lines: CellLine[];
}

export interface CellSummary {
  state: CellState;
  entrenos: CellEntreno[];
  /** Modalidad que domina el día (color del filo de la celda). */
  modality: V2Modality | null;
}

const LETTERS = 'ABCDEFGHIJKLMNOP';

/** La dosis compacta: la primera frase de `prescriptionToText` (sin «· descanso …»). */
export function compactDose(text: string): string {
  return text.split(' · ')[0] ?? text;
}

export function blockModality(block: WeekDayPart): V2Modality | null {
  const byGroup = modalityForGroup(block.methodology_group_id);
  if (byGroup) return byGroup;
  for (const it of block.items ?? []) {
    const m = itemPrescription(it).modality;
    if (m) return modalityColorSlug(m);
  }
  return null;
}

export function blockLine(block: WeekDayPart, index: number): CellLine {
  const items = block.items ?? [];
  const text =
    items.length === 0
      ? block.title
      : items
          .map((it) => {
            const dose = compactDose(prescriptionToText(itemPrescription(it)));
            return dose ? `${it.exercise_name} ${dose}` : it.exercise_name;
          })
          .join(' + ');
  return { letter: LETTERS[index] ?? '·', text, modality: blockModality(block), optional: block.optional ?? false };
}

export function summarizeCell(day: WeekDay | null | undefined): CellSummary {
  const state = cellState(day);
  if (!day || state !== 'workout') return { state, entrenos: [], modality: null };
  const counts = new Map<V2Modality, number>();
  const entrenos: CellEntreno[] = day.sessions
    .filter((s) => s.kind === 'workout')
    .map((s) => {
      const blocks = s.blocks ?? [];
      const lines = blocks.map((b, i) => blockLine(b, i));
      for (const l of lines) if (l.modality) counts.set(l.modality, (counts.get(l.modality) ?? 0) + 1);
      return { title: s.focus?.trim() || null, lines };
    });
  let modality: V2Modality | null = null;
  let best = 0;
  for (const [m, n] of counts) {
    if (n > best) {
      modality = m;
      best = n;
    }
  }
  return { state, entrenos, modality };
}

/** Una línea de texto por celda para lectores de pantalla y avisos. */
export function cellAriaText(day: WeekDay | null | undefined): string {
  const s = summarizeCell(day);
  if (s.state === 'rest') return 'Descanso';
  if (s.state === 'empty') return 'Vacío';
  return s.entrenos
    .map((e) => [e.title, ...e.lines.map((l) => `${l.letter} ${l.text}`)].filter(Boolean).join(', '))
    .join('; ');
}
