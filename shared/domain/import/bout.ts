// bout — ONE continuous cardio/housekeeping effort: steady runs/erg pieces,
// warm-ups and cool-downs, mobility/walking blocks, and the interval shapes
// ("5x3'", "8x400m", "5x(4' Z3-Z4 / 1' Z2)"). Emits at most ONE prescription:
// multi-bout chains are split ABOVE this (./notation.ts) — this parser refuses
// heterogeneous input rather than fuse it (the honesty contract).

import { type Prescription, type Target } from '../prescription/types';
import {
  countIntervalGroups,
  parseDistanceInterval,
  parseDistanceMeters,
  parseDuration,
  parseImplementLoad,
  parseInterval,
  parseKg,
  parseLoadPctList,
  parseParenInterval,
  parseRepSeq,
  parseRest,
  parseEffortTarget,
  parseZoneTarget,
  stripLoadPct,
  stripTargetTokens,
} from './dose';
import {
  paceUnitFrom,
  parseCaloriesGoalTarget,
  parseHrBpmTarget,
  parseMilesMeters,
  parsePaceCap,
  parsePaceClockTarget,
  parsePaceKmh,
  parseTimeCapTarget,
  parseWattsTarget,
} from './target';
import { parseCaloriesInterval, parseDistanceIntervalRange, parseIntervalWordClock } from './measure';
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
  const rpe = parseEffortTarget(seg);
  const paren = parseParenInterval(seg);
  const interval = paren ? null : parseInterval(seg);
  // distIntervalRange MUST be tried before the plain distInterval: dose.ts's
  // parseDistanceInterval has a bare "Nx\d{3,4}" fallback alternative that
  // matches the FLOOR of "6x800-1000m" too (it has no awareness of what
  // follows), so computing distInterval first would always win and the range
  // reader below would never even run — the exact "el techo se pierde" bug
  // this class exists to close, just relocated to dispatch order instead of
  // the regex itself.
  const distIntervalRange = paren || interval ? null : parseDistanceIntervalRange(seg);
  const distInterval =
    paren || interval || distIntervalRange ? null : parseDistanceInterval(seg);
  const kmh = parsePaceKmh(seg);
  const clockPace = parsePaceClockTarget(seg);
  // Word/colon-clock and calorie interval windows — new shapes ("Remo 3x4
  // min", "Assault bike 5x15 cal") that dose.ts's prime-quote-only
  // parseInterval cannot read. Tried only when every distance/prime reader
  // above refuses, same precedence paren already has over interval.
  const wordInterval =
    paren || interval || distIntervalRange || distInterval ? null : parseIntervalWordClock(seg);
  const calInterval =
    paren || interval || distIntervalRange || distInterval || wordInterval
      ? null
      : parseCaloriesInterval(seg);
  const dur = parseDuration(seg);
  const dist = parseDistanceMeters(seg) ?? parseMilesMeters(seg);
  const cap = parsePaceCap(seg);
  const rest = parseRest(seg);
  // New TARGET kinds this bout can now carry: heart rate in bpm, erg/bike
  // watts, calories AS THE GOAL (not the per-round MEASURE calInterval reads
  // above — the two never collide, see target.ts's module comment), and a
  // clock-to-beat cap on a single effort (see target.ts's parseTimeCapTarget
  // doc comment — never fires on a dense multi-station line, those never
  // reach parseBout at all).
  const hrBpm = parseHrBpmTarget(seg);
  const watts = parseWattsTarget(seg);
  const caloriesGoal = parseCaloriesGoalTarget(seg);
  const timeCap = parseTimeCapTarget(seg);

  // A "@"/kg LOAD clause on an Nx-shaped interval means implement work (Sled
  // Push, Farmers Carry, Sandbag Lunges…) — strength.ts's
  // parseSetsByLoadedMeasure owns that shape (score:'load', a SETS table,
  // not a paced cardio interval). Refuse so it gets first refusal instead of
  // this branch silently eating the sets and dropping the load (arreglo
  // #2/#3's "CARGA PERDIDA"). Scoped to every Nx-shaped interval reader —
  // a plain steady/zone bout that merely MENTIONS a kg for some other reason
  // (no Nx shape) is untouched; only the "NxM[unit]" shape defers.
  if (
    (interval || distInterval || wordInterval || calInterval || distIntervalRange) &&
    (parseImplementLoad(seg) || parseKg(seg) !== undefined)
  ) {
    return null;
  }

  // A bout needs a bout signal. "duration + RPE" alone qualifies (class 2/9:
  // "5' RPE 3-4", "3' RPE 10") but ONLY on a line with no strength signal — a
  // rep scheme, %RM or kg means strength owns it.
  // wordInterval is deliberately NOT a strongSignal on its own: an "Nx<time>"
  // shape is genuinely ambiguous between a cardio interval (bout.ts) and a
  // timed/isometric STRENGTH hold ("Plancha 3x45 s" — measure.ts's
  // parseBareTimedOrCalorieSets, dispatched from notation.ts). Distance and
  // calories don't have that ambiguity (a strength set is never measured in
  // meters or calories), so they keep qualifying alone, same as the
  // pre-existing distInterval already did. Duration only reads as a cardio
  // interval once SOME other bout signal (usually modality) already
  // justifies it — "Remo 3x4 min" qualifies via modality:'row', not via
  // wordInterval itself.
  const strongSignal =
    modality !== undefined ||
    choice ||
    zone !== undefined ||
    paren !== null ||
    interval !== null ||
    distInterval !== null ||
    kmh !== null ||
    clockPace !== null ||
    structural !== undefined ||
    calInterval !== null ||
    distIntervalRange !== null ||
    hrBpm !== null ||
    watts !== null ||
    caloriesGoal !== null ||
    timeCap !== null;
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

  // INTERVAL scheme: rounds + work window (time, distance, or calories) + rest
  // + target. Exactly one of the five window sources is non-null (mutually
  // exclusive by construction above); each range-capable one carries its
  // ceiling on the SET's own measure (`.max`), never a flat "work_s_max"
  // field that would only fit the point case.
  if (interval || distInterval || wordInterval || calInterval || distIntervalRange) {
    const rounds =
      interval?.rounds ??
      distInterval?.rounds ??
      wordInterval?.rounds ??
      calInterval?.rounds ??
      distIntervalRange!.rounds;
    const p: Prescription = { scheme: 'intervals', rounds };
    if (rest !== undefined) p.rest_s = rest;
    if (modality) p.modality = modality;
    if (interval) {
      p.work_s = interval.work_s;
    } else if (distInterval) {
      p.sets = Array.from({ length: rounds }, () => ({
        measure: { kind: 'distance', meters: distInterval.meters },
      }));
    } else if (distIntervalRange) {
      p.sets = Array.from({ length: rounds }, () => ({
        measure: {
          kind: 'distance',
          meters: distIntervalRange.meters,
          ...(distIntervalRange.metersMax !== undefined ? { max: distIntervalRange.metersMax } : {}),
        },
      }));
    } else if (wordInterval) {
      if (wordInterval.work_s_max !== undefined) {
        p.sets = Array.from({ length: rounds }, () => ({
          measure: {
            kind: 'duration',
            seconds: wordInterval.work_s,
            ...(wordInterval.work_s_max !== undefined ? { max: wordInterval.work_s_max } : {}),
          },
        }));
      } else {
        p.work_s = wordInterval.work_s;
      }
    } else if (calInterval) {
      p.sets = Array.from({ length: rounds }, () => ({
        measure: {
          kind: 'calories',
          value: calInterval.calories,
          ...(calInterval.caloriesMax !== undefined ? { max: calInterval.caloriesMax } : {}),
        },
      }));
    }
    const target = paceTarget ?? rpe?.target ?? zone ?? hrBpm ?? watts ?? caloriesGoal;
    if (target) p.target = target;
    if (noteBits.length) p.note = noteBits.join(' · ');
    return { token: label.token, prescription: p };
  }

  // STEADY / WARM-UP / COOL-DOWN: one continuous bout (duration and/or distance).
  const p: Prescription = { scheme: structural ?? 'steady' };
  if (dur !== undefined) p.total_s = dur;
  if (dist !== undefined) p.sets = [{ measure: { kind: 'distance', meters: dist } }];
  const target = zone ?? paceTarget ?? rpe?.target ?? hrBpm ?? watts ?? caloriesGoal ?? timeCap;
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
