// notation — GRAMMAR-FIRST importer for ONE cell of Pablo's real training
// notation (a day's "Capa 2" session text) → typed `Prescription` lines + a
// per-line confidence. This is the DETERMINISTIC half of the #28 importer
// (Fork A): it types ONLY what the grammar can prove, and marks everything else
// `review` with the raw text preserved. It NEVER hallucinates a number.
//
// HONESTY CONTRACT (the whole point of this module)
// -------------------------------------------------
// FAITHFUL OR REVIEW. A line types only when EVERY bout/movement it carries is
// represented: "10' row + 10' ski" is TWO lines, never one fused row bout; a
// ladder types with ALL its legs or not at all; "5 rounds: 3 Power Clean + 5
// box jump" emits BOTH movements with their reps. A dense multi-station WOD the
// grammar cannot decompose becomes ONE `review` line whose verbatim text is
// kept in `note` — NO fabricated sets, reps, loads or targets. The LLM fallback
// (wired by the endpoint, NOT here) attempts the review lines. Everything we DO
// type is validated against `prescriptionSchema`; a validation failure
// downgrades the line to `review`. The only free text that ever survives into a
// typed result is the model's own `note` field.
//
// Module map (each piece under the repo's 500-line ceiling):
//   ./dose.ts     — numeric micro-grammar (clocks, distances, paces, targets…)
//   ./label.ts    — tokens, modality, titles, noise
//   ./bout.ts     — one continuous cardio/housekeeping effort
//   ./strength.ts — sets-scheme lines + the movement combos
//   ./command.ts  — a header that owns the lines below it
//   ./result.ts   — ParsedLine + validate-or-downgrade constructors
// THIS file owns line dispatch: titles, continuations, chains, ladders, WODs.

import { type Prescription, type PrescriptionSet } from '../prescription/types';
import {
  foldText,
  isPureRest,
  normalizeNotation,
  parseDistanceLadder,
  parseRecoveryClock,
  parseRest,
  parseEffortTarget,
  parseZoneTarget,
  stripTargetTokens,
} from './dose';
import {
  bareMovementToken,
  cardioModalities,
  isModalityChoice,
  isNoiseLine,
  leadingColonLabel,
  looksLikeBareMovementName,
  modalityFrom,
  readGroupLabel,
  TARGET_ONLY_RE,
} from './label';
import { parseBout } from './bout';
import { walkCommandingCell } from './command';
import { parseBareTimedOrCalorieSets } from './measure';
import { tryMetconStructure } from './structure';
import { parseTimeCapTarget, PERCENT_MAX_HR_RE } from './target';
import {
  parseCoreWorkRest,
  parseSetsByLoadedMeasure,
  parseStrength,
  ROUNDS_HEADER_RE,
  tryRepPlusCombo,
  tryRoundsHeaderCombo,
  tryStrengthCombo,
} from './strength';
import {
  finalizeDetected,
  incompleteExerciseLine,
  type Parsed,
  type ParsedLine,
  reviewLine,
} from './result';

// ── Public API (shape lives in ./result.ts; re-exported for stability) ────────

export type { NotationConfidence, ParsedLine } from './result';
export type { GroupLabel } from './label';

export interface ParseNotationCellOptions {
  /** When true, a dose-less line that reads as a movement NAME (not a
   *  header/note/URL/prose — see looksLikeBareMovementName in ./label.ts)
   *  types as confidence:'incomplete' with its exercise_token set and NO
   *  dose — never fabricated, never zero — instead of being dropped as
   *  noise. OFF by default: on Excel/pasted text every real work line
   *  carries its own dose, so a dose-less line there really IS a header, and
   *  turning it into a fabricated exercise would be worse than dropping it.
   *  The photo-import path is the one caller that needs this on — a
   *  photographed TrainingPeaks card lists its movements by name with the
   *  dose living elsewhere on the card (see docs/DECISIONS.md, 2026-08-05
   *  corpus sweep: 49 of 51 real exercises never reached the resolver
   *  because a dose-less name-only line was silently prose). */
  bareNamesAreExercises?: boolean;
}

/**
 * Parse ONE session cell (a day's Capa-2 text, possibly multi-line) into typed
 * prescription lines. Header/prose/coach-note lines are dropped; an ALL-CAPS
 * no-dose line is a block TITLE (its modality contextualizes the lines under
 * it); each remaining work line is typed (`detected`) or preserved (`review`).
 */
