// block-dose — ¿qué líneas de un bloque no dicen cuánto trabajo hacer?
//
// CLIENT-SAFE a propósito (sin `server-only`, sin driver): lo consume el editor de
// bloque, que tiene las prescripciones en su estado y debe marcar la línea MIENTRAS
// el coach la arregla, sin ir al servidor a cada tecla.
//
// NO duplica el gate: llama a `checkPrescriptionCompleteness` + `isExecutable` +
// `blockingReasons` (shared/domain/prescription/completeness), el mismo que bloquea
// el Confirmar del grid de importación y el mismo que cuenta la Biblioteca en
// `listBlocksWithStructure`. Tres superficies, un solo listón — si divergieran, el
// coach vería "1 línea sin dosis" en la card y ninguna marcada al abrir.
//
// Se usa el listón EJECUTABLE (blocking), no el estricto: los avisos (`advisory`,
// p.ej. "sin descanso entre series") son criterio del coach y no se marcan como
// error — marcar de rojo lo que él decide sería mentirle sobre lo que le bloquea.

import {
  blockingReasons,
  checkPrescriptionCompleteness,
  isExecutable,
} from '@fahybrid/shared/domain/prescription';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';

/** Una línea que el atleta no podría ejecutar, con el porqué en palabras del gate. */
export interface UndosedLine {
  uid: string;
  exercise_name: string;
  /** Motivos del gate, verbatim (ya están escritos para el coach y en español). */
  reasons: string[];
}

/**
 * Los motivos por los que ESTA línea no es ejecutable. `[]` = está bien.
 *
 * Una línea sin ejercicio no se juzga: su problema es otro (lo cubre
 * `item-validity`), y marcarla también por la dosis sería ruido sobre ruido.
 */
export function doseIssuesFor(item: EditorItem): string[] {
  if (item.exercise_id == null) return [];
  const check = checkPrescriptionCompleteness(item.prescription, {
    // La modalidad del CATÁLOGO cuando la tenemos; el gate cae solo a la de la
    // prescripción si falta (los loaders viejos no la traían).
    modality: item.exercise_modality ?? null,
  });
  return isExecutable(check) ? [] : blockingReasons(check);
}

/** Las líneas sin dosis de un bloque, en orden. `[]` = el bloque está listo. */
export function undosedLines(block: EditorBlock): UndosedLine[] {
  const out: UndosedLine[] = [];
  for (const item of block.items) {
    const reasons = doseIssuesFor(item);
    if (reasons.length === 0) continue;
    out.push({ uid: item.uid, exercise_name: item.exercise_name, reasons });
  }
  return out;
}

/** ¿Este bloque tiene alguna línea sin dosis? Atajo para el rail. */
export function hasUndosedLines(block: EditorBlock): boolean {
  return block.items.some((it) => doseIssuesFor(it).length > 0);
}

/** El uid del primer bloque con una línea sin dosis — para abrir donde hay trabajo. */
export function firstUndosedBlockUid(blocks: EditorBlock[]): string | null {
  return blocks.find(hasUndosedLines)?.uid ?? null;
}
