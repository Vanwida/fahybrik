// fill-defaults — rellenar los huecos que la FOTO no enseñó, con los valores por
// defecto del coach, marcando qué se rellenó.
//
// EL PORQUÉ. La visión transcribe y la gramática tipa solo lo que ve: ninguna de
// las dos adivina (contrato de honestidad, ./imported-week + shared/domain/import).
// Pero una captura recorta, y hay tres cosas que un coach escribe UNA vez y repite
// por costumbre durante todo un bloque: el descanso entre series, lo cerca del
// fallo que va una serie de fuerza, y las repeticiones cuando la celda enseña las
// series pero no el número. Dejarlas en blanco da un bloque con agujeros; el coach
// prefiere un bloque completo con valores PROPUESTOS y visibles.
//
// LA SALVAGUARDA, que es lo que hace aceptable lo anterior: nada propuesto llega al
// atleta sin pasar por los ojos del coach. Por eso la lista de lo rellenado sale
// SEPARADA de los datos (`FillResult.filled`), nunca incrustada como un campo más
// de la prescripción: la procedencia es del proceso de importación, se pinta en la
// rejilla de revisión, muere al confirmar y JAMÁS se persiste en el plan.
//
// LO QUE MANDA SIEMPRE ES LA FOTO: si un campo trae valor, no se toca. Ni aunque
// parezca raro.
//
// ── LO QUE NO SE RELLENA JAMÁS, y por qué ───────────────────────────────────────
// La línea es esta: un descanso por defecto es una CONVENCIÓN DEL ENTRENADOR; un
// peso en kilos es una PRESCRIPCIÓN INDIVIDUAL, y proponerlo es inventarse el
// entreno de alguien. Así que nunca se rellena nada que sea del ATLETA y no del
// ejercicio:
//   · ritmo (`pace`), zona (`hr_zone`), pulso (`hr_bpm`), watts — dependen del
//     atleta y del día. Un "ritmo por defecto" no tapa un hueco: fabrica el único
//     número que el coach no escribió.
//   · carga en kg y %RM — dependen del 1RM de cada uno.
//   · el tempo — no hay convención por defecto que valga para todos.
//   · la MEDIDA de una modalidad que no sea fuerza. Los metros de una serie, los
//     segundos de una plancha o las repeticiones de un burpee SON la dosis, no un
//     hábito de plantilla. Y fuera de la fuerza ni siquiera se sabe la unidad: una
//     plancha se mide en tiempo y un burpee en reps, así que rellenar "8-12 reps"
//     por defecto inventaría la unidad equivocada.
//   · los caps de formato (`rounds`, `total_s`, `work_s`) — inventar el cap de un
//     AMRAP es inventar cuánto quería el coach que durase el entreno.
//   · una línea `review` (la gramática no pudo tiparla): no hay estructura sobre la
//     que colgar nada, así que sale intacta.
//   · una tarjeta truncada: que falten 4 ejercicios no se arregla con defaults, y
//     eso ya se marca por otro lado.
// Ante la duda con un campo: NO se rellena.

import type { ImportDefaultsValues } from '@fahybrid/shared/domain/coach-import-defaults';
import {
  prescriptionTarget,
  safeParsePrescription,
  setMeasure,
  setTarget,
  type Modality,
  type Prescription,
  type PrescriptionRole,
  type PrescriptionSet,
} from '@fahybrid/shared/domain/prescription';
import type { EditorBlock, EditorItem, EditorSession } from '@/lib/dashboard/v2/editor-types';

/** Qué clase de hueco se tapó. Deja agrupar y pintar sin parsear el `path`. */
export type FilledFieldKind = 'reps' | 'rest' | 'intensity';

/** Un valor PROPUESTO por el importador, no leído de la foto. */
export interface FilledField {
  item_uid: string;
  field: FilledFieldKind;
  /** Ruta dentro de la prescripción del item, p. ej. `sets[0].rest_s`. */
  path: string;
  reason: 'not_visible_in_source';
}

export interface FillResult {
  /** Las sesiones con los huecos tapados. Las de entrada NO se mutan. */
  sessions: EditorSession[];
  /** Todo lo propuesto, en orden. Vacío = la foto lo traía todo. */
  filled: FilledField[];
}

export interface FillOptions {
  /**
   * Items cuya línea la gramática NO pudo tipar (`confidence: 'review'`). Salen
   * intactos: sin estructura tipada no hay dónde colgar un descanso ni una
   * intensidad, y rellenar por encima del texto crudo sería inventar. El llamador
   * los saca de sus `ProposalFlag`.
   */
  review_item_uids?: Iterable<string>;
}

/**
 * A qué modalidad le corresponde qué descanso por defecto.
 *
 * `functional` NO está, a propósito: la dosis de un WOD es su cap (amrap/emom/for
 * time), no un descanso entre series, y proponerle uno sería cambiar el entreno.
 * `other` y la modalidad desconocida tampoco: sin saber qué se entrena, cualquier
 * número es un invento.
 */
const REST_DEFAULT_BY_MODALITY: Partial<Record<Modality, keyof ImportDefaultsValues>> = {
  run: 'rest_conditioning_s',
  row: 'rest_conditioning_s',
  ski: 'rest_conditioning_s',
  bike: 'rest_conditioning_s',
  strength: 'rest_strength_s',
  core: 'rest_core_mobility_s',
  mobility: 'rest_core_mobility_s',
};

