// imported-week — the SOURCE-AGNOSTIC intermediate of the importer: what a
// reader produces before any typing happens. Excel, pasted text and a photo all
// converge here, and everything downstream (the grammar, the exercise resolver,
// the review grid, confirm) runs once, on this shape.
//
// It lived inside `xlsx-reader.ts`, which made a spreadsheet-shaped model the
// contract for every source: ONE text blob per day. That is fine for a
// spreadsheet, where one cell IS one day — but a real training day holds several
// distinct sessions, and a screenshot shows them as separate cards. Collapsing
// them into one blob is why `build-proposal` could only ever emit a single block
// per day.
//
// So a day is now optionally a LIST OF CARDS. A reader that has no card
// structure (the spreadsheet) leaves `cards` undefined and nothing changes; a
// reader that does (the photo) fills it, and each card becomes its own block.

import type { DayPriority } from '@fahybrid/shared/domain/day-intent';
import type { Modality } from '@fahybrid/shared/domain/prescription/types';

/** What a card IS. Only `workout` carries training; the rest are the calendar
 *  furniture a screenshot inevitably includes and must not be typed as work. */
export type ImportedCardKind = 'workout' | 'note' | 'metrics' | 'rest';

/** One distinct entry of a training day — a session as the coach sees it in
 *  their calendar, before anything is parsed. */
export interface ImportedCard {
  /** The card's heading, verbatim ("FUERZA PARTE ALTA (4 × 4)"). */
  title: string | null;
  kind: ImportedCardKind;
  /** The body, one verbatim line per visual line, IN ORDER. Never re-worded. */
  lines: string[];
  /**
   * A WEAK hint from the source's own iconography. The CONTENT decides the real
   * modality — a card titled "TRANSICIONES CARRERA" carrying 500 m runs and box
   * step-ups ships under a rowing icon in TrainingPeaks.
   */
  modality_hint?: Modality | null;
  /** The source visibly cut this card off ("4 More", "Notas…", a clipped line). */
  truncated?: boolean;
  /** How many entries the source said it was hiding, when it says so ("4 More"). */
  hidden_count?: number | null;
}

export interface ImportedDay {
  /** 1 = Lunes … 7 = Domingo. */
  day_of_week: number;
  /** Display day name, e.g. "Lunes". */
  dow: string;
  /** CAPA 1 — the day's stimulus line. Null when the cell is empty. */
  stimulus: string | null;
  /** CAPA 2 — the detailed session in the coach's notation. Null when empty. */
  session_text: string | null;
  /**
   * The day broken into its cards, when the reader could see that structure.
   * Undefined (not empty) when the source has none — an empty array means the
   * reader looked and the day genuinely holds nothing.
   */
  cards?: ImportedCard[];
  /**
   * Prioridad / sustituto que el lector ya vio estructurados (ciclo JSON:
   * `prioridad`, `sustituible`). El orquestador los levanta; no se adivinan.
   */
  priority?: DayPriority;
  substitute?: string;
  prioridad?: string;
  sustituible?: string;
  alternativa?: string;
  alternative?: string;
}

export interface ImportedWeek {
  week: number;
  /** Where this week was read FROM — a sheet name, "pegado", "foto". */
  sheet: string;
  /**
   * True when the requested variant sheet did not exist for this week and we
   * fell back to the "Semana N" estándar sheet (spreadsheet sources only).
   */
  fell_back: boolean;
  days: ImportedDay[];
}

/** The cards of a day that actually carry training. */
export function workoutCards(day: ImportedDay): ImportedCard[] {
  return (day.cards ?? []).filter((c) => c.kind === 'workout');
}

/** A card's body as the one text blob the notation grammar consumes: the title
 *  leads (an ALL-CAPS no-dose line is read as a block title downstream) and the
 *  body follows, verbatim. */
export function cardToSessionText(card: ImportedCard): string {
  return [card.title, ...card.lines].filter((l): l is string => !!l && l.trim().length > 0).join('\n');
}
