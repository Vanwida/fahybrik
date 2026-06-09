export const WEEK_DAY_BLOCK_SECTIONS = [
  { id: 'warmup', label: 'Calentamiento' },
  { id: 'mobility', label: 'Movilidad' },
  { id: 'strength', label: 'Fuerza' },
  { id: 'accessory', label: 'Accesorio' },
  { id: 'metcon', label: 'Metcon' },
  { id: 'emom', label: 'EMOM' },
  { id: 'cooldown', label: 'Vuelta calma' },
] as const;

export type WeekDayBlockSectionId = (typeof WEEK_DAY_BLOCK_SECTIONS)[number]['id'];

export function sectionLabel(section: WeekDayBlockSectionId): string {
  return WEEK_DAY_BLOCK_SECTIONS.find((s) => s.id === section)?.label ?? section;
}
