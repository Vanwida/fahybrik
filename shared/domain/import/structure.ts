// structure — the metcon STRUCTURE micro-grammar: rounds of several
// components (each with its OWN measure), an EMOM/tabata work window chained
// with a plain for-time finish, EMOM rotation across stations, a shared
// WOD-level time cap, and a trailing Finisher. Same honesty contract as every
// sibling in this directory (see ./notation.ts's module comment): FAITHFUL OR
// REVIEW — every "+"-joined component must type or the WHOLE line declines
// (returns null) so the caller falls through to the dense-WOD blanket review.
// Nothing here ever invents a number; a component with no provable measure
// forces the whole group to decline rather than ship a bare round count.
//
// Module map:
//   tryRoundsComponents — "Nr: A + B + C [– TCn'] [+ Finisher N name]" and its
//                          per-component sibling "4r A + 3r B + 2r C" (a
//                          descending pyramid by component) — every component
//                          measured in reps, distance or calories.
//   tryStructuredChain   — "EMOM N': movement [kg]" / "45''on/15''off xNr
//                          movement [kg]" / "For Time movement [kg]" chained
//                          with "+", sharing one WOD-level time cap.
//   tryEmomRotation      — "EMOM N': A/B/C/D" — N minutes ÷ station count,
//                          only when that division is EXACT (an uneven split
//                          would need to invent which stations get the extra
//                          round, which this grammar never does).
//   tryMetconStructure   — the single entry point notation.ts calls, trying
//                          the three above in order.
//
// WOD-LEVEL TIME CAP — why it sometimes lands on `target` and sometimes on
// `total_s`: `Prescription.total_s` is a single number, so a RANGE cap
// ("TC10-12'") can only be typed via `target:{kind:'time_cap',min_s,max_s}` —
// but `target` is also where a component's own load (kg) lives, and a
// Prescription carries exactly one. A single-value cap ("TC55'") always goes
// to `total_s` instead, which never collides with a component's own target —
// so it is ALWAYS safe to attach. A range cap only attaches when NO component
// in the group already carries a target of its own; otherwise the group
// declines (a real, documented model boundary — see the delivery notes).

import { type Prescription, type PrescriptionSet, type Target } from '../prescription/types';
import { parseImplementLoad, parseKg } from './dose';
import { modalityFrom } from './label';
import { parseKgRange, parseTimeCapTarget, TIME_CAP_CUE_RE } from './target';
import { finalizeDetected, type ParsedLine } from './result';

// ── Shared helpers ───────────────────────────────────────────────────────────

const WOD_NOISE_PREFIX_RE = /^\s*(?:wod\s+for\s*time|wod|metcon|for\s*time)\b\s*[:.]?\s*/i;

/** A shared round header ALWAYS ends in a colon ("WOD 5r:", "8 rounds:") — the
 *  colon is what tells the reader "everything after this is the component
 *  list", and is what distinguishes it from the per-component form below
 *  (which has no colon: "4r sled pull"). Requiring it here means a line whose
 *  "5 rounds" is followed by something this module cannot also parse (a rest
 *  clause, "5 rounds c/2': …") fails this match cleanly instead of silently
 *  swallowing part of it. */
const SHARED_ROUNDS_HEADER_RE = /^\s*(\d+)\s*(?:r|rounds?|rondas?|series)\b\s*:\s*/i;

/** A per-component round count never carries a colon: "4r sled pull/drag". */
const COMPONENT_ROUNDS_PREFIX_RE = /^\s*(\d+)\s*r\b\s*/i;

const FINISHER_LEADING_RE = /^\s*finisher\s*:?\s*(\d+)\s+(.+)$/i;
const FINISHER_TRAILING_RE = /^\s*(\d+)\s+(.+?)\s+finisher\s*$/i;

interface FinisherPiece {
  reps: number;
  name: string;
}

/** "Finisher 100 lunges" (leading) or "110 wall balls finisher" (trailing) —
 *  a piece done ONCE, apart from the round-repeated components (never given
 *  the group's `rounds`). Tried on the LAST "+"-segment only. */
