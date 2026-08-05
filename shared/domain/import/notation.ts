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
//   ./result.ts   — ParsedLine + validate-or-downgrade constructors
// THIS file owns line dispatch: titles, continuations, chains, ladders, WODs.

import { type Modality, type Prescription, type PrescriptionSet } from '../prescription/types';
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
  cardioModalities,
  isBlockTitle,
  isModalityChoice,
  isNoiseLine,
  leadingColonLabel,
  modalityFrom,
  TARGET_ONLY_RE,
} from './label';
import { parseBout } from './bout';
import {
  parseCoreWorkRest,
  parseStrength,
  ROUNDS_HEADER_RE,
  tryRepPlusCombo,
  tryRoundsHeaderCombo,
  tryStrengthCombo,
} from './strength';
import { finalizeDetected, type Parsed, type ParsedLine, reviewLine } from './result';

// ── Public API (shape lives in ./result.ts; re-exported for stability) ────────

export type { NotationConfidence, ParsedLine } from './result';

/**
 * Parse ONE session cell (a day's Capa-2 text, possibly multi-line) into typed
 * prescription lines. Header/prose/coach-note lines are dropped; an ALL-CAPS
 * no-dose line is a block TITLE (its modality contextualizes the lines under
 * it); each remaining work line is typed (`detected`) or preserved (`review`).
 */
export function parseNotationCell(text: string): ParsedLine[] {
  const cell = normalizeNotation(text);
  const lines = joinContinuations(cell.split('\n'));
  const out: ParsedLine[] = [];
  let titleModality: Modality | undefined;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isBlockTitle(line)) {
      titleModality = modalityFrom(line);
      continue;
    }
    if (isNoiseLine(line)) continue;
    for (const parsed of parseLine(line)) {
      if (
        parsed.confidence === 'detected' &&
        titleModality &&
        !parsed.prescription.modality &&
        !isModalityChoice(parsed.exercise_token) &&
        cardioModalities(parsed.exercise_token || (parsed.prescription.note ?? '')).length < 2
      ) {
        parsed.prescription.modality = titleModality;
      }
      out.push(parsed);
    }
  }
  return out;
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
  if (/\b(wod|for ?time|amrap|emom|chipper|afap|hyrox|simulaci|death by|tabata|complex|intercal)\b/.test(n)) {
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
  const distTokens = seg.match(/\d+\s*k?m\b(?!\s*\/?\s*h)/gi) ?? [];
  if (distTokens.length >= 3) return true;
  if (distTokens.length >= 2 && seg.includes('/')) return true;
  // A HYROX station chained (+ / comma) with anything else → simulation piece.
  if (HYROX_STATION_RE.test(foldText(seg)) && /[+,]/.test(seg)) return true;
  return false;
}

// ── Line dispatch ────────────────────────────────────────────────────────────

function parseLine(line: string): ParsedLine[] {
  // "10' row + 10' ski …, todo Z2" — a trailing ALL-bouts target clause. It is
  // extracted first (its comma would otherwise trip the multi-station detector)
  // and distributed onto every typed bout that names no target of its own.
  const todo = line.match(/,\s*(?:todo|toda|todos|todas)\s+([^,]+)$/i);
  if (todo) {
    const tailTarget = parseZoneTarget(todo[1]!) ?? parseEffortTarget(todo[1]!)?.target;
    if (tailTarget && !/\d/.test(stripTargetTokens(todo[1]!))) {
      const parsed = parseLine(line.slice(0, todo.index!));
      for (const l of parsed) {
        if (l.confidence === 'detected' && !l.prescription.target) {
          l.prescription.target = tailTarget;
        }
      }
      return parsed;
    }
  }
  const ladder = tryDistanceLadder(line);
  if (ladder) return ladder;
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
  const strength = parseStrength(line);
  if (strength) return finalizeDetected(strength.token, strength.prescription, line);
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
