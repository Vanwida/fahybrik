// command — a line that COMMANDS the lines below it. The coach writes the
// dose in the header; the children inherit it because they are naked, or
// keep their own measure when they already have one. FAITHFUL OR REVIEW:
// never invent a number the header did not write, and never guess where a
// group ends (next commanding header, a nested header, a block title, a
// warm-up/cool-down section, or the end of the cell).
//
// Flat forms from the 12-week cycle, plus one nested form whose group end
// is the same as a flat header (next header, title, warmup/cooldown, cell end):
//   1. "N series:" / "N series de:"           → sets, no reps
//   2. "N series de N reps de:" / "N series de N:" → sets + reps
//   3. "N rondas:" / "N rondas AFAP:"         → rounds
//   4. "N bloques de M series de:"            → M sets, N rounds
// "N bloques de M rondas" + Bloque A/B/C stays review: the group end is opaque.

import {
  type Measure,
  type Modality,
  type Prescription,
  type PrescriptionSet,
  type Target,
} from '../prescription/types';
import {
  type ChildWork,
  cleanName,
  isNameEmbeddedPair,
  loadTarget,
  readLeadingWork,
} from './command-work';
import { asScopedGroupRest, type GroupRest } from './rest-scope';
import { parseBout } from './bout';
import {
  foldText,
  parseDistanceInterval,
  parseEffortTarget,
  parseInterval,
  parseLoadPctList,
  parseRest,
  parseRepSeq,
  parseSetCount,
  parseSetsByRepRange,
  parseSetsByReps,
  parseZoneTarget,
  stripLoadPct,
  stripTargetTokens,
} from './dose';
import {
  cardioModalities,
  isBlockTitle,
  isModalityChoice,
  isNoiseLine,
  looksLikeBareMovementName,
  modalityFrom,
  structuralScheme,
} from './label';
import { parseIntervalWordClock } from './measure';
import { finalizeDetected, type ParsedLine, reviewLine } from './result';
import { tryRepPlusCombo } from './strength';
import { parseTimeCapTarget } from './target';

export type HeaderCommand =
  | { kind: 'sets'; count: number; reps?: number; blocks?: number; raw: string }
  | { kind: 'rounds'; count: number; raw: string };

const SETS_REPS_RE =
  /^\s*(\d+)\s+series\s+de\s+(\d+)\s*(?:reps?|repeticiones)?\s*(?:de)?\s*:\s*$/i;
const SETS_ONLY_RE = /^\s*(\d+)\s+series(?:\s+de)?\s*:\s*$/i;
const ROUNDS_RE = /^\s*(\d+)\s+rondas?\s*(?:afap|for\s*time)?\s*:\s*$/i;
const NESTED_RE = /^\s*\d+\s+bloques?\s+de\s+/i;
const BLOCKS_SERIES_RE = /^\s*(\d+)\s+bloques?\s+de\s+(\d+)\s+series(?:\s+de)?\s*:\s*$/i;
const INLINE_SERIES_RE = /^\s*(\d+)\s+series\s+de\s*:\s*(.+\s·\s.+)$/i;

export function isNestedHeader(line: string): boolean {
  return NESTED_RE.test(line) && !BLOCKS_SERIES_RE.test(line);
}

export function readHeaderCommand(line: string): HeaderCommand | null {
  const blocks = line.match(BLOCKS_SERIES_RE);
  if (blocks) {
    return {
      kind: 'sets',
      count: parseInt(blocks[2]!, 10),
      blocks: parseInt(blocks[1]!, 10),
      raw: line,
    };
  }
  if (isNestedHeader(line)) return null;
  const withReps = line.match(SETS_REPS_RE);
  if (withReps) {
    return {
      kind: 'sets',
      count: parseInt(withReps[1]!, 10),
      reps: parseInt(withReps[2]!, 10),
      raw: line,
    };
  }
  const setsOnly = line.match(SETS_ONLY_RE);
  if (setsOnly) return { kind: 'sets', count: parseInt(setsOnly[1]!, 10), raw: line };
  const rounds = line.match(ROUNDS_RE);
  if (rounds) return { kind: 'rounds', count: parseInt(rounds[1]!, 10), raw: line };
  return null;
}