function extractFinisher(segment: string): FinisherPiece | null {
  const lead = segment.match(FINISHER_LEADING_RE);
  if (lead) return { reps: parseInt(lead[1]!, 10), name: lead[2]!.trim() };
  const trail = segment.match(FINISHER_TRAILING_RE);
  if (trail) return { reps: parseInt(trail[1]!, 10), name: trail[2]!.trim() };
  return null;
}

// A single prime clock only — "(?!\s*\d+\s*'')" refuses to match just the
// MINUTES half of a compound "1'50''" clock (a shape this module's corpus
// never uses but the wider grammar does, e.g. "Row 500m, cap 1'50''" — a
// residue-guard/class-23 fixture this must never mis-clip). Reuses target.ts's
// own (now glued-digit-aware) TIME_CAP_CUE_RE so "TC55'" and "cap 55'" are
// recognized identically everywhere in the grammar — one cue, one place.
const CAP_CLAUSE_LOCATE_RE = new RegExp(
  `[\\s–—-]*${TIME_CAP_CUE_RE.source}\\d+\\s*(?:[-–—]\\s*\\d+\\s*)?'(?!\\s*\\d+\\s*'')`,
  'i',
);

interface CapExtraction {
  capText: string;
  target: Target;
  remainder: string;
}

/** Locates and strips a trailing "– TC55'" / "TC10-12'" clause, delegating
 *  the actual value parsing to ./target.ts's parseTimeCapTarget (DRY — this
 *  module only owns FINDING the clause's span so the components list can be
 *  isolated from it). */
function extractTrailingCap(s: string): CapExtraction | null {
  const m = s.match(CAP_CLAUSE_LOCATE_RE);
  if (!m) return null;
  const target = parseTimeCapTarget(m[0]);
  if (!target) return null;
  const remainder = (s.slice(0, m.index!) + s.slice(m.index! + m[0].length)).trim();
  return { capText: m[0].trim(), target, remainder };
}

interface MovementAndLoad {
  token: string;
  target?: Target;
}

/** The movement name plus an optional kg load ("sled push 170kg" → {token:
 *  "sled push", target:{kind:'kg',value:170}}). Null when nothing but dose
 *  debris survives (never emit an empty exercise name). */
function parseMovementAndLoad(text: string): MovementAndLoad | null {
  const kgRange = parseKgRange(text);
  const implement = kgRange ? undefined : parseImplementLoad(text);
  const kg = kgRange || implement ? undefined : parseKg(text);
  let name = text;
  if (kgRange) {
    name = text.replace(/@?\s*\d+(?:[.,]\d+)?\s*[-–—]\s*\d+(?:[.,]\d+)?\s*kg\b/i, '');
  } else if (implement) {
    name = text.replace(/@\s*\d+\s*x\s*\d+(?:[.,]\d+)?\s*(?:kg)?\b/i, '');
  } else if (kg !== undefined) {
    name = text.replace(/@?\s*\d+(?:[.,]\d+)?\s*kg\b/i, '');
  }
  const token = name.replace(/\s+/g, ' ').trim();
  if (!token) return null;
  const target: Target | undefined = kgRange
    ? { kind: 'kg', min: kgRange.min, max: kgRange.max }
    : implement
      ? { kind: 'kg', value: implement.value, implement_count: implement.implement_count }
      : kg !== undefined
        ? { kind: 'kg', value: kg }
        : undefined;
  return target ? { token, target } : { token };
}

// ── FORM 1 — rounds + measured components ───────────────────────────────────

interface ComponentDose {
  measure: PrescriptionSet['measure'];
  token: string;
  target?: Target;
}

/** One component's dose: a leading distance ("20m SB lunge"), calories
 *  ("14cal skierg" / "10 cal AB"), or bare reps ("24 wall balls") — tried in
 *  that order so a distance/calorie unit is never misread as a rep count.
 *  Null when the component carries no provable measure at all — FAITHFUL OR
 *  REVIEW means the caller must then decline the WHOLE group, never type the
 *  others and silently drop this one. */
