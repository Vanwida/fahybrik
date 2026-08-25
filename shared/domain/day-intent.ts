// Priority and declared substitute of a DAY (card 128 · hueco 3).
//
// The coach wrote both on the day, never on a work line. The 12-week cycle
// has 47 essential DAYS (FOCUS said "lines"; the JSON contradicts that),
// 12 important, 9 complementary, and 16 with "-". A boolean would shove
// the other 21 back into a note.
//
// The substitute is a declared phrase, not a second calendar. 31 of 84
// days name a class. 10 other days keep sustituible "No" and write
// "Alternativa: …" inside a Z2 block. Same field. Do not merge the counts.
//
// "-" / "No" / empty = absent, not a fourth enum value. Rest days in the
// corpus are absent. Block "optional" is a different concept.
//
// Mechanism = a day may carry a declared prune level and a declared
// stand-in. The three values match this corpus. Another coach can store
// a different phrase in `substitute`. No new table.

import { z } from 'zod';

export const DAY_PRIORITY_VALUES = ['essential', 'important', 'complementary'] as const;
export type DayPriority = (typeof DAY_PRIORITY_VALUES)[number];
export const dayPrioritySchema = z.enum(DAY_PRIORITY_VALUES);

export const DAY_SUBSTITUTE_MAX = 200;

export type DayIntent = {
  priority?: DayPriority;
  substitute?: string;
};

const PRIORITY_BY_TOKEN: Record<string, DayPriority> = {
  esencial: 'essential',
  essential: 'essential',
  importante: 'important',
  important: 'important',
  complementaria: 'complementary',
  complementary: 'complementary',
};

function fold(value: string): string {
  return value.trim().toLocaleLowerCase('es');
}

function isAbsentToken(value: string): boolean {
  const t = fold(value);
  return t.length === 0 || t === '-' || t === 'no';
}

/** Lift a corpus / alias token. Unknown words stay absent: do not guess. */
export function liftDayPriority(raw: unknown): DayPriority | undefined {
  if (typeof raw !== 'string') return undefined;
  if (isAbsentToken(raw)) return undefined;
  return PRIORITY_BY_TOKEN[fold(raw)];
}

/** Keep the phrase as written. "No" / "-" / empty are not a substitute. */
export function liftDaySubstitute(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (isAbsentToken(trimmed)) return undefined;
  return trimmed.length > DAY_SUBSTITUTE_MAX ? trimmed.slice(0, DAY_SUBSTITUTE_MAX) : trimmed;
}

/**
 * Structured cycle day / slots_json aliases. English keys win when both
 * spellings are present. Does not read block `optional`.
 */
export function readDayIntent(raw: unknown): DayIntent {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const priority = liftDayPriority(o.priority ?? o.prioridad);
  const substitute = liftDaySubstitute(
    o.substitute ?? o.sustituible ?? o.alternativa ?? o.alternative,
  );
  return {
    ...(priority ? { priority } : {}),
    ...(substitute ? { substitute } : {}),
  };
}

const SUBSTITUTE_LINE_RE = /^(?:alternativa|alternative|sustituible|substitute)\s*:\s*(.+)$/im;
const PRIORITY_LABELED_RE = /^(?:prioridad|priority)\s*:\s*(.+)$/im;
const PRIORITY_BARE_LINE_RE =
  /^(?:esencial|essential|importante|important|complementaria|complementary)$/i;

/**
 * A line the coach labeled as the stand-in. Does not invent which day
 * has one. "Complementario de barra" is a block name and does not match.
 */
export function readDeclaredSubstituteFromText(text: string): string | undefined {
  const match = text.match(SUBSTITUTE_LINE_RE);
  return match ? liftDaySubstitute(match[1]) : undefined;
}

/**
 * Only a labeled cue (`Prioridad: Esencial`) or a line that IS exactly
 * the token. Session titles are never inferred. This corpus has 0 work
 * lines that contain "esencial".
 */
export function readDeclaredPriorityFromText(text: string): DayPriority | undefined {
  const labeled = text.match(PRIORITY_LABELED_RE);
  if (labeled) return liftDayPriority(labeled[1]);
  for (const line of text.split('\n')) {
    if (PRIORITY_BARE_LINE_RE.test(line.trim())) return liftDayPriority(line);
  }
  return undefined;
}

/** Structured fields win. Text fills only what the structure left empty. */
export function dayIntentFromSource(source: unknown, text?: string): DayIntent {
  const lifted = readDayIntent(source);
  const fromText = text
    ? {
        priority: readDeclaredPriorityFromText(text),
        substitute: readDeclaredSubstituteFromText(text),
      }
    : {};
  const priority = lifted.priority ?? fromText.priority;
  const substitute = lifted.substitute ?? fromText.substitute;
  return {
    ...(priority ? { priority } : {}),
    ...(substitute ? { substitute } : {}),
  };
}

/** Weekday → declared intent, for athlete week and remap-by-dow reads. */
export function dayIntentByDow(slotsJson: unknown): Map<number, DayIntent> {
  const out = new Map<number, DayIntent>();
  const days = (slotsJson as { days?: unknown[] } | null)?.days;
  if (!Array.isArray(days)) return out;
  for (const day of days) {
    if (!day || typeof day !== 'object') continue;
    const dow = Number((day as { day_of_week?: unknown }).day_of_week);
    if (!Number.isInteger(dow) || dow < 1 || dow > 7) continue;
    const intent = readDayIntent(day);
    if (intent.priority || intent.substitute) out.set(dow, intent);
  }
  return out;
}
