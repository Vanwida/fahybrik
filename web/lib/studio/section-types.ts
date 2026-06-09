import type { TemplateFormat } from '@/lib/templates/schema';
import type { ExerciseCategoryToken } from '@/components/templates/template-types';
import type { StudioBlockKind } from './blocks';

/** Per-section timing (EMOM cap, AMRAP duration, etc.). */
export type SectionBlockConfig = {
  time_cap_seconds?: number;
  emom_interval_seconds?: number;
  rounds?: number;
  work_seconds?: number;
  rest_seconds?: number;
};

export type HyroxSectionType = {
  id: string;
  emoji: string;
  title: string;
  kind: StudioBlockKind;
  section_format: TemplateFormat;
  hint: string;
  categories: ExerciseCategoryToken[] | null;
};

/** HYROX-only section presets — what Pablo adds inside a workout. */
export const HYROX_SECTION_TYPES: HyroxSectionType[] = [
  {
    id: 'stations',
    emoji: '🎯',
    title: 'Estaciones HYROX',
    kind: 'hyrox',
    section_format: 'hyrox_sim',
    hint: 'Sled, wall ball, remo, farmer…',
    categories: ['hyrox_station'],
  },
  {
    id: 'emom',
    emoji: '⏱',
    title: 'EMOM',
    kind: 'custom',
    section_format: 'emom',
    hint: 'Trabajo cada X min · cap total',
    categories: null,
  },
  {
    id: 'amrap',
    emoji: '🔁',
    title: 'AMRAP',
    kind: 'custom',
    section_format: 'amrap',
    hint: 'Máx rondas en tiempo fijo',
    categories: null,
  },
  {
    id: 'for_time',
    emoji: '⏳',
    title: 'For Time',
    kind: 'custom',
    section_format: 'for_time',
    hint: 'Completar lo antes posible',
    categories: null,
  },
  {
    id: 'intervals',
    emoji: '📶',
    title: 'Intervals',
    kind: 'run',
    section_format: 'intervals',
    hint: 'Series carrera / remo / ski',
    categories: ['cardio'],
  },
  {
    id: 'strength_block',
    emoji: '🏋️',
    title: 'Strength block',
    kind: 'strength',
    section_format: 'strength_block',
    hint: 'Series · reps · %1RM · RPE',
    categories: ['strength'],
  },
  {
    id: 'tempo',
    emoji: '🏃',
    title: 'Tempo / rodaje',
    kind: 'run',
    section_format: 'tempo',
    hint: 'Zona · pace · distancia',
    categories: ['cardio'],
  },
  {
    id: 'circuit',
    emoji: '⚡',
    title: 'Circuit',
    kind: 'custom',
    section_format: 'circuit',
    hint: 'Rondas mix HYROX + cardio',
    categories: null,
  },
  {
    id: 'rest',
    emoji: '⏸',
    title: 'Recuperación',
    kind: 'rest',
    section_format: 'tempo',
    hint: 'Movilidad · activación',
    categories: ['mobility', 'skill', 'core'],
  },
];

export function defaultConfigForFormat(format: TemplateFormat): SectionBlockConfig {
  switch (format) {
    case 'emom':
      return { emom_interval_seconds: 60, time_cap_seconds: 12 * 60, rounds: 12 };
    case 'amrap':
      return { time_cap_seconds: 12 * 60 };
    case 'for_time':
      return { time_cap_seconds: 20 * 60 };
    case 'intervals':
      return { rounds: 6, work_seconds: 120, rest_seconds: 90 };
    case 'circuit':
      return { rounds: 4 };
    case 'strength_block':
      return { rounds: 4, rest_seconds: 120 };
    default:
      return {};
  }
}

export function formatLabel(format: TemplateFormat): string {
  const hit = HYROX_SECTION_TYPES.find((s) => s.section_format === format);
  if (hit) return hit.title;
  const map: Record<TemplateFormat, string> = {
    amrap: 'AMRAP',
    for_time: 'For Time',
    emom: 'EMOM',
    intervals: 'Intervals',
    strength_block: 'Strength block',
    hyrox_sim: 'HYROX sim',
    tempo: 'Tempo',
    circuit: 'Circuit',
  };
  return map[format] ?? format;
}
