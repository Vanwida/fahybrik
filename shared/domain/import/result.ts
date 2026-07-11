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

/** Validate a typed prescription; on failure, downgrade the line to review with
 *  the raw text preserved (honesty contract). */
export function finalizeDetected(
  token: string,
  prescription: Prescription,
  raw: string,
): ParsedLine {
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
