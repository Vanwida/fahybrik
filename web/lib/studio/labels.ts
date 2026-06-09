import type { ExerciseCategoryToken } from '@/components/templates/template-types';
import type { StudioBlock } from './blocks';
import { HYROX_SECTION_TYPES, formatLabel } from './section-types';

export const PART_TYPES = HYROX_SECTION_TYPES;

export function partUiForBlock(block: StudioBlock) {
  const hit = HYROX_SECTION_TYPES.find(
    (s) => s.section_format === block.section_format && s.kind === block.kind,
  );
  if (hit) return { emoji: hit.emoji, hint: hit.hint, title: block.title };
  return {
    emoji: '📦',
    hint: formatLabel(block.section_format),
    title: block.title,
  };
}

export function categoriesForBlock(block: StudioBlock): ExerciseCategoryToken[] | null {
  const hit = HYROX_SECTION_TYPES.find((s) => s.section_format === block.section_format);
  if (hit?.categories) return [...hit.categories];
  if (block.kind === 'hyrox') return ['hyrox_station'];
  if (block.kind === 'run') return ['cardio'];
  if (block.kind === 'strength') return ['strength'];
  return null;
}