export function walkCommandingCell(
  lines: string[],
  parseWork: (line: string) => ParsedLine[],
): ParsedLine[] {
  const out: ParsedLine[] = [];
  let titleModality: Modality | undefined;
  let command: HeaderCommand | null = null;
  let groupFrom = 0;

  const stamp = (line: ParsedLine): ParsedLine => {
    if (
      titleModality &&
      !line.prescription.modality &&
      line.confidence !== 'review' &&
      !isModalityChoice(line.exercise_token) &&
      cardioModalities(line.exercise_token || (line.prescription.note ?? '')).length < 2
    ) {
      line.prescription.modality = titleModality;
    }
    return line;
  };

  const applyGroupRest = (rest: GroupRest) => {
    for (let i = groupFrom; i < out.length; i++) {
      const line = out[i]!;
      if (line.confidence !== 'detected') continue;
      const p = line.prescription;
      if (rest.active_rest && p.active_rest === undefined) p.active_rest = rest.active_rest;
      if (rest.unstored_scope && rest.scope === undefined) continue;
      if (rest.scope === 'rounds') {
        if (p.rest_between_rounds_s === undefined) p.rest_between_rounds_s = rest.seconds;
        continue;
      }
      if (rest.scope === 'stations') {
        if (p.rest_between_stations_s === undefined) p.rest_between_stations_s = rest.seconds;
        continue;
      }
      if (p.rest_s === undefined) p.rest_s = rest.seconds;
      for (const s of p.sets ?? []) {
        if (s.rest_s === undefined) s.rest_s = rest.seconds;
      }
    }
  };

  const applyGroupCap = (cap: Target) => {
    if (cap.kind !== 'time_cap' || cap.value_s === undefined) return;
    for (let i = groupFrom; i < out.length; i++) {
      const line = out[i]!;
      if (line.confidence !== 'detected') continue;
      if (line.prescription.total_s === undefined) line.prescription.total_s = cap.value_s;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isBlockTitle(line)) {
      command = null;
      titleModality = modalityFrom(line);
      continue;
    }
    if (isNestedHeader(line)) {
      command = null;
      out.push(
        reviewLine(
          line,
          'cabecera anidada: un bloque que manda sobre series; esta pieza no la descompone',
        ),
      );
      continue;
    }
    const inline = line.match(INLINE_SERIES_RE);
    if (inline) {
      command = { kind: 'sets', count: parseInt(inline[1]!, 10), raw: line };
      groupFrom = out.length;
      for (const part of inline[2]!.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean)) {
        const decision = decideChild(command, part);
        if (decision.kind === 'skip') continue;
        if (decision.kind === 'rest') {
          applyGroupRest(decision.rest);
          if (decision.rest.consume === false) out.push(stamp(emitGroupRestLine(part, decision.rest)));
          continue;
        }
        if (decision.kind === 'cap') {
          applyGroupCap(decision.target);
          continue;
        }
        for (const parsed of decision.lines) out.push(stamp(parsed));
      }
      command = null;
      continue;
    }
    const header = readHeaderCommand(line);
    if (header) {
      command = header;
      groupFrom = out.length;
      continue;
    }
    if (!command) {
      const loneRest = asScopedGroupRest(line);
      if (loneRest !== undefined && out.length > 0) {
        applyGroupRest(loneRest);
        out.push(stamp(emitGroupRestLine(line, loneRest)));
        continue;
      }
    }
    if (command) {
      const section = structuralScheme(line);
      if (section === 'warmup' || section === 'cooldown') {
        command = null;
        for (const parsed of parseWork(line)) out.push(stamp(parsed));
        continue;
      }
      const decision = decideChild(command, line);
      if (decision.kind === 'skip') continue;
      if (decision.kind === 'rest') {
        applyGroupRest(decision.rest);
        if (decision.rest.consume === false) {
          out.push(stamp(emitGroupRestLine(line, decision.rest)));
        }
        continue;
      }
      if (decision.kind === 'cap') {
        applyGroupCap(decision.target);
        continue;
      }
      for (const parsed of decision.lines) out.push(stamp(parsed));
      continue;
    }
    for (const parsed of parseWork(line)) out.push(stamp(parsed));
  }
  return out;
}

type ChildDecision =
  | { kind: 'lines'; lines: ParsedLine[] }
  | { kind: 'rest'; rest: GroupRest }
  | { kind: 'cap'; target: Target }
  | { kind: 'skip' };