export function parseNotationCell(
  text: string,
  opts: ParseNotationCellOptions = {},
): ParsedLine[] {
  const cell = normalizeNotation(text);
  const lines = joinContinuations(cell.split('\n'));
  return walkCommandingCell(lines, (line) => parseStandaloneWork(line, opts));
}

function parseStandaloneWork(line: string, opts: ParseNotationCellOptions): ParsedLine[] {
  // Tried BEFORE isNoiseLine, not nested inside it: a group-labeled name
  // ("A1) Cat Cow") carries a digit in its OWN index, so isNoiseLine's
  // "no digit → noise" rule never fires for it and the noise branch would
  // never be reached at all — looksLikeBareMovementName does its own
  // (stricter) digit/URL/prose exclusion after stripping the label, so it
  // is safe to try unconditionally here rather than gated behind a
  // digit-based classification that the label's own index defeats.
  if (opts.bareNamesAreExercises) {
    const bare = tryBareExerciseLine(line);
    if (bare) return [bare];
  }
  if (isNoiseLine(line)) return [];
  return parseLine(line);
}

/** A dose-less noise line, read as a bare movement name (photo-import only —
 *  see ParseNotationCellOptions.bareNamesAreExercises). Null when it doesn't
 *  look like one (a note, a URL, prose — looksLikeBareMovementName owns that
 *  judgment) or when nothing is left once its group/order marker is gone. */
function tryBareExerciseLine(line: string): ParsedLine | null {
  if (!looksLikeBareMovementName(line)) return null;
  const token = bareMovementToken(line);
  if (!token) return null;
  return incompleteExerciseLine(token, line, readGroupLabel(line));
}

// ── Continuations ────────────────────────────────────────────────────────────
// A prescription can span two physical lines: a header/lead line and a bare
// continuation carrying just the scheme/load ("10/10/8/8/6 — 60/…% RM" under
// "5 rounds Back Squat c/2'30\":") or a bare target line ("RPE 3" under
// "50' Z2"). Merge such continuations back onto the previous line.

const CONTINUATION_RE = /^[\s—–-]*\d+(?:\/\d+)+(?:\s*[—–-].*)?$|^[\s—–-]*\d+(?:[-/]\d+)*\s*%/;

function isContinuation(line: string): boolean {
  if (!line) return false;
  // "Descanso 1:30" on its own physical line under a work line: a pure-rest
  // continuation (see isPureRest — colon/word clocks included) attaches its
  // rest_s to the line above via the SAME merge-then-reparse this function
  // already does for rep schemes and bare targets — parseRest reads it once
  // the text is joined. Orphaned (nothing above to attach to) it falls
  // through unmerged and reviews instead of vanishing (isNoiseLine no longer
  // eats a "descanso" line that carries a dose — see ./label.ts).
  return CONTINUATION_RE.test(line) || TARGET_ONLY_RE.test(line) || isPureRest(line);
}

function joinContinuations(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (out.length > 0 && isContinuation(line)) {
      out[out.length - 1] = `${out[out.length - 1]} ${line}`;
    } else {
      out.push(raw);
    }
  }
  return out;
}

// ── Dense-WOD detector (route to review, never decompose) ────────────────────

const HYROX_STATION_RE =
  /\b(sled push|sled pull|sled drag|wall ?ball|farmer|sandbag|burpee bbj|burpee broad)\b/;

