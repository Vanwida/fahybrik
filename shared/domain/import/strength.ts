// strength — every SETS-scheme reading of a notation line: the classic
// name-first pyramid ("Back Squat … 10/10/8/8/6 — 60/…% RM"), reps-first
// movements ("5 rounds c/2': 3 Power Clean 70-80%"), per-side reps ("RDL
// 8/lado"), timed sets ("3' max SB walking lunge 20kg"), and the three combo
// forms that split one physical line into one typed line per movement.
// FAITHFUL OR REVIEW: a combo types only when EVERY movement types.

import { type Prescription, type PrescriptionSet, type Target } from '../prescription/types';
import {
  parseEffortTarget,
  parseKg,
  parseLoadPctList,
  parseRepRange,
  parseRepSeq,
  parseRest,
  parseSetCount,
  parseSetsByRepRange,
  parseSetsByReps,
  stripLoadPct,
  stripTargetTokens,
} from './dose';
import { doseFirstLabel, extractLabel, modalityFrom } from './label';
import { finalizeDetected, type Parsed, type ParsedLine } from './result';

/** "N rounds/rondas/series [c/rest] [:]" — the shared circuit header. */
export const ROUNDS_HEADER_RE =
  /^\s*(\d+)\s*(?:rounds|rondas|series|vueltas)\b\s*(?:c\/\s*\d+\s*'(?:\s*\d+\s*'')?\s*)?[:.]?\s*/i;

// ── Combos (one physical line → one typed line per movement) ─────────────────

/** "10+10 Step Ups Cajón" — a movement named ONCE after a chain of bare rep
 *  counts. FIEL O REVIEW reads "+" exactly as it reads everywhere ELSE in this
 *  grammar (a SEPARATOR between discrete units, never a sum): each addend
 *  becomes its OWN set of that many reps of the one movement named at the
 *  end — 2 sets of 10, never "20 reps" (that sums the text) and never "10 per
 *  side" (that claims an alternating/unilateral reading the bare "+" does not
 *  say — "/lado" is the text that proves that, see parseStrength above).
 *  Needs no new schema field: PrescriptionSet is already an array, so a
 *  literal reading of "+" as "another set" costs nothing extra to represent. */
export function tryRepPlusCombo(line: string): ParsedLine[] | null {
  if (!line.includes('+')) return null;
  const segs = line.split('+').map((s) => s.trim()).filter(Boolean);
  if (segs.length < 2) return null;
  const values: number[] = [];
  for (const seg of segs.slice(0, -1)) {
    if (!/^\d{1,2}$/.test(seg)) return null; // every addend but the last must be a BARE count
    values.push(parseInt(seg, 10));
  }
  const last = segs[segs.length - 1]!;
  const m = last.match(/^(\d{1,2})\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\- ]*)$/);
  if (!m) return null;
  values.push(parseInt(m[1]!, 10));
  const token = m[2]!.replace(/\s+/g, ' ').trim();
  if (!token) return null;
  const sets: PrescriptionSet[] = values.map((value) => ({ measure: { kind: 'reps', value } }));
  return [finalizeDetected(token, { scheme: 'sets', modality: 'strength', sets }, line)];
}

/** A clean strength combo ("A 5r <scheme> + B 5r <scheme>") splits on "+" into
 *  one typed line per movement. */
export function tryStrengthCombo(line: string): ParsedLine[] | null {
  if (!line.includes('+')) return null;
  const segs = line.split('+').map((s) => s.trim()).filter(Boolean);
  if (segs.length < 2) return null;
  const parsed = segs.map((s) => parseStrength(s));
  if (parsed.some((p) => p === null)) return null; // not a clean all-strength chain
  return parsed.map((p, i) => finalizeDetected(p!.token, p!.prescription, segs[i]!));
}

/** "N rounds [c/rest]: k Move1 [load] + k Move2 [load]" (class 5) — every
 *  movement gets N sets × its OWN reps/load, sharing rounds and rest. */
