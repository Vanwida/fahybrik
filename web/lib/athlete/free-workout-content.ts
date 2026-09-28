// ENTRENO LIBRE → el MISMO modelo de bloques con el que escribe el coach.
//
// Un entreno libre del atleta y uno programado por el coach son el mismo objeto
// (docs/DECISIONS.md, 2026-09-28): este módulo solo traduce lo que manda el
// constructor libre al modelo de bloques del serializador único
// (`@/lib/templates/template-content`), que es quien decide posiciones, formato,
// prescripción canónica, params_json y circuitos. Nada de reglas propias aquí.
//
//   · MEDIDO (remo, ski, bici, correr): un bloque con su única línea.
//   · POR ÍTEMS (fuerza, funcional): el calentamiento opcional es un bloque de
//     formato `warmup` — sus líneas llevan el scheme de su bloque, como cuando el
//     coach cambia el tipo de un bloque a calentamiento — y el principal otro.
//   · RELOJ (funcional sin movimientos): ningún bloque con líneas; su prescripción
//     viaja aparte y el escritor la guarda como el reloj de la plantilla.

import type { Prescription } from '@fahybrid/shared/domain/prescription';
import type { TemplateContentBlock } from '@/lib/templates/template-content';

/** Título del bloque de calentamiento de un libre (el mismo que siembra el editor). */
export const FREE_WARMUP_TITLE = 'Calentamiento';

/** Una línea ya resuelta contra el catálogo. */
export interface FreeContentLine {
  exerciseId: number;
  prescription: Prescription;
  part?: 'warmup';
}

/** Los bloques de un entreno libre, en el orden en que se hacen. */
export function freeWorkoutContentBlocks(title: string, lines: readonly FreeContentLine[]): TemplateContentBlock[] {
  const warmup = lines.filter((l) => l.part === 'warmup');
  const main = lines.filter((l) => l.part !== 'warmup');
  const blocks: TemplateContentBlock[] = [];
  if (warmup.length > 0) {
    blocks.push({
      title: FREE_WARMUP_TITLE,
      format: 'warmup',
      items: warmup.map((l) => ({
        exercise_id: l.exerciseId,
        prescription: { ...l.prescription, scheme: 'warmup' },
      })),
    });
  }
  if (main.length > 0) {
    // Sin `format`: el serializador lo deriva del scheme de las líneas, con el
    // vocabulario del editor del coach (continuo → Carrera continua, una fuerza de
    // un ejercicio → Fuerza…), para que el coach lo abra en su formulario.
    blocks.push({
      title,
      items: main.map((l) => ({ exercise_id: l.exerciseId, prescription: l.prescription })),
    });
  }
  return blocks;
}