function parseComponentDose(text: string): ComponentDose | null {
  const s = text.trim();
  let m = s.match(/^(\d+)\s*m\b\s*(.+)$/i);
  if (m) {
    const rest = parseMovementAndLoad(m[2]!);
    if (!rest) return null;
    return { measure: { kind: 'distance', meters: parseInt(m[1]!, 10) }, token: rest.token, target: rest.target };
  }
  m = s.match(/^(\d+)\s*cal(?:or[ií]as?)?\b\s*(.+)$/i);
  if (m) {
    const rest = parseMovementAndLoad(m[2]!);
    if (!rest) return null;
    return { measure: { kind: 'calories', value: parseInt(m[1]!, 10) }, token: rest.token, target: rest.target };
  }
  m = s.match(/^(\d+)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ].*)$/);
  if (m) {
    const rest = parseMovementAndLoad(m[2]!);
    if (!rest) return null;
    return { measure: { kind: 'reps', value: parseInt(m[1]!, 10) }, token: rest.token, target: rest.target };
  }
  return null;
}

/**
 * "WOD 5r: 24 wall balls + 20m SB lunge + 14cal skierg + 8 devil press –
 * TC55'" — a shared round count applied to every "+"-joined component, each
 * measured on its own; or its pyramid sibling "4r sled pull + 3r SB lunge +
 * 2r burpee BB + 1r wall balls" where EACH component carries its own round
 * count. An optional trailing time cap and/or Finisher piece complete it.
 * Declines (null) the instant any component lacks a provable measure or the
 * header shape is inconsistent — never a partial group.
 */
export function tryRoundsComponents(line: string): ParsedLine[] | null {
  const stripped = line.replace(WOD_NOISE_PREFIX_RE, '');

  const capMatch = extractTrailingCap(stripped);
  const body = capMatch ? capMatch.remainder : stripped;

  const segments = body.split('+').map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return null;

  let finisher: FinisherPiece | null = null;
  if (segments.length >= 3) {
    const maybe = extractFinisher(segments[segments.length - 1]!);
    if (maybe) {
      finisher = maybe;
      segments.pop();
    }
  }
  if (segments.length < 2) return null;

  const headerMatch = segments[0]!.match(SHARED_ROUNDS_HEADER_RE);
  const sharedRounds = headerMatch ? parseInt(headerMatch[1]!, 10) : null;
  if (headerMatch) segments[0] = segments[0]!.slice(headerMatch[0].length);

  const parsedComponents: Array<{ rounds: number; dose: ComponentDose; segText: string }> = [];
  for (const original of segments) {
    let roundsForThis = sharedRounds;
    let doseText = original;
    if (roundsForThis === null) {
      const perMatch = original.match(COMPONENT_ROUNDS_PREFIX_RE);
      if (!perMatch) return null; // inconsistent header shape — not this form
      roundsForThis = parseInt(perMatch[1]!, 10);
      doseText = original.slice(perMatch[0].length);
    }
    const dose = parseComponentDose(doseText);
    if (!dose) return null; // every component needs a measure, or the group reviews whole
    parsedComponents.push({ rounds: roundsForThis, dose, segText: original });
  }

  const cap = capMatch?.target;
  const capIsRange = cap?.kind === 'time_cap' && cap.min_s !== undefined;
  if (capIsRange && parsedComponents.some((c) => c.dose.target)) return null; // see module comment

  const out: ParsedLine[] = [];
  for (const { rounds, dose, segText } of parsedComponents) {
    const sets: PrescriptionSet[] = Array.from({ length: rounds }, () => ({
      measure: dose.measure,
      ...(dose.target ? { target: dose.target } : {}),
    }));
    const p: Prescription = { scheme: 'for_time', rounds, sets, modality: modalityFrom(dose.token) ?? 'functional' };
    let raw = segText;
    if (cap?.kind === 'time_cap' && cap.value_s !== undefined) {
      p.total_s = cap.value_s;
      raw = `${segText} ${capMatch!.capText}`;
    } else if (capIsRange && !dose.target) {
      p.target = cap!;
      raw = `${segText} ${capMatch!.capText}`;
    }
    out.push(finalizeDetected(dose.token, p, raw));
  }

  if (finisher) {
    const rest = parseMovementAndLoad(finisher.name);
    if (!rest) return null; // the Finisher is part of this group's honesty too
    const p: Prescription = {
      scheme: 'for_time',
      sets: [{ measure: { kind: 'reps', value: finisher.reps }, ...(rest.target ? { target: rest.target } : {}) }],
      modality: modalityFrom(rest.token) ?? 'functional',
    };
    out.push(finalizeDetected(rest.token, p, `${finisher.reps} ${finisher.name}`));
  }

  return out;
}

