// Appointment slot engine — PURE (no DB, no framework). Given the coach's weekly
// availability, blocked dates, and already-busy slots, produce the bookable 30-min slots
// for the next N days. All wall-clock reasoning is Europe/Madrid (BOX_TIMEZONE); slot
// starts are absolute instants (UTC), DST-safe via zonedWallClockToUtc.
//
// Contract: an empty result means "no availability" → the UI shows the honest fallback
// ("Pablo te escribirá para cuadrar la llamada"), never an empty calendar.

import { addDays, BOX_TIMEZONE, isoDateString, startOfDayInBox, zonedWallClockToUtc } from '../dates';

export interface AvailabilityWindow {
  /** 0=Sunday … 6=Saturday (JS getUTCDay), interpreted in Europe/Madrid. */
  weekday: number;
  /** Madrid wall-clock 'HH:MM' or 'HH:MM:SS'. */
  start_time: string;
  end_time: string;
}

export interface SlotEngineInput {
  now: Date;
  availability: AvailabilityWindow[];
  /** Blocked calendar days, ISO 'YYYY-MM-DD' (Europe/Madrid). */
  blockedDates: ReadonlySet<string>;
  /** Epoch-ms of already-taken slot starts (pendiente/aceptada appointments). */
  busyStartMs: ReadonlySet<number>;
  daysAhead?: number; // default 14
  slotMinutes?: number; // default 30
}

export interface Slot {
  /** ISO instant of the slot start (UTC). */
  start: string;
  /** Epoch ms — stable key for selection. */
  ms: number;
  /** Madrid wall-clock label 'HH:MM'. */
  time: string;
}

export interface DaySlots {
  /** ISO 'YYYY-MM-DD' (Europe/Madrid). */
  date: string;
  /** 0=Sun … 6=Sat. */
  weekday: number;
  slots: Slot[];
}

function parseHhMm(t: string): { h: number; m: number } {
  const [h, m] = t.split(':');
  return { h: Number(h), m: Number(m) };
}

function fmtMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Bookable slots for the next `daysAhead` days, grouped by day (empty days dropped). */
export function generateSlots(input: SlotEngineInput): DaySlots[] {
  const { now, availability, blockedDates, busyStartMs } = input;
  const daysAhead = input.daysAhead ?? 14;
  const slotMinutes = input.slotMinutes ?? 30;
  const nowMs = now.getTime();

  const byWeekday = new Map<number, AvailabilityWindow[]>();
  for (const w of availability) {
    const list = byWeekday.get(w.weekday) ?? [];
    list.push(w);
    byWeekday.set(w.weekday, list);
  }

  const today = startOfDayInBox(now); // UTC-midnight anchor of Madrid's "today"
  const out: DaySlots[] = [];

  for (let d = 0; d < daysAhead; d += 1) {
    const day = addDays(today, d);
    const dateIso = isoDateString(day);
    if (blockedDates.has(dateIso)) continue;

    const weekday = day.getUTCDay(); // day is UTC-midnight of that Madrid date → correct DOW
    const windows = byWeekday.get(weekday);
    if (!windows || windows.length === 0) continue;

    const slots: Slot[] = [];
    for (const w of windows) {
      const s = parseHhMm(w.start_time);
      const e = parseHhMm(w.end_time);
      const endMin = e.h * 60 + e.m;
      for (let cur = s.h * 60 + s.m; cur + slotMinutes <= endMin; cur += slotMinutes) {
        const start = zonedWallClockToUtc(day, BOX_TIMEZONE, {
          hours: Math.floor(cur / 60),
          minutes: cur % 60,
        });
        const ms = start.getTime();
        if (ms > nowMs && !busyStartMs.has(ms)) {
          slots.push({ start: start.toISOString(), ms, time: fmtMinutes(cur) });
        }
      }
    }
    if (slots.length > 0) {
      slots.sort((a, b) => a.ms - b.ms);
      out.push({ date: dateIso, weekday, slots });
    }
  }
  return out;
}

/** True iff `startMs` is one of the currently-offered slots — the server re-checks a
 *  booking request against a freshly-generated slot set (never trust the client). */
export function isOfferedSlot(days: DaySlots[], startMs: number): boolean {
  return days.some((d) => d.slots.some((s) => s.ms === startMs));
}