function hasMetconKeyword(seg: string): boolean {
  const n = foldText(seg);
  // "AMRAP de reps"/"AMRAP reps" qualifies ONE movement's rep count as
  // TO-FAILURE (arreglo #5) — not a WOD announcement, which always names a
  // time cap ("AMRAP 12'") or several components. Excluded from the generic
  // "amrap" trigger below so a line using it reaches strength.ts's to-failure
  // reading instead of falling to a blanket review.
  const amrapAsFailureQualifier = /\bamrap\s+(?:de\s+)?reps?\b/.test(n);
  if (/\bamrap\b/.test(n) && !amrapAsFailureQualifier) return true;
  if (/\b(wod|for ?time|emom|chipper|afap|hyrox|simulaci|death by|tabata|complex|intercal)\b/.test(n)) {
    return true;
  }
  return /\btc\b|\(tc\b/.test(n); // time cap "(TC 12')"
}

function isDenseWod(seg: string): boolean {
  if (hasMetconKeyword(seg)) return true;
  // >=2 comma-separated stations that each carry a dose → multi-station WOD.
  const commaStations = seg.split(/,(?!\d)/).filter((p) => /\d/.test(p) && /[a-záéíóúñ]/i.test(p));
  if (commaStations.length >= 2) return true;
  // A suffixed distance ladder ("1200m / 800m / 400m …") without Nx groups.
  // `(?<![/\d])` excludes a distance unit that is itself the DENOMINATOR of a
  // pace expression ("1:55/500m") — that "500m" is not a second station, it
  // is the same clause as the "2000 m" earlier in the line, and counting it
  // used to send every erg-pace line with a real dose ("Remo 2000 m a
  // 1:55/500m") to review as a fake multi-station WOD. The `\d` half is
  // load-bearing on its own, not decorative: blocking only "/" still lets the
  // engine retry ONE position later — "500m" preceded by "/" is blocked, but
  // its OWN second digit ("00m", preceded by the digit "5") is not, and that
  // alone used to still count as a second "distance token".
  const distTokens = seg.match(/(?<![/\d])\d+\s*k?m\b(?!\s*\/?\s*h)/gi) ?? [];
  if (distTokens.length >= 3) return true;
  if (distTokens.length >= 2 && seg.includes('/')) return true;
  // A HYROX station chained (+ / comma) with anything else → simulation piece.
  if (HYROX_STATION_RE.test(foldText(seg)) && /[+,]/.test(seg)) return true;
  return false;
}

// ── Line dispatch ────────────────────────────────────────────────────────────

// Every comma-tail extraction below (`todo`/`restTail`/`capTail`) SLICES the
// line and re-parses the part before the comma, then re-attaches the tail's
// meaning onto whatever came back. That re-attachment only makes sense when
// the sliced part actually typed: if it didn't (still `review`), committing
// to the SLICED text anyway would silently drop the tail clause from the
// review line's verbatim note — the honesty contract says a review line
// preserves the FULL text, not "everything before the last comma". This
// guard is the shared "only commit if it actually worked" check; a caller
// that fails it falls through and lets the ORIGINAL, untruncated `line`
// reach the next check (ladder/dense-WOD/chain/segment) instead.
function allDetected(parsed: ParsedLine[]): boolean {
  return parsed.length > 0 && parsed.every((l) => l.confidence === 'detected');
}

function parseLine(line: string): ParsedLine[] {
  // "10' row + 10' ski …, todo Z2" — a trailing ALL-bouts target clause. It is
  // extracted first (its comma would otherwise trip the multi-station detector)
  // and distributed onto every typed bout that names no target of its own.
  const todo = line.match(/,\s*(?:todo|toda|todos|todas)\s+([^,]+)$/i);
  if (todo) {
    const tailTarget = parseZoneTarget(todo[1]!) ?? parseEffortTarget(todo[1]!)?.target;
    if (tailTarget && !/\d/.test(stripTargetTokens(todo[1]!))) {
      const parsed = parseLine(line.slice(0, todo.index!));
      if (allDetected(parsed)) {
        for (const l of parsed) {
          if (!l.prescription.target) l.prescription.target = tailTarget;
        }
        return parsed;
      }
    }
  }
  // "6x800 m Z5, rec 2:30" / "…, descanso 2:30" — a trailing REST clause after
  // a comma (arreglo #1's dialects). Extracted first, same reason as `todo`
  // above: the comma would otherwise trip isDenseWod's multi-station
  // heuristic — a rest annotation is not a second station. Anchored to a
  // KNOWN rest cue immediately after the comma (never "any comma-tail") so
  // this never swallows a genuine second station ("…, 5 thrusters 40kg");
  // `parseRest` having to actually resolve a clock from it is the second gate.
  const restTail = line.match(
    /,\s*((?:c\/|cada|rec|r|rest|descanso|recuperaci[oó]n|recovery)\b.*)$/i,
  );
  if (restTail) {
    const tailRest = parseRest(restTail[1]!);
    if (tailRest !== undefined) {
      const parsed = parseLine(line.slice(0, restTail.index!));
      if (allDetected(parsed)) {
        for (const l of parsed) {
          if (l.prescription.rest_s === undefined) l.prescription.rest_s = tailRest;
        }
        return parsed;
      }
    }
  }
  // "Row 500m, cap 1'50''" — a trailing TIME-CAP clause after a comma, same
  // reason as `restTail` above: the comma would otherwise trip isDenseWod's
  // multi-station heuristic on what is really one single capped effort.
  const capTail = line.match(/,\s*((?:cap|tc)\b.*)$/i);
  if (capTail) {
    const tailCap = parseTimeCapTarget(capTail[1]!);
    if (tailCap) {
      const parsed = parseLine(line.slice(0, capTail.index!));
      if (allDetected(parsed)) {
        for (const l of parsed) {
          if (!l.prescription.target) l.prescription.target = tailCap;
        }
        return parsed;
      }
    }
  }
  const ladder = tryDistanceLadder(line);
  if (ladder) return ladder;
  // Metcon STRUCTURE (rounds of components, EMOM/work-rest chains, EMOM
  // rotation) — tried before the dense-WOD blanket review so a line that
  // fully decomposes never falls into it. FAITHFUL OR REVIEW on its own: it
  // returns null (never a partial group) unless every component/piece typed.
  const structure = tryMetconStructure(line);
  if (structure) return structure;
  if (isDenseWod(line)) {
    return [reviewLine(line, 'dense multi-station WOD/sim — verbatim kept for LLM/coach')];
  }
  const segments = splitChain(line);
  if (segments.length >= 2) return parseChain(line, segments);
  return [parseSegment(line)];
}

/** Split a line into "+"/"→"-chained segments (never inside parentheses). */
function splitChain(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of line) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === '+' || ch === '→')) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** A chained line. FAITHFUL OR REVIEW: it types only when every segment types —
 *  a strength combo, a rounds-header circuit of reps-first movements (class 5),
 *  or a bout chain (class 4). Anything partial goes to review WHOLE (class 7). */