// ── FORM 2/3 — EMOM / work-rest / for-time chain, one shared time cap ───────

const ONOFF_RE = /^\s*(\d+)\s*''\s*on\s*\/\s*(\d+)\s*''\s*off\s*x\s*(\d+)\s*r\b\s*(.*)$/i;
const EMOM_HEAD_RE = /^\s*emom\s+(\d+)\s*'\s*:?\s*(.*)$/i;
const FOR_TIME_HEAD_RE = /^\s*for\s*time\s+(.+)$/i;

interface ChainLink {
  p: Prescription;
  token: string;
  segText: string;
  /** True when the piece already defines its own duration (EMOM/tabata via
   *  rounds×work_s) — such a piece never receives the WOD-level cap, since
   *  that would silently overwrite/duplicate a duration the text ALREADY
   *  states, rather than fill a gap. */
  ownsDuration: boolean;
}

function parseChainLink(seg: string): ChainLink | null {
  const onoff = seg.match(ONOFF_RE);
  if (onoff) {
    const rest = parseMovementAndLoad(onoff[4]!);
    if (!rest) return null;
    const p: Prescription = {
      scheme: 'tabata',
      work_s: parseInt(onoff[1]!, 10),
      rest_s: parseInt(onoff[2]!, 10),
      rounds: parseInt(onoff[3]!, 10),
      modality: modalityFrom(rest.token) ?? 'functional',
    };
    if (rest.target) p.target = rest.target;
    return { p, token: rest.token, segText: seg, ownsDuration: true };
  }
  const emom = seg.match(EMOM_HEAD_RE);
  if (emom) {
    const tail = emom[2]!.trim();
    if (!tail || tail.includes('/')) return null; // a rotation list is tryEmomRotation's job
    const rest = parseMovementAndLoad(tail);
    if (!rest) return null;
    const p: Prescription = {
      scheme: 'emom',
      rounds: parseInt(emom[1]!, 10),
      work_s: 60,
      modality: modalityFrom(rest.token) ?? 'functional',
    };
    if (rest.target) p.target = rest.target;
    return { p, token: rest.token, segText: seg, ownsDuration: true };
  }
  const forTime = seg.match(FOR_TIME_HEAD_RE);
  if (forTime) {
    const rest = parseMovementAndLoad(forTime[1]!);
    if (!rest) return null;
    const p: Prescription = { scheme: 'for_time', modality: modalityFrom(rest.token) ?? 'functional' };
    if (rest.target) p.target = rest.target;
    return { p, token: rest.token, segText: seg, ownsDuration: false };
  }
  return null;
}

/**
 * "EMOM 10' sled push 170kg + For Time sled pull 140kg – TC12'" — each
 * "+"-joined piece keeps its OWN structure (a work-rest window, an EMOM
 * cadence, or a plain for-time movement); a single-value WOD-level cap fills
 * `total_s` on whichever pieces do not already define their own duration. A
 * RANGE cap needs the `target` slot instead, so it only attaches when none of
 * those pieces already carry a load — same boundary as tryRoundsComponents.
 */
