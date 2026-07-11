// bout — ONE continuous cardio/housekeeping effort: steady runs/erg pieces,
// warm-ups and cool-downs, mobility/walking blocks, and the interval shapes
// ("5x3'", "8x400m", "5x(4' Z3-Z4 / 1' Z2)"). Emits at most ONE prescription:
// multi-bout chains are split ABOVE this (./notation.ts) — this parser refuses
// heterogeneous input rather than fuse it (the honesty contract).

import { type Prescription, type Target } from '../prescription/types';
import {
  countIntervalGroups,
  paceUnitFrom,
  parseDistanceInterval,
  parseDistanceMeters,
  parseDuration,
  parseInterval,
  parseKg,
  parseLoadPctList,
  parsePaceCap,
  parsePaceClockTarget,
  parsePaceKmh,
  parseParenInterval,
  parseRepSeq,
  parseRest,
  parseRpeTarget,
  parseZoneTarget,
  stripLoadPct,
  stripTargetTokens,
} from './dose';
import {
  cardioModalities,
  type DoseFirstLabel,
  doseFirstLabel,
  extractLabel,
  isModalityChoice,
  leadingColonLabel,
  modalityFrom,
  structuralScheme,
} from './label';
import { type Parsed } from './result';

export function parseBout(seg: string): Parsed | null {
  if (countIntervalGroups(seg) >= 2) return null; // heterogeneous — never fuse
  const structural = structuralScheme(seg);
  // A bout naming SEVERAL cardio modalities ("row/ski", "(carrera + bike)") is
  // the athlete's mix/choice — the grammar must not pick one.
  const choice = isModalityChoice(seg) || cardioModalities(seg).length >= 2;
  const modality = choice ? undefined : modalityFrom(seg);
  const zone = parseZoneTarget(seg);
  const rpe = parseRpeTarget(seg);
  const paren = parseParenInterval(seg);
  const interval = paren ? null : parseInterval(seg);
  const distInterval = paren || interval ? null : parseDistanceInterval(seg);
  const kmh = parsePaceKmh(seg);
  const clockPace = parsePaceClockTarget(seg);
  const dur = parseDuration(seg);
  const dist = parseDistanceMeters(seg);
  const cap = parsePaceCap(seg);
  const rest = parseRest(seg);

  // A bout needs a bout signal. "duration + RPE" alone qualifies (class 2/9:
  // "5' RPE 3-4", "3' RPE 10") but ONLY on a line with no strength signal — a
  // rep scheme, %RM or kg means strength owns it.
  const strongSignal =
    modality !== undefined ||
    choice ||
    zone !== undefined ||
    paren !== null ||
    interval !== null ||
    distInterval !== null ||
    kmh !== null ||
    structural !== undefined;
  if (!strongSignal) {
    if (dur === undefined || rpe === null) return null;
    if (
      parseRepSeq(stripTargetTokens(stripLoadPct(seg))) ||
      parseLoadPctList(seg) ||
      parseKg(seg) !== undefined
    ) {
      return null;
    }
  }

  const label = boutLabel(seg, structural !== undefined);
  const paceTarget: Target | null = kmh
    ? { kind: 'pace', unit: kmh.unit, value_s: kmh.value_s }
    : clockPace;
  const noteBits: string[] = label.note ? [label.note] : [];

  // Parenthesized interval "5x(4' Z3-Z4 / 1' Z2)" — class 6.
  if (paren) {
    const p: Prescription = { scheme: 'intervals', rounds: paren.rounds, work_s: paren.work_s };
    if (paren.rest_s !== undefined) p.rest_s = paren.rest_s;
    if (paren.target) p.target = paren.target;
    if (modality) p.modality = modality;
    if (paren.rest_note) noteBits.push(`Recuperación: ${paren.rest_note}`);
    if (noteBits.length) p.note = noteBits.join(' · ');
    return { token: label.token, prescription: p };
  }

  // INTERVAL scheme: rounds + work window (time or distance) + rest + target.
  if (interval || distInterval) {
    const rounds = interval ? interval.rounds : distInterval!.rounds;
    const p: Prescription = { scheme: 'intervals', rounds };
    if (interval) p.work_s = interval.work_s;
    if (rest !== undefined) p.rest_s = rest;
    if (modality) p.modality = modality;
    if (distInterval) {
      p.sets = Array.from({ length: rounds }, () => ({
        measure: { kind: 'distance', meters: distInterval.meters },
      }));
    }
    const target = paceTarget ?? rpe?.target ?? zone;
    if (target) p.target = target;
    if (noteBits.length) p.note = noteBits.join(' · ');
    return { token: label.token, prescription: p };
  }

  // STEADY / WARM-UP / COOL-DOWN: one continuous bout (duration and/or distance).
  const p: Prescription = { scheme: structural ?? 'steady' };
  if (dur !== undefined) p.total_s = dur;
  if (dist !== undefined) p.sets = [{ measure: { kind: 'distance', meters: dist } }];
  const target = zone ?? paceTarget ?? rpe?.target;
  if (target) p.target = target;
  if (rpe && target !== rpe.target) noteBits.push(rpe.text); // secondary RPE, verbatim
  if (cap) p.pace_cap = cap;
  if (modality) p.modality = modality;
  // A rest equal to the bout's own duration is the bout misread as a rest cue
  // ("10' caminando" — the walk IS the work); anything else is a real rest.
  if (rest !== undefined && rest !== p.total_s) p.rest_s = rest;
  if (noteBits.length) p.note = noteBits.join(' · ');

  // Must carry SOME concrete dose, else it is just a header we mis-read.
  if (p.total_s === undefined && !p.sets && !p.target && !p.pace_cap) return null;
  return { token: label.token, prescription: p };
}

/** The bout's token: a leading "LABEL:", else the name BEFORE the dose, else
 *  the words AFTER the dose (class 8). Non-pace parentheticals become the note. */
function boutLabel(seg: string, structural: boolean): DoseFirstLabel {
  const parenNotes: string[] = [];
  seg.replace(/\(([^)]*)\)/g, (whole, inner: string) => {
    if (!paceUnitFrom(inner)) parenNotes.push(inner.trim());
    return whole;
  });
  const note = parenNotes.filter(Boolean).join(' · ') || undefined;
  const colon = leadingColonLabel(seg);
  if (colon) return note ? { token: colon, note } : { token: colon };
  const nameFirst = extractLabel(seg);
  if (nameFirst) return note ? { token: nameFirst, note } : { token: nameFirst };
  return doseFirstLabel(seg, { structural });
}