function decideChild(command: HeaderCommand, line: string): ChildDecision {
  const rest = asScopedGroupRest(line);
  if (rest !== undefined) return { kind: 'rest', rest };
  if (isTimeCapOnly(line)) {
    const cap = parseTimeCapTarget(line);
    if (cap) return { kind: 'cap', target: cap };
  }
  if (isNoiseLine(line) && !looksLikeBareMovementName(line)) return { kind: 'skip' };
  if (childHasOwnCount(line)) {
    return {
      kind: 'lines',
      lines: [
        reviewLine(
          line,
          'la línea ya trae su propio recuento de series; no se hereda la cabecera',
        ),
      ],
    };
  }
  if (line.includes('+')) {
    const combo = inheritPlusLine(command, line);
    if (combo) return { kind: 'lines', lines: combo };
    return {
      kind: 'lines',
      lines: [reviewLine(line, 'cadena bajo cabecera que no se pudo heredar entera')],
    };
  }
  const sequenced = inheritRepSequence(command, line);
  if (sequenced) return { kind: 'lines', lines: [sequenced] };
  const work = readChildWork(line);
  if (work) return { kind: 'lines', lines: [emitWork(command, work, line)] };
  if (looksLikeBareMovementName(line)) {
    return { kind: 'lines', lines: [emitWork(command, { token: line.trim() }, line)] };
  }
  return {
    kind: 'lines',
    lines: [reviewLine(line, 'no se pudo heredar la cabecera con confianza')],
  };
}

function inheritPlusLine(command: HeaderCommand, line: string): ParsedLine[] | null {
  const segs = line.split('+').map((s) => s.trim()).filter(Boolean);
  if (segs.length < 2) return null;
  const parts = segs.map((s) => readChildWork(s));
  if (parts.every((p): p is ChildWork => p !== null)) {
    return parts.map((p, i) => emitWork(command, p, segs[i]!));
  }
  const combo = tryRepPlusCombo(line);
  if (!combo || combo.some((l) => l.confidence !== 'detected')) return null;
  return combo.map((l) => expandDetected(command, l, line));
}

function inheritRepSequence(command: HeaderCommand, line: string): ParsedLine | null {
  const seq = parseRepSeq(stripTargetTokens(stripLoadPct(line)));
  if (!seq) return null;
  if (isNameEmbeddedPair(line)) return null;
  if (seq.length !== command.count) {
    return reviewLine(
      line,
      'el esquema de reps no coincide con las series de la cabecera',
    );
  }
  const token = cleanName(
    stripTargetTokens(stripLoadPct(line)).replace(/\d+(?:[/\-]\d+)+/, ' '),
  );
  if (!token) return reviewLine(line, 'esquema de reps sin movimiento nombrado');
  const effort = parseEffortTarget(line)?.target;
  const zone = parseZoneTarget(line);
  const target = loadTarget(parseLoadPctList(line)) ?? effort ?? zone;
  const sets: PrescriptionSet[] = seq.map((value) => {
    const s: PrescriptionSet = { measure: { kind: 'reps', value } };
    if (target) s.target = target;
    return s;
  });
  const scheme = command.kind === 'rounds' ? 'for_time' : 'sets';
  const p: Prescription = { scheme, sets, modality: modalityFrom(token) ?? 'strength' };
  if (command.kind === 'rounds') p.rounds = command.count;
  return finalizeDetected(token, p, line);
}

function expandDetected(command: HeaderCommand, line: ParsedLine, raw: string): ParsedLine {
  const seed = line.prescription.sets ?? [];
  const one = seed[0];
  const inheritedTarget = one?.target ?? line.prescription.target;
  const inheritedRest = one?.rest_s ?? line.prescription.rest_s;
  const work: ChildWork = {
    token: line.exercise_token,
    ...(one?.measure ? { measure: one.measure } : {}),
    ...(inheritedTarget ? { target: inheritedTarget } : {}),
    ...(inheritedRest !== undefined ? { rest_s: inheritedRest } : {}),
    ...(line.prescription.modality ? { modality: line.prescription.modality } : {}),
    ...(line.prescription.note ? { note: line.prescription.note } : {}),
    ...(line.prescription.laterality ? { laterality: line.prescription.laterality } : {}),
  };
  return emitWork(command, work, raw);
}

