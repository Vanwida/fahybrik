// result — the importer's OUTPUT shape and its two constructors, shared by the
// dispatcher (./notation.ts) and the per-family parsers (./bout.ts,
// ./strength.ts). The honesty contract is enforced HERE: everything typed is
// validated against `prescriptionSchema`, and a validation failure downgrades
// the line to `review` with the verbatim text preserved — never a bad number.

import {
  type Prescription,
  type PrescriptionScheme,
  prescriptionSchema,
} from '../prescription/types';
import { foldText } from './dose';

export type NotationConfidence = 'detected' | 'review';

/** One recognized line of a session cell: the exercise label, its typed dosage,
 *  and how sure the grammar is about the typing. `exercise_token` is verbatim
 *  (resolution to a catalog exercise is a LATER concern, not this module's job)
 *  and is empty for a `review` line or a bout that names no movement. */
export interface ParsedLine {
  exercise_token: string;
  prescription: Prescription;
  confidence: NotationConfidence;
  review_reasons: string[];
}

/** An intermediate parse (pre-validation): the token + its prescription. */
export interface Parsed {
  token: string;
  prescription: Prescription;
}

// Words that COUNT work rather than name it. A line whose movement token is one
// of these named no exercise at all — the counter word got mistaken for the
// movement. "3-4 RONDAS" typed CONFIDENTLY as two sets of 3 and 4 reps of an
// exercise called "RONDAS"; "12-15 repeticiones" as sets of 12 and 15 reps of
// "repeticiones". Both are wrong AND unflagged, which is worse than not typing:
// nothing tells the coach to look. A rounds/rep RANGE has no home in the model
// yet, so the honest answer is `review` with the text intact.
const DOSE_WORD_ONLY_RE =
  /^(?:rounds?|rondas?|vueltas?|series?|sets?|reps?|repeticiones?|veces|ejercicios?|min(?:utos?)?|seg(?:undos?)?)$/;

/** Validate a typed prescription; on failure, downgrade the line to review with
 *  the raw text preserved (honesty contract). */
export function finalizeDetected(
  token: string,
  prescription: Prescription,
  raw: string,
): ParsedLine {
  const bare = foldText(token);
  // Every word counts work rather than names it ("series repeticiones" is the
  // debris left behind by a bare "N series de X-Y repeticiones" with no
  // exercise attached — as wrong a "movement" as "RONDAS" alone).
  const words = bare.split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.every((w) => DOSE_WORD_ONLY_RE.test(w))) {
    return reviewLine(raw, `counter word "${token.trim()}" read as the movement — no exercise named`);
  }
  const parsed = prescriptionSchema.safeParse(prescription);
  if (!parsed.success) {
    return reviewLine(raw, `typed prescription failed validation: ${parsed.error.message}`);
  }
  return {
    exercise_token: token,
    prescription: parsed.data as Prescription,
    confidence: 'detected',
    review_reasons: [],
  };
}

const MAX_NOTE_CHARS = 2000; // prescriptionSchema's note ceiling

/** A review line keeps the verbatim text in `note` (the ONLY allowed free text)
 *  and never fabricates structure. The scheme is a labeled best-guess from any
 *  metcon keyword present (acknowledged by `confidence:'review'`). */
export function reviewLine(raw: string, reason: string): ParsedLine {
  const text = raw.trim().slice(0, MAX_NOTE_CHARS);
  const prescription = prescriptionSchema.parse({
    scheme: detectMetconScheme(raw),
    note: text,
  }) as Prescription;
  return { exercise_token: '', prescription, confidence: 'review', review_reasons: [reason] };
}

function detectMetconScheme(raw: string): PrescriptionScheme {
  const n = foldText(raw);
  if (/\bamrap\b/.test(n)) return 'amrap';
  if (/\bemom\b/.test(n)) return 'emom';
  if (/\btabata\b/.test(n)) return 'tabata';
  if (/\bdeath by\b/.test(n)) return 'death_by';
  if (/\b(hyrox|simulaci)\b/.test(n)) return 'hyrox_sim';
  if (/\bchipper\b/.test(n)) return 'chipper';
  if (/\bladder\b/.test(n)) return 'ladder';
  return 'for_time'; // generic metcon fallback (dense, unstructured)
}