/**
 * La modalidad con la que se juzga la línea: la INTRÍNSECA del ejercicio
 * (`exercises.modality`, mig 0053) y, si el loader no la trajo, la pista que tipó
 * la gramática. El mismo orden que usa el gate de completitud, para que los dos no
 * juzguen la misma línea con datos distintos.
 */
function itemModality(item: EditorItem): Modality | null {
  return item.exercise_modality ?? item.prescription.modality ?? null;
}

/** El rol del bloque en la sesión. Sin grupo, es trabajo principal. */
function blockRole(block: EditorBlock): PrescriptionRole {
  return block.group ?? 'principal';
}

/**
 * Rellena UN item. Devuelve el mismo objeto (por identidad) cuando no había nada
 * que tapar, para que el llamador pueda distinguir lo tocado de lo intacto.
 */
function fillItem(
  item: EditorItem,
  role: PrescriptionRole,
  defaults: ImportDefaultsValues,
  filled: FilledField[],
): EditorItem {
  const prescription = item.prescription;
  const sets = prescription.sets ?? [];
  // Sin series explícitas la dosis vive a nivel de bloque (un "rueda 45'"): ahí no
  // hay hueco por serie que tapar, y el cap no se toca nunca.
  if (sets.length === 0) return item;

  const modality = itemModality(item);
  const nextSets: PrescriptionSet[] = sets.map((s) => ({ ...s }));
  const before = filled.length;

  const record = (index: number, field: FilledFieldKind, key: string): void => {
    filled.push({
      item_uid: item.uid,
      field,
      path: `sets[${index}].${key}`,
      reason: 'not_visible_in_source',
    });
  };

  // ── 1. Las repeticiones (lo único BLOQUEANTE que un default puede cerrar) ────
  // Solo en FUERZA: es la única modalidad donde la medida ausente es objetivamente
  // repeticiones. Se tipa como RANGO, nunca como un punto inventado, para que el
  // coach vea que se rellenó en lugar de creer que se midió.
  if (modality === 'strength') {
    nextSets.forEach((set, i) => {
      if (setMeasure(set) !== undefined) return;
      set.measure = {
        kind: 'reps',
        value: defaults.rep_range_min,
        max: defaults.rep_range_max,
      };
      record(i, 'reps', 'measure');
    });
  }

  // ── 2. La intensidad de fuerza ──────────────────────────────────────────────
  // Solo en fuerza y solo en trabajo PRINCIPAL: el gate de completitud no pide
  // objetivo a un calentamiento, y proponerle un RIR sería ruido de revisión.
  // Si el bloque ya lleva objetivo, las series lo heredan y no se toca nada.
  if (modality === 'strength' && role === 'principal' && prescriptionTarget(prescription) === undefined) {
    nextSets.forEach((set, i) => {
      if (setTarget(set) !== undefined) return;
      set.target = { kind: 'rir', value: defaults.rir_strength };
      record(i, 'intensity', 'target');
    });
  }

  // ── 3. El descanso entre series ─────────────────────────────────────────────
  // Hace falta que haya un "entre": con una sola serie no hay descanso que poner, y
  // la última nunca lo lleva (la sesión sigue o termina). Si el coach ya lo dijo a
  // nivel de bloque, el dato existe aunque esté un nivel más arriba: no se duplica.
  const restKey = modality ? REST_DEFAULT_BY_MODALITY[modality] : undefined;
  if (restKey !== undefined && nextSets.length >= 2 && prescription.rest_s == null) {
    const restValue = defaults[restKey];
    nextSets.slice(0, -1).forEach((set, i) => {
      if (set.rest_s != null) return;
      // Una serie que sigue sin trabajo (ni leído ni rellenado arriba) no tiene de
      // qué descansar: proponerle un descanso deja un "descansa 60s" suelto y le
      // añade ruido de revisión a una línea que el coach tiene que arreglar igual.
      if (setMeasure(set) === undefined) return;
      set.rest_s = restValue;
      record(i, 'rest', 'rest_s');
    });
  }

  if (filled.length === before) return item;

  const next: Prescription = { ...prescription, sets: nextSets };
  // Cinturón: un default fuera de rango (o una prescripción que ya venía mal) no
  // puede colarse como prescripción inválida. Si el resultado no valida, se deja el
  // item EXACTAMENTE como estaba y no se reporta ningún relleno.
  if (!safeParsePrescription(next).success) {
    filled.length = before;
    return item;
  }

  return { ...item, prescription: next };
}

/**
 * Tapa con los valores por defecto del coach los huecos que la foto no enseñó, y
 * devuelve por separado la lista de lo propuesto para que la revisión lo pinte
 * distinto y el coach lo confirme de un toque.
 *
 * `defaults` sale de `resolveImportDefaults(coach_id)` — la fila del coach si la
 * tiene, si no las del sistema. Este módulo es PURO: ni base de datos ni red, para
 * que la rejilla de revisión pueda recalcular lo mismo que el servidor.
 */
export function fillMissingWithDefaults(
  sessions: EditorSession[],
  defaults: ImportDefaultsValues,
  options: FillOptions = {},
): FillResult {
  const skip = new Set(options.review_item_uids ?? []);
  const filled: FilledField[] = [];

  const nextSessions = sessions.map((session) => ({
    ...session,
    blocks: session.blocks.map((block) => {
      const role = blockRole(block);
      return {
        ...block,
        items: block.items.map((item) =>
          skip.has(item.uid) ? item : fillItem(item, role, defaults, filled),
        ),
      };
    }),
  }));

  return { sessions: nextSessions, filled };
}
