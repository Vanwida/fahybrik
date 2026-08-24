// command — a line that COMMANDS the lines below it. The coach writes the
// dose in the header; the children inherit it because they are naked, or
// keep their own measure when they already have one. FAITHFUL OR REVIEW:
// never invent a number the header did not write, and never guess where a
// group ends (next commanding header, a nested header, a block title, a
// warm-up/cool-down section, or the end of the cell).
//
// Three flat forms, from the 12-week cycle (nested "N bloques de M series"
// is a later card — this module reviews those headers and stops inheriting):
//   1. "N series:" / "N series de:"           → sets, no reps
//   2. "N series de N reps de:" / "N series de N:" → sets + reps
//   3. "N rondas:"                            → rounds

import {
  type Measure,
  type Modality,
  type Prescription,
  type PrescriptionSet,
  type Target,
} from '../prescription/types';
import { parseBout } from './bout';
import {
  foldText,
  isPureRest,
  parseClockSeconds,
  parseDistanceInterval,
  parseEffortTarget,
  parseInterval,
  parseKg,
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
  | { kind: 'sets'; count: number; reps?: number; raw: string }
  | { kind: 'rounds'; count: number; raw: string };

const SETS_REPS_RE =
  /^\s*(\d+)\s+series\s+de\s+(\d+)\s*(?:reps?|repeticiones)?\s*(?:de)?\s*:\s*$/i;
const SETS_ONLY_RE = /^\s*(\d+)\s+series(?:\s+de)?\s*:\s*$/i;
const ROUNDS_RE = /^\s*(\d+)\s+rondas?\s*:\s*$/i;
const NESTED_RE = /^\s*\d+\s+bloques?\s+de\s+/i;

export function isNestedHeader(line: string): boolean {
  return NESTED_RE.test(line);
}

export function readHeaderCommand(line: string): HeaderCommand | null {
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

  const applyGroupRest = (rest_s: number) => {
    for (let i = groupFrom; i < out.length; i++) {
      const line = out[i]!;
      if (line.confidence !== 'detected') continue;
      if (line.prescription.rest_s === undefined) line.prescription.rest_s = rest_s;
      for (const s of line.prescription.sets ?? []) {
        if (s.rest_s === undefined) s.rest_s = rest_s;
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
    const header = readHeaderCommand(line);
    if (header) {
      command = header;
      groupFrom = out.length;
      continue;
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
        applyGroupRest(decision.rest_s);
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

interface ChildWork {
  token: string;
  measure?: Measure;
  target?: Target;
  rest_s?: number;
  modality?: Modality;
  note?: string;
}

type ChildDecision =
  | { kind: 'lines'; lines: ParsedLine[] }
  | { kind: 'rest'; rest_s: number }
  | { kind: 'cap'; target: Target }
  | { kind: 'skip' };

function decideChild(command: HeaderCommand, line: string): ChildDecision {
  const rest = asGroupRest(line);
  if (rest !== undefined) return { kind: 'rest', rest_s: rest };
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
  const modality = child.modality ?? modalityFrom(child.token || raw);
  if (modality) p.modality = modality;
  else if (scheme === 'sets') p.modality = 'strength';
  else if (scheme === 'for_time') p.modality = 'functional';
  if (child.note) p.note = child.note;
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
    };
  }
  return readLeadingWork(line, rest_s);
}

function readLeadingWork(line: string, rest_s: number | undefined): ChildWork | null {
  const notes: string[] = [];
  let s = line.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    const t = inner.trim();
    if (parseEffortTarget(t) || parseZoneTarget(t) || /%/.test(t)) return ` ${t} `;
    if (t) notes.push(t);
    return ' ';
  });
  const side = s.match(/\b(\d{1,2}\s*(?:\/\s*lado|por\s+lado)|por\s+lado)\b/i);
  if (side) {
    notes.push(side[1]!.replace(/\s+/g, ' '));
    s = s.replace(/\s*(?:\d{1,2}\s*)?(?:\/\s*lado|por\s+lado)\b/gi, ' ');
  }
  const effort = parseEffortTarget(s);
  const zone = parseZoneTarget(s);
  const loadList = parseLoadPctList(s);
  if (loadList && loadList.length >= 3) return null;
  const kg = parseKg(s);
  const target = loadTarget(loadList) ?? (kg !== undefined ? { kind: 'kg' as const, value: kg } : undefined);
  const primary = target ?? effort?.target ?? zone;
  if (target && effort) notes.push(effort.text);
  s = stripTargetTokens(stripLoadPct(s)).replace(/\s+/g, ' ').trim();
  s = s.replace(/\s+\d+(?:[.,]\d+)?\s*kg\b/gi, ' ').replace(/\s+/g, ' ').trim();
  if (rest_s !== undefined) {
    s = s
      .replace(
        /[/\-–—]?\s*\d+\s*'(?:\s*\d+\s*'')?\s*(?:de\s+)?(?:rest|descanso|recovery)\b.*$/i,
        ' ',
      )
      .replace(/\d+\s*''\s*(?:rest|descanso|recovery)\b.*$/i, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const clock = leadingClock(s);
  if (clock) {
    const token = cleanName(s.slice(clock.length));
    if (!token) return null;
    return packWork(token, { kind: 'duration', seconds: clock.seconds }, primary, rest_s, notes);
  }
  const dist = s.match(/^(\d+)\s*m\b\s*(.+)$/i);
  if (dist) {
    const token = cleanName(dist[2]!);
    if (!token) return null;
    return packWork(
      token,
      { kind: 'distance', meters: parseInt(dist[1]!, 10) },
      primary,
      rest_s,
      notes,
    );
  }
  if (parseRepSeq(s)) return null;
  const reps = s.match(/^(\d{1,2})\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ].+)$/);
  if (reps) {
    const token = cleanName(reps[2]!);
    if (!token) return null;
    return packWork(
      token,
      { kind: 'reps', value: parseInt(reps[1]!, 10) },
      primary,
      rest_s,
      notes,
    );
  }
  const token = cleanName(s);
  if (!token || /\d/.test(token)) return null;
  if (!primary && rest_s === undefined && notes.length === 0 && token === line.trim()) {
    return { token };
  }
  if (!looksLikeBareMovementName(token) && !primary) return null;
  return packWork(token, undefined, primary, rest_s, notes);
}

function packWork(
  token: string,
  measure: Measure | undefined,
  target: Target | undefined,
  rest_s: number | undefined,
  notes: string[],
): ChildWork {
  const modality = modalityFrom(token);
  return {
    token,
    ...(measure ? { measure } : {}),
    ...(target ? { target } : {}),
    ...(rest_s !== undefined ? { rest_s } : {}),
    ...(modality ? { modality } : {}),
    ...(notes.length ? { note: notes.join(' · ') } : {}),
  };
}

function loadTarget(loadList: number[] | null): Target | undefined {
  if (!loadList || loadList.length === 0) return undefined;
  if (loadList.length === 1) return { kind: 'percent_rm', value: loadList[0]! };
  if (loadList.length === 2 && loadList[0]! <= loadList[1]!) {
    return { kind: 'percent_rm', min: loadList[0]!, max: loadList[1]! };
  }
  return undefined;
}

function leadingClock(s: string): { seconds: number; length: number } | null {
  const m = s.match(/^(\d+\s*'\s*\d+\s*''|\d+\s*'{1,2})(?!\s*\/)/);
  if (!m) return null;
  const seconds = parseClockSeconds(m[1]!);
  if (seconds === undefined) return null;
  return { seconds, length: m[0].length };
}

function cleanName(s: string): string {
  return s
    .replace(/\b(?:al|de|en|a|x)\s*$/i, '')
    .replace(/[\s:,.\-—–(/+]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function asGroupRest(line: string): number | undefined {
  const rest = parseRest(line);
  if (rest === undefined) return undefined;
  if (isPureRest(line)) return rest;
  if (!/\b(descanso|rest|recuperacion|recovery)\b/.test(foldText(line))) return undefined;
  const leftover = foldText(line)
    .replace(/\d+\s*'\s*\d+\s*''/g, ' ')
    .replace(/\d+\s*'{1,2}/g, ' ')
    .replace(/\d+\s*:\s*[0-5]?\d(?:\s*:\s*[0-5]?\d)?/g, ' ')
    .replace(/\d+\s*(?:horas?|min(?:utos?)?|segundos?|seg\.?|s)\b/g, ' ')
    .replace(
      /\b(descanso|rest|recuperacion|recovery|entre|rondas?|series|activo|parado|soltando|en|ab|air|bike|bici|de)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  return leftover === '' ? rest : undefined;
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
