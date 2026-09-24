// EL ORDEN DE ESCRITURA DE UN REFLOW DE LA CADENA PERSONAL — puro, sin base de
// datos, para poder probarlo solo. Por qué importa el orden: «SE LIBERA ANTES DE
// OCUPAR», en la cabecera de personal-plan-chain-reflow.ts (la 0166 mira cada
// escritura, y la fase 2 son commits sueltos, uno por recibo).

import type { ReflowStep } from './personal-plan-chain-reflow';

/** Una escritura de la fase 2: retirar el recibo viejo de un tramo, o
 *  materializarlo en su fecha nueva. */
export type ReflowWrite = { kind: 'clear' | 'place'; step: ReflowStep };

function windowsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd; // ISO YYYY-MM-DD: el orden de texto es el de fecha.
}

/**
 * Antes de colocar un tramo se retira todo recibo viejo de este mismo reflow
 * que pise su ventana nueva (el suyo incluido): así ninguna escritura cae
 * nunca sobre un día ocupado. Lo que se adelanta va primero, de primero a
 * último; lo que se retrasa, después, de último a primero. Con ese orden, en
 * un desplazamiento en bloque (borrar, acortar, alargar) cada tramo sólo
 * suelta su propio sitio justo antes de ocupar el nuevo; sólo el intercambio
 * — un ciclo: cada uno cae en el sitio del otro — obliga a retirar el otro
 * recibo antes de tiempo.
 */
export function reflowWriteOrder(steps: ReflowStep[]): ReflowWrite[] {
  const toMove = steps.filter((s) => s.moved);
  const byNewStart = (a: ReflowStep, b: ReflowStep) =>
    a.new_start < b.new_start ? -1 : a.new_start > b.new_start ? 1 : 0;
  const movesLater = (s: ReflowStep) => s.old_start != null && s.new_start > s.old_start;
  const order = [
    ...toMove.filter((s) => !movesLater(s)).sort(byNewStart),
    ...toMove.filter(movesLater).sort((a, b) => byNewStart(b, a)),
  ];

  const writes: ReflowWrite[] = [];
  const cleared = new Set<ReflowStep>();
  for (const s of order) {
    for (const other of toMove) {
      if (other.old_start == null || other.old_end == null || cleared.has(other)) continue;
      if (other !== s && !windowsOverlap(other.old_start, other.old_end, s.new_start, s.new_end)) continue;
      writes.push({ kind: 'clear', step: other });
      cleared.add(other);
    }
    writes.push({ kind: 'place', step: s });
  }
  return writes;
}
