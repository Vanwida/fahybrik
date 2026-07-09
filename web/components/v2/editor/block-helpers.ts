// block-helpers — small pure helpers shared by the editor cluster: derive a
// block's v2 modality color slug (left-border / dot) and a one-line summary of
// its items. Kept out of the components so the rail (SCREEN 5) and the day cards
// (SCREEN 8) agree on the same derivation. No free text invented: the summary is
// built from the structured prescriptions via the shared prescriptionToText.

import { prescriptionToText } from '@fahybrid/shared/domain/prescription';
import type { V2Modality } from '@/components/v2/constants';
import { modalityColorSlug } from '@/lib/dashboard/v2/editor-axes';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';
import { archetypeForFormat, getArchetype } from '@/lib/dashboard/v2/archetypes';

/** The dominant modality color slug of a block (first item's modality wins). */
export function blockModalitySlug(block: EditorBlock): V2Modality {
  const first = block.items[0];
  if (first) return modalityColorSlug(first.prescription.modality);
  // No items yet — derive from the block format string when it hints a modality.
  const f = (block.format ?? '').toLowerCase();
  if (f.includes('strength')) return 'fuerza';
  if (f.includes('tempo') || f.includes('intervals')) return 'carrera';
  if (f) return 'circuito';
  return 'calentamiento';
}

/**
 * The block's TYPE label — the sport-vocabulary chip on a flat day ("Fuerza",
 * "WOD", "Series"). A freshly created block carries its client `archetype_id`; a
 * reloaded block re-derives the type from its persisted `format`. Null only when
 * the block has neither (a bare/unknown block) — the chip is then hidden.
 */
export function blockTypeLabel(block: EditorBlock): string | null {
  if (block.archetype_id) return getArchetype(block.archetype_id).shortName;
  return archetypeForFormat(block.format)?.shortName ?? null;
}

/** "N ejercicios · primer ítem resumido" — the block sub-line in the rail. */
export function blockSummaryLine(block: EditorBlock): string {
  const n = block.items.length;
  if (n === 0) return 'sin ejercicios';
  const first = block.items[0]!;
  const line = prescriptionToText(first.prescription);
  const lead = n === 1 ? '1 ejercicio' : `${n} ejercicios`;
  return line ? `${lead} · ${line}` : lead;
}

/** Estimated minutes for a block (rough, from total/work seconds when present). */
export function blockMinutes(block: EditorBlock): number | null {
  let seconds = 0;
  for (const it of block.items) {
    const p = it.prescription;
    if (p.total_s) seconds += p.total_s;
    else if (p.work_s && p.rounds) seconds += (p.work_s + (p.rest_s ?? 0)) * p.rounds;
  }
  return seconds > 0 ? Math.round(seconds / 60) : null;
}
