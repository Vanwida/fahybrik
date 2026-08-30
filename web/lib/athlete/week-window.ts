import { addDays, mondayOfWeek, parseIsoDate, startOfDayInBox } from '@fahybrid/shared/domain/dates';

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Which Mon–Sun week the athlete plan endpoint serves.
 *
 * `week_start` is a day in that week (any weekday); we snap it to Monday.
 * `week_offset` is a signed shift from today's Monday in Europe/Madrid.
 */
export function resolveAthleteWeekStart(args: {
  weekStartIso?: string | null;
  weekOffsetRaw?: string | null;
  now?: Date;
}): Date {
  const todayMonday = mondayOfWeek(startOfDayInBox(args.now ?? new Date()));
  const raw = args.weekStartIso?.trim() ?? '';
  if (ISO_DAY.test(raw)) {
    return mondayOfWeek(parseIsoDate(raw));
  }
  const n = Number(args.weekOffsetRaw);
  const offset = Number.isFinite(n) ? Math.trunc(n) : 0;
  return addDays(todayMonday, offset * 7);
}