function parseChain(line: string, segments: string[]): ParsedLine[] {
  const work = segments.filter((s) => !isPureRest(s));
  // "10' suave + movilidad": a numberless tail is a qualifier of ONE bout, not
  // a chain — keep the whole line on the single-segment path.
  if (work.some((s) => !/\d/.test(s))) return [parseSegment(line)];

  if (work.length >= 2 && ROUNDS_HEADER_RE.test(line)) {
    return (
      tryRoundsHeaderCombo(line) ??
      tryStrengthCombo(line) ?? [
        reviewLine(line, 'round circuit with mixed stations — kept verbatim for LLM/coach'),
      ]
    );
  }
  if (work.length >= 2) {
    const strength = tryStrengthCombo(line);
    if (strength) return strength;
  }
  const chain = tryBoutChain(line, segments);
  if (chain) return chain;
  // "10+10 Step Ups Cajón" — bare rep counts chained onto ONE trailing
  // movement name; neither a strength combo (no per-segment dose) nor a bout
  // chain (no bout signal) can type it, but it is still provable — see
  // tryRepPlusCombo. Tried LAST so it never shadows an existing combo class.
  const repPlus = tryRepPlusCombo(line);
  if (repPlus) return repPlus;
  if (work.length < 2) return [parseSegment(line)];
  return [reviewLine(line, 'multi-bout line the grammar could not type whole — kept verbatim')];
}

function parseSegment(line: string): ParsedLine {
  if (isDenseWod(line)) {
    return reviewLine(line, 'dense multi-station WOD/sim — verbatim kept for LLM/coach');
  }
  const core = parseCoreWorkRest(line);
  if (core) return finalizeDetected(core.token, core.prescription, line);
  const bout = parseBout(line);
  if (bout) return finalizeDetected(bout.token, bout.prescription, line);
  // arreglo #2/#3 — distance/duration sets with an optional (possibly
  // per-implement) load: "Sled Push 5x25 m @160 kg". Tried AFTER parseBout
  // (which now refuses these — see its guard) and BEFORE parseStrength
  // (reps-only): a movement measured in meters/seconds is never reps.
  const loadedMeasure = parseSetsByLoadedMeasure(line);
  if (loadedMeasure) return finalizeDetected(loadedMeasure.token, loadedMeasure.prescription, line);
  // A timed or calorie-counted hold with NO load and NO cardio modality
  // ("Plancha 3x45 s", "Plancha 3x40-45 s") — parseBout refused it (no bout
  // signal) and parseSetsByLoadedMeasure refused it (no "@"/kg); tried
  // BEFORE parseStrength so its reps-only reader never gets the chance to
  // misread the clock/calorie digits as a fabricated rep sequence.
  const bareMeasure = parseBareTimedOrCalorieSets(line);
  if (bareMeasure) return finalizeDetected(bareMeasure.token, bareMeasure.prescription, line);
  const strength = parseStrength(line);
  if (strength) return finalizeDetected(strength.token, strength.prescription, line);
  // "45 min al 72% FCmax" — never typed (see target.ts's PERCENT_MAX_HR_RE
  // doc comment: resolving %-of-max-HR to a real bpm needs the athlete's OWN
  // measured max, which this pure grammar never has), but recognized so the
  // reason is honest instead of the generic catch-all below.
  if (PERCENT_MAX_HR_RE.test(line)) {
    return reviewLine(line, '% de FC máxima requiere la FC máxima medida del atleta — no derivable del texto');
  }
  return reviewLine(line, 'no confident dose recognized');
}