export function tryRoundsHeaderCombo(line: string): ParsedLine[] | null {
  const header = line.match(ROUNDS_HEADER_RE);
  if (!header) return null;
  const rounds = parseInt(header[1]!, 10);
  if (!(rounds >= 1)) return null;
  const rest = parseRest(line);
  const segs = line.slice(header[0]!.length).split('+').map((s) => s.trim()).filter(Boolean);
  if (segs.length < 2) return null;
  const moves = segs.map(parseRepsFirstMovement);
  if (moves.some((mv) => mv === null)) {
    return trySharedSchemeCombo(rounds, segs, rest);
  }
  return moves.map((mv, i) => {
    const sets: PrescriptionSet[] = Array.from({ length: rounds }, () => {
      const s: PrescriptionSet = { measure: { kind: 'reps', value: mv!.reps } };
      if (mv!.target) s.target = mv!.target;
      if (rest !== undefined) s.rest_s = rest;
      return s;
    });
    return finalizeDetected(mv!.token, { scheme: 'sets', modality: 'strength', sets }, segs[i]!);
  });
}

/** "4 rounds Pull-ups + Dips 10-10-8-8" — a superset SHARING one rep scheme:
 *  exactly ONE segment (the last) carries a rep sequence whose length equals
 *  the round count; every other segment is a bare, digit-free movement name.
 *  Both movements get the scheme — the old parser reviewed the whole line. */
function trySharedSchemeCombo(
  rounds: number,
  segs: string[],
  rest: number | undefined,
): ParsedLine[] | null {
  const last = segs[segs.length - 1]!;
  const names = segs.slice(0, -1);
  if (names.length === 0 || names.some((n) => /\d/.test(n))) return null;
  const seq = parseRepSeq(stripTargetTokens(stripLoadPct(last)));
  if (!seq || seq.length !== rounds) return null; // scheme↔rounds mismatch — not provable
  const lastName = extractLabel(last);
  if (!lastName) return null;
  const movements = [...names.map((n) => n.trim()), lastName];
  return movements.map((token, i) => {
    const sets: PrescriptionSet[] = seq.map((reps) => {
      const s: PrescriptionSet = { measure: { kind: 'reps', value: reps } };
      if (rest !== undefined) s.rest_s = rest;
      return s;
    });
    return finalizeDetected(
      token,
      { scheme: 'sets', modality: 'strength', sets },
      segs[Math.min(i, segs.length - 1)]!,
    );
  });
}

/** "3 Power Clean 70-80%" / "5 high box jump" — a reps-FIRST movement: leading
 *  rep count (1-2 digits), a digit-free name, an optional %RM (point/range) or
 *  kg load. Trailing rest clauses are ignored (read by parseRest on the line). */
function parseRepsFirstMovement(
  seg: string,
): { reps: number; token: string; target?: Target } | null {
  const s = seg
    .replace(/[/\-–—]?\s*\d+\s*'{1,2}\s*(?:de\s+)?(?:rest|descanso|recovery)\s*$/i, '')
    .trim();
  const m = s.match(
    /^(\d{1,2})\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\- ]*?)\s*(?:(\d+(?:[/\-]\d+)*)\s*%(?:\s*rm)?|(\d+(?:[.,]\d+)?)\s*kg)?\s*$/i,
  );
  if (!m) return null;
  const reps = parseInt(m[1]!, 10);
  const token = m[2]!.replace(/\s+/g, ' ').trim();
  if (!token) return null;
  let target: Target | undefined;
  if (m[3] !== undefined) {
    const parts = m[3].split(/[/\-]/).map((x) => parseInt(x, 10));
    if (parts.length === 1) target = { kind: 'percent_rm', value: parts[0]! };
    else if (parts.length === 2 && parts[0]! <= parts[1]!) {
      target = { kind: 'percent_rm', min: parts[0]!, max: parts[1]! };
    } else return null; // a per-set % list cannot pair with ONE rep count — not provable
  } else if (m[4] !== undefined) {
    target = { kind: 'kg', value: parseFloat(m[4].replace(',', '.')) };
  }
  return { reps, token, ...(target ? { target } : {}) };
}

