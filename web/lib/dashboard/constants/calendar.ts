export const WEEKDAY_COUNT = 7 as const;

export const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

export const DAY_LABELS_FULL = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function dayLabel(dayOfWeek: DayOfWeek, full = false): string {
  const labels = full ? DAY_LABELS_FULL : DAY_LABELS;
  return labels[dayOfWeek - 1] ?? `D${dayOfWeek}`;
}