// ── Distance ladder (class 3: every leg or review) ───────────────────────────

function tryDistanceLadder(line: string): ParsedLine[] | null {
  if (hasMetconKeyword(line)) return null; // dense WODs own their ladders
  const ladder = parseDistanceLadder(line);
  if (!ladder) return null;
  // Assignable extras: a line-level zone/RPE target and modality words. Any
  // OTHER digit in the leftover makes the line unprovable → review WHOLE,
  // never "just the first leg".
  const leftover = stripTargetTokens(ladder.leftover).replace(/[/·,+–—-]+/g, ' ');
  const unprovable = () => [
    reviewLine(line, 'distance ladder with an annotation the grammar cannot assign — kept verbatim'),
  ];
  if (/[\d(]/.test(leftover)) return unprovable();
  // Per-leg parens: when EVERY group carries one and each is a pure recovery
  // clock ("2x800 (1'15'')" — Pablo's recovery column, sometimes labeled
  // "rest"), they type as per-set rest. A stray annotation on SOME legs is
  // ambiguous (pace? rest?) → review, per the honesty contract.
  const withParen = ladder.groups.filter((g) => g.paren !== null);
  const rests: Array<number | undefined> = [];
  if (withParen.length === ladder.groups.length) {
    for (const g of ladder.groups) {
      const rest = parseRecoveryClock(g.paren!);
      if (rest === undefined) return unprovable();
      rests.push(rest);
    }
  } else if (withParen.length > 0) {
    return unprovable();
  }
  const sets: PrescriptionSet[] = [];
  ladder.groups.forEach((g, gi) => {
    for (let i = 0; i < g.count; i++) {
      const s: PrescriptionSet = { measure: { kind: 'distance', meters: g.meters } };
      if (rests[gi] !== undefined) s.rest_s = rests[gi];
      sets.push(s);
    }
  });
  const p: Prescription = { scheme: 'intervals', rounds: sets.length, sets };
  const modality = modalityFrom(leftover);
  if (modality) p.modality = modality;
  const target = parseZoneTarget(line) ?? parseEffortTarget(line)?.target;
  if (target) p.target = target;
  return [finalizeDetected(leftover.replace(/\s+/g, ' ').trim(), p, line)];
}

// ── Bout chain (class 4: one item per bout, rest annexes attach) ─────────────

function tryBoutChain(line: string, segments: string[]): ParsedLine[] | null {
  const seedLabel = leadingColonLabel(line);
  const bouts: Array<{ seg: string; parsed: Parsed }> = [];
  for (const seg of segments) {
    if (isPureRest(seg)) {
      const rest = parseRest(seg);
      const prev = bouts[bouts.length - 1];
      if (!prev || rest === undefined) return null;
      if (prev.parsed.prescription.rest_s === undefined) prev.parsed.prescription.rest_s = rest;
      continue;
    }
    const bout = parseBout(seg);
    if (!bout) return null; // one untypable segment → the WHOLE line reviews
    bouts.push({ seg, parsed: bout });
  }
  if (bouts.length === 0) return null;
  // A line-level label ("ROW: 5' WU → 5x3'…") seeds modality/token into the
  // segments that name none — but never onto a "row/ski" CHOICE segment.
  const seedModality =
    bouts[0]!.parsed.prescription.modality ?? (seedLabel ? modalityFrom(seedLabel) : undefined);
  const seedToken = seedLabel ?? bouts[0]!.parsed.token;
  for (const b of bouts) {
    const mixed = isModalityChoice(b.seg) || cardioModalities(b.seg).length >= 2;
    if (!b.parsed.prescription.modality && seedModality && !mixed) {
      b.parsed.prescription.modality = seedModality;
    }
    if (!b.parsed.token && seedToken && !mixed) b.parsed.token = seedToken;
  }
  return bouts.map((b) => finalizeDetected(b.parsed.token, b.parsed.prescription, b.seg));
}
