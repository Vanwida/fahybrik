// La línea rápida de una celda: «press banca 4x4 @78-80% r90» → UN bloque
// guardable, con la prescripción tipada Y el ejercicio ENLAZADO (informe D P0:
// antes cada línea entraba con `exercise_id: null` y bloqueaba el guardado).
//
// Dos mitades, las dos existentes y probadas:
//   · la gramática determinista del importador (`parseNotationCell`, en cliente,
//     sin red) tipa la dosis;
//   · `resolveExercise` (servidor, catálogo del coach, ES/EN, alias, plurales,
//     tildes) enlaza la palabra con un ejercicio.
// Aquí solo se juntan. Honestidad: una línea que la gramática no entiende entera
// NO entra (no se inventa un número); una palabra que no se resuelve con
// confianza NO se enlaza sola — el coach elige entre los candidatos.

import { parseNotationCell, type ParsedLine } from '@fahybrid/shared/domain/import/notation';
import {
  prescriptionToParams,
  prescriptionToText,
  type Modality,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import type { WeekDay, WeekDayPart, WeekDayPartItem } from '@fahybrid/shared/schema/program-templates';
import { freshUid } from './grid-model';

export interface QuickLineParse {
  lines: ParsedLine[];
  /** Todas las líneas tienen dosis tipada. */
  typed: boolean;
}

export function parseQuickLine(text: string): QuickLineParse {
  const lines = text.trim() ? parseNotationCell(text) : [];
  return { lines, typed: lines.length > 0 && lines.every((l) => l.confidence === 'detected') };
}

/**
 * La palabra con la que se busca el ejercicio. Un trabajo que no nombra
 * movimiento («8x400m r1' z4», «6x500 remo» ya lo nombra) se busca por su
 * modalidad: una serie de carrera sin nombre ES carrera.
 */
const MODALITY_TOKEN: Partial<Record<Modality, string>> = {
  run: 'carrera',
  row: 'remo ergómetro',
  ski: 'skierg',
  bike: 'bici',
};

export function lookupToken(line: ParsedLine): string {
  const token = line.exercise_token.trim();
  if (token) return token;
  const modality = line.prescription.modality ?? inferModality(line.prescription);
  return (modality && MODALITY_TOKEN[modality]) ?? '';
}

/** Series por distancia o intervalos con zona y sin nombre: por defecto se corren. */
function inferModality(p: Prescription): Modality | undefined {
  const hasDistance = (p.sets ?? []).some((s) => s.measure?.kind === 'distance');
  if (hasDistance || p.target?.kind === 'hr_zone' || p.target?.kind === 'pace') return 'run';
  return undefined;
}

export interface LinkedExercise {
  id: string;
  name: string;
}

/** Texto de la dosis tal como la leerá el coach en la celda («4×4 @ 78-80% RM · descanso 90''»). */
export function doseText(p: Prescription): string {
  return prescriptionToText(p);
}

/**
 * Las líneas entendidas + su ejercicio elegido → UN bloque (A, B, C…) del entreno.
 * Devuelve null si falta algo (una línea sin tipar o sin ejercicio): nunca un
 * bloque que luego no se pueda guardar.
 */
export function partFromQuickLines(
  lines: ParsedLine[],
  exercises: Array<LinkedExercise | null>,
  uid: () => string = freshUid,
): WeekDayPart | null {
  if (lines.length === 0) return null;
  if (lines.some((l, i) => l.confidence !== 'detected' || !exercises[i])) return null;
  const items: WeekDayPartItem[] = lines.map((l, i) => {
    const ex = exercises[i]!;
    const prescription: Prescription = {
      ...l.prescription,
      modality: l.prescription.modality ?? inferModality(l.prescription),
    };
    if (prescription.modality === undefined) delete prescription.modality;
    return {
      uid: uid(),
      exercise_id: Number(ex.id),
      exercise_name: ex.name,
      prescription_json: prescription,
      params_json: prescriptionToParams(prescription),
    };
  });
  const title = items.map((it) => it.exercise_name).join(' + ').slice(0, 120);
  return {
    uid: uid(),
    format: lines[0]!.prescription.scheme as WeekDayPart['format'],
    title: title || 'Bloque',
    items,
  };
}

/**
 * Añade un bloque al primer entreno del día (o crea el entreno si el día estaba
 * vacío o en descanso: escribir en un día de descanso lo convierte en día de
 * entreno, que es lo que el coach acaba de decir al escribir).
 */
export function appendPart(day: WeekDay, part: WeekDayPart, sessionIndex = 0): WeekDay {
  const sessions = day.sessions.filter((s) => s.kind === 'workout');
  const next: WeekDay = { ...day, sessions: sessions.map((s) => ({ ...s, blocks: [...(s.blocks ?? [])] })) };
  delete next.kind;
  delete next.recovery_suggestions;
  if (next.sessions.length === 0) {
    next.sessions.push({ kind: 'workout', template_id: null, blocks: [] });
  }
  const target = next.sessions[Math.min(sessionIndex, next.sessions.length - 1)]!;
  target.blocks = [...(target.blocks ?? []), part];
  return next;
}

/** Añade un entreno entero (de la biblioteca) como un entreno más del día. */
export function appendSession(day: WeekDay, session: WeekDay['sessions'][number]): WeekDay {
  const sessions = day.sessions.filter((s) => s.kind === 'workout');
  const next: WeekDay = { ...day, sessions: [...sessions, session] };
  delete next.kind;
  delete next.recovery_suggestions;
  return next;
}