// ── Single strength line ─────────────────────────────────────────────────────
// "5 rounds Back Squat c/2'30\": 10/10/8/8/6 — 60/65/70/70/75% RM"
// "Deadlift 5r 10/10/8/6/4"   "5 rounds c/2': 3 Power Clean 70-80%"

export function parseStrength(seg: string): Parsed | null {
  const stripped = stripTargetTokens(stripLoadPct(seg));
  // "Sentadilla 4x12-15" — sets × a rep BAND, read before anything else can
  // misparse "12-15" as a 2-element sequence (12 reps, then 15).
  const setsByRange = parseSetsByRepRange(seg);
  const setCount = parseSetCount(seg);
  // "4 series de 12-15 repeticiones" — same band, spelled with an explicit set
  // count instead of "Nx". A BARE range with no multiplier anywhere ("12-15
  // repeticiones" alone) has no sets to repeat it over, so it is intentionally
  // left unclaimed here — it falls through to the plain sequence reader below,
  // which reads it as one un-named set of two reps and then reviews for lack
  // of a movement name (the existing counter-word guard in ./result.ts).
  const repRange = !setsByRange && setCount !== undefined ? parseRepRange(stripped) : null;
  // Target clauses are stripped BEFORE the rep-scheme read so "RPE 3-4" or
  // "Z3-4" can never masquerade as reps (class 2).
  const reps = setsByRange || repRange ? null : parseRepSeq(stripped);
  const nxm = reps || setsByRange ? null : parseSetsByReps(seg);
  const loadList = parseLoadPctList(seg);
  const kg = parseKg(seg);
  const rest = parseRest(seg);
  // Proximity-to-failure ("RIR 2", "RPE 8") is the intensity when the line
  // carries no %RM and no kg — which is most of a real strength block. It was
  // stripped before the rep read (above) and then never typed at all.
  const effort = parseEffortTarget(seg)?.target;

  const repsMax = setsByRange?.max ?? repRange?.max;
  let perSetReps =
    reps ??
    (setsByRange
      ? Array.from({ length: setsByRange.sets }, () => setsByRange.value)
      : repRange
        ? Array.from({ length: setCount! }, () => repRange.value)
        : nxm
          ? Array.from({ length: nxm.sets }, () => nxm.reps)
          : null);
  let token: string | null = null;
  let repsFirstTarget: Target | undefined;
  let usedRepsFirst = false;

  // "N rounds [c/rest]: k Movement [load]" — the reps ride IN FRONT of the
  // movement (class 5's single-movement form): N sets × k reps.
  if (!perSetReps && setCount !== undefined) {
    const header = seg.match(ROUNDS_HEADER_RE);
    if (header) {
      const mv = parseRepsFirstMovement(seg.slice(header[0]!.length));
      if (mv) {
        perSetReps = Array.from({ length: setCount }, () => mv.reps);
        token = mv.token;
        repsFirstTarget = mv.target;
        usedRepsFirst = true;
      }
    }
  }

  // "4 rounds Bulgarian split squat 8/lado" — per-SIDE reps. The count is in
  // the text (8, each side); the side qualifier is kept verbatim in the note
  // (the model has no per-side field yet).
  const perSide = seg.match(/(\d{1,2})\s*\/\s*lado\b/i);
  if (!perSetReps && setCount !== undefined && perSide) {
    perSetReps = Array.from({ length: setCount }, () => parseInt(perSide[1]!, 10));
  }

  // "3 rounds 3' max SB walking lunge 20kg" — TIMED sets: the work is measured
  // in seconds, not reps.
  const timedMax =
    !perSetReps && setCount !== undefined ? seg.match(/(\d+)\s*('{1,2})\s*max\b/i) : null;
  const timedSetSeconds = timedMax
    ? parseInt(timedMax[1]!, 10) * (timedMax[2] === "'" ? 60 : 1)
    : undefined;

  // Needs a real dosing signal: a per-set/NxM/reps-first scheme, a timed set,
  // OR a set count with a load. Otherwise it is not confidently strength.
  if (
    !perSetReps &&
    timedSetSeconds === undefined &&
    !(setCount !== undefined && (loadList || kg !== undefined))
  ) {
    return null;
  }

  // COVERAGE: a clock the strength reading did not consume (as rest, cada or a
  // timed set) means the line carries work this parser would silently drop
  // ("4-5 strides de 30''") — not a provable strength line.
  let clockScan = seg
    .replace(/c\/\s*\d+\s*'(?:\s*\d+\s*'')?/gi, ' ')
    .replace(
      /[/\-–—]?\s*\d+\s*'(?:\s*\d+\s*'')?\s*(?:de\s+)?(?:rest|descanso|recovery|walking|caminando|trote|off|float|est[aá]tico)/gi,
      ' ',
    )
    .replace(/\d+\s*''\s*(?:rest|descanso|recovery|walking|off|float|est[aá]tico)/gi, ' ');
  if (timedMax) clockScan = clockScan.replace(/\d+\s*'{1,2}\s*max\b/gi, ' ');
  if (/\d\s*'{1,2}/.test(clockScan)) return null;

  const p: Prescription = { scheme: 'sets', modality: 'strength' };
  const nSets = perSetReps?.length ?? setCount ?? 1;
  const sets: PrescriptionSet[] = [];
  for (let i = 0; i < nSets; i++) {
    const s: PrescriptionSet = {};
    if (perSetReps) {
      s.measure =
        repsMax !== undefined
          ? { kind: 'reps', value: perSetReps[i]!, max: repsMax }
          : { kind: 'reps', value: perSetReps[i]! };
    } else if (timedSetSeconds !== undefined) {
      s.measure = { kind: 'duration', seconds: timedSetSeconds };
    }
    const target =
      (usedRepsFirst ? repsFirstTarget : strengthTargetForSet(loadList, kg, i, nSets)) ?? effort;
    if (target) s.target = target;
    if (rest !== undefined) s.rest_s = rest;
    sets.push(s);
  }
  p.sets = sets;
  if (perSide) p.note = perSide[0]!.replace(/\s+/g, ''); // the verbatim "8/lado"
  // Rep-scheme-FIRST lines ("30-25-20-15 Power Clean 40kg") have no text before
  // the first digit — the token is whatever words remain after the dose.
  return { token: token ?? (extractLabel(seg) || doseFirstLabel(seg).token), prescription: p };
}

/** Intensity for set `i`: a per-set %RM list (len==sets), a 2-value %RM RANGE,
 *  a single %RM, or a kg load. */
function strengthTargetForSet(
  loadList: number[] | null,
  kg: number | undefined,
  i: number,
  nSets: number,
): Target | undefined {
  if (loadList) {
    if (loadList.length === nSets && nSets >= 2) return { kind: 'percent_rm', value: loadList[i]! };
    if (loadList.length >= 3) {
      // more graded values than sets — clamp to available, else use last.
      return { kind: 'percent_rm', value: loadList[Math.min(i, loadList.length - 1)]! };
    }
    if (loadList.length === 2) return { kind: 'percent_rm', min: loadList[0]!, max: loadList[1]! };
    if (loadList.length === 1) return { kind: 'percent_rm', value: loadList[0]! };
  }
  if (kg !== undefined) return { kind: 'kg', value: kg };
  return undefined;
}

// ── Core work/rest parser ("Side plank 4x40''/20''") ─────────────────────────

export function parseCoreWorkRest(seg: string): Parsed | null {
  const m = seg.match(/(\d+)\s*x\s*(\d+)\s*''\s*\/\s*(\d+)\s*''/);
  if (!m) return null;
  const rounds = parseInt(m[1]!, 10);
  const p: Prescription = {
    scheme: 'intervals',
    rounds,
    work_s: parseInt(m[2]!, 10),
    rest_s: parseInt(m[3]!, 10),
  };
  p.modality = modalityFrom(seg) ?? 'core';
  return { token: extractLabel(seg), prescription: p };
}
