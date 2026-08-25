// Lectura de una línea de trabajo bajo cabecera: la medida que el coach
// escribió, o nada. 90-90 en el nombre no es un esquema de reps.

import type { Laterality } from '../prescription/laterality';
import type { Measure, Modality, Target } from '../prescription/types';
import {
  parseClockSeconds,
  parseEffortTarget,
  parseKg,
  parseLoadPctList,
  parseRepSeq,
  parseZoneTarget,
  stripLoadPct,
  stripTargetTokens,
} from './dose';
import { looksLikeBareMovementName, modalityFrom } from './label';

export interface ChildWork {
  token: string;
  measure?: Measure;
  target?: Target;
  rest_s?: number;
  laterality?: Laterality;
  modality?: Modality;
  note?: string;
}

export function isNameEmbeddedPair(line: string): boolean {
  if (/^\s*\d{1,2}\s+\d{2}-\d{2}\s*$/.test(line)) return true;
  return /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]\s+\d+[/\-]\d+\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(line);
}

export function readLeadingWork(line: string, rest_s: number | undefined): ChildWork | null {
  const notes: string[] = [];
  let s = line.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    const t = inner.trim();
    if (parseEffortTarget(t) || parseZoneTarget(t) || /%/.test(t)) return ` ${t} `;
    if (t) notes.push(t);
    return ' ';
  });
  let laterality: Laterality | undefined;
  const side = s.match(/\b(?:\/\s*lado|por\s+lado|per\s+side|cada\s+lado)\b/i);
  if (side) {
    laterality = 'per_side';
    notes.push(side[0]!.replace(/\s+/g, ' '));
    s = s.replace(/\s*(?:\/\s*lado|por\s+lado|per\s+side|cada\s+lado)\b/gi, ' ');
  }
  const effort = parseEffortTarget(s);
  const zone = parseZoneTarget(s);
  const loadList = parseLoadPctList(s);
  if (loadList && loadList.length >= 3) return null;
  const kg = parseKg(s);
  const target =
    loadTarget(loadList) ?? (kg !== undefined ? { kind: 'kg' as const, value: kg } : undefined);
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
    return packWork(token, { kind: 'duration', seconds: clock.seconds }, primary, rest_s, notes, laterality);
  }
  const dist = s.match(/^(\d+(?:[.,]\d+)?)\s*m\b\s*(.+)$/i);
  if (dist) {
    const token = cleanName(dist[2]!);
    if (!token) return null;
    return packWork(
      token,
      { kind: 'distance', meters: parseFloat(dist[1]!.replace(',', '.')) },
      primary,
      rest_s,
      notes,
      laterality,
    );
  }
  if (parseRepSeq(s) && !isNameEmbeddedPair(s)) return null;
  const namedPair = s.match(/^(\d{1,2})\s+(\d{2}-\d{2})\s*$/);
  if (namedPair) {
    return packWork(
      namedPair[2]!,
      { kind: 'reps', value: parseInt(namedPair[1]!, 10) },
      primary,
      rest_s,
      notes,
      laterality,
    );
  }
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
      laterality,
    );
  }
  const token = cleanName(s);
  if (!token) return null;
  if (/\d/.test(token.replace(/\b\d{2}-\d{2}\b/g, ''))) return null;
  if (!primary && rest_s === undefined && notes.length === 0 && token === line.trim()) {
    return { token };
  }
  if (!looksLikeBareMovementName(token) && !primary) return null;
  return packWork(token, undefined, primary, rest_s, notes, laterality);
}

function packWork(
  token: string,
  measure: Measure | undefined,
  target: Target | undefined,
  rest_s: number | undefined,
  notes: string[],
  laterality?: Laterality,
): ChildWork {
  const modality = modalityFrom(token);
  return {
    token,
    ...(measure ? { measure } : {}),
    ...(target ? { target } : {}),
    ...(rest_s !== undefined ? { rest_s } : {}),
    ...(laterality ? { laterality } : {}),
    ...(modality ? { modality } : {}),
    ...(notes.length ? { note: notes.join(' · ') } : {}),
  };
}

export function loadTarget(loadList: number[] | null): Target | undefined {
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

export function cleanName(s: string): string {
  return s
    .replace(/\b(?:al|de|en|a|x)\s*$/i, '')
    .replace(/[\s:,.\-—–(/+]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}