export function tryStructuredChain(line: string): ParsedLine[] | null {
  const capMatch = extractTrailingCap(line);
  const body = capMatch ? capMatch.remainder : line;

  const segments = body.split('+').map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  const links: ChainLink[] = [];
  for (const seg of segments) {
    const link = parseChainLink(seg);
    if (!link) return null; // one unrecognized link breaks the whole chain
    links.push(link);
  }

  const cap = capMatch?.target;
  const capIsRange = cap?.kind === 'time_cap' && cap.min_s !== undefined;
  // Only pieces that don't already define their own duration (see ChainLink's
  // `ownsDuration` doc comment) are candidates for the shared cap.
  const needsDuration = links.filter((l) => !l.ownsDuration && l.p.total_s === undefined);

  if (cap?.kind === 'time_cap' && cap.value_s !== undefined) {
    // A point cap fills `total_s` — a field distinct from `target`, so it is
    // ALWAYS safe even for a piece that already carries its own kg load.
    for (const link of needsDuration) link.p.total_s = cap.value_s;
  } else if (capIsRange) {
    // A range cap can only live in `target` — decline rather than silently
    // drop a piece's own load to make room for it (see module comment).
    if (needsDuration.some((l) => l.p.target !== undefined)) return null;
    for (const link of needsDuration) link.p.target = cap;
  }

  return links.map((link) => {
    const gotCap = cap && !link.ownsDuration && (link.p.total_s !== undefined || link.p.target === cap);
    const raw = gotCap ? `${link.segText} ${capMatch!.capText}` : link.segText;
    return finalizeDetected(link.token, link.p, raw);
  });
}

// ── FORM 4 — EMOM rotation across stations ───────────────────────────────────

const EMOM_ROTATION_HEAD_RE = /^\s*emom\s+(\d+)\s*'\s*:?\s*(.+)$/i;

/**
 * "EMOM 16': DB snatch/KPU/wall climb/burpee broad jump" — N stations rotate
 * one per minute; each gets `minutes ÷ stationCount` rounds, ONLY when that
 * division is exact. An uneven split ("EMOM 20', 8 estaciones") would need to
 * invent WHICH stations get the extra round, which this grammar never does —
 * it declines whole rather than guess. No reps are typed per station (none
 * are written): the work_s window itself IS the honest dose, exactly like a
 * plain "EMOM 10' burpees" carries no rep count either.
 */
export function tryEmomRotation(line: string): ParsedLine[] | null {
  const m = line.match(EMOM_ROTATION_HEAD_RE);
  if (!m) return null;
  const minutes = parseInt(m[1]!, 10);
  const tail = m[2]!.trim();
  if (!tail.includes('/')) return null; // a single movement — tryStructuredChain's job

  const stations = tail.split('/').map((s) => s.trim()).filter(Boolean);
  if (stations.length < 2) return null;
  if (minutes % stations.length !== 0) return null; // cannot honestly assign the remainder

  const roundsPer = minutes / stations.length;
  const out: ParsedLine[] = [];
  for (const station of stations) {
    const dose = parseMovementAndLoad(station);
    if (!dose) return null;
    const p: Prescription = {
      scheme: 'emom',
      rounds: roundsPer,
      work_s: 60,
      modality: modalityFrom(dose.token) ?? 'functional',
    };
    if (dose.target) p.target = dose.target;
    out.push(finalizeDetected(dose.token, p, station));
  }
  return out;
}

// ── Entry point ───────────────────────────────────────────────────────────

/** Tried by notation.ts BEFORE isDenseWod's blanket review — every attempt is
 *  FAITHFUL OR REVIEW on its own, so trying them in sequence never risks a
 *  partial/lucky match: the first to fully succeed wins, and if none do, the
 *  caller falls through to the existing dense-WOD/chain/segment dispatch
 *  completely unchanged. */
export function tryMetconStructure(line: string): ParsedLine[] | null {
  return tryRoundsComponents(line) ?? tryStructuredChain(line) ?? tryEmomRotation(line);
}