function emitWork(command: HeaderCommand, child: ChildWork, raw: string): ParsedLine {
  const n = command.count;
  const headerReps = command.kind === 'sets' ? command.reps : undefined;
  const measure =
    child.measure ??
    (headerReps !== undefined ? ({ kind: 'reps', value: headerReps } satisfies Measure) : undefined);
  const named = child.token.trim().length > 1;
  const scheme = !named
    ? command.kind === 'rounds'
      ? 'for_time'
      : 'intervals'
    : command.kind === 'rounds'
      ? 'for_time'
      : 'sets';
  const sets: PrescriptionSet[] = Array.from({ length: n }, () => {
    const s: PrescriptionSet = {};
    if (measure) s.measure = measure;
    if (child.target) s.target = child.target;
    if (child.rest_s !== undefined) s.rest_s = child.rest_s;
    return s;
  });
  const p: Prescription = { scheme, sets };
  if (command.kind === 'rounds' || scheme === 'intervals') p.rounds = n;
  if (command.kind === 'sets' && command.blocks !== undefined) p.rounds = command.blocks;
  const modality = child.modality ?? modalityFrom(child.token || raw);
  if (modality) p.modality = modality;
  else if (scheme === 'sets') p.modality = 'strength';
  else if (scheme === 'for_time') p.modality = 'functional';
  if (child.note) p.note = child.note;
  if (child.laterality) p.laterality = child.laterality;
  return finalizeDetected(child.token, p, raw);
}

function readChildWork(line: string): ChildWork | null {
  const rest_s = parseRest(line);
  const bout = parseBout(line);
  if (bout && !prescriptionHasOwnCount(bout.prescription)) {
    const measure = measureFromPrescription(bout.prescription);
    const target = bout.prescription.target ?? bout.prescription.sets?.[0]?.target;
    const boutRest =
      rest_s !== undefined && rest_s !== bout.prescription.total_s ? rest_s : undefined;
    return {
      token: bout.token,
      ...(measure ? { measure } : {}),
      ...(target ? { target } : {}),
      ...(boutRest !== undefined ? { rest_s: boutRest } : {}),
      ...(bout.prescription.modality ? { modality: bout.prescription.modality } : {}),
      ...(bout.prescription.note ? { note: bout.prescription.note } : {}),
      ...(bout.prescription.laterality ? { laterality: bout.prescription.laterality } : {}),
    };
  }
  return readLeadingWork(line, rest_s);
}

function emitGroupRestLine(raw: string, rest: GroupRest): ParsedLine {
  const p: Prescription = { scheme: 'sets' };
  if (rest.active_rest) {
    p.active_rest = rest.active_rest;
    if (rest.active_rest.modality) p.modality = rest.active_rest.modality;
  }
  if (rest.scope === 'rounds') p.rest_between_rounds_s = rest.seconds;
  else if (rest.scope === 'stations') p.rest_between_stations_s = rest.seconds;
  else if (!rest.unstored_scope && p.active_rest === undefined) p.rest_s = rest.seconds;
  const token = rest.active_rest ? 'descanso activo' : 'descanso';
  return finalizeDetected(token, p, raw);
}

function isTimeCapOnly(line: string): boolean {
  if (!parseTimeCapTarget(line)) return false;
  return /^(?:tc|cap)\b/i.test(foldText(line));
}

function childHasOwnCount(line: string): boolean {
  if (parseSetsByReps(line) || parseSetsByRepRange(line)) return true;
  if (parseInterval(line) || parseDistanceInterval(line) || parseIntervalWordClock(line)) return true;
  const count = parseSetCount(line);
  if (count !== undefined && /\d+\s*(?:series|rondas?|rounds?)\b/i.test(line)) return true;
  return false;
}

function prescriptionHasOwnCount(p: Prescription): boolean {
  if (p.scheme === 'intervals' && p.rounds !== undefined && p.rounds > 1) return true;
  if ((p.sets?.length ?? 0) > 1 && p.scheme === 'intervals') return true;
  return false;
}

function measureFromPrescription(p: Prescription): Measure | undefined {
  if (p.sets?.[0]?.measure) return p.sets[0].measure;
  if (p.total_s !== undefined) return { kind: 'duration', seconds: p.total_s };
  if (p.work_s !== undefined) return { kind: 'duration', seconds: p.work_s };
  return undefined;
}
