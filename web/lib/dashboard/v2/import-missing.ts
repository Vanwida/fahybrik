// import-missing — los ejercicios que una importación necesita y el catálogo del
// coach no tiene.
//
// EL PROBLEMA MEDIDO. Una semana real de la captura trae 56 ejercicios y 51 no
// existen en el catálogo. Hoy la confirmación exige que TODOS resuelvan, así que
// el coach tendría que abrir el selector treinta veces. Eso no lo hace nadie, y
// menos en la primera importación, que es donde se decide si la función se usa o
// se abandona.
//
// EL MODELO. La unidad NO es la línea: es el TOKEN. Las 51 líneas son 30 nombres
// distintos, y varias líneas repiten el mismo, así que se decide una vez por
// nombre. Cada token tiene EXACTAMENTE tres salidas, y no hay una cuarta:
//   · FUSIONAR con un ejercicio que ya existe → no se crea nada. Basta estampar
//     su id en las líneas: el aprendizaje de sinónimos que ya existe lo aprende
//     solo al confirmar, porque `buildConfirmBody` emite sinónimo justo cuando un
//     flag venía sin resolver y acaba con id.
//   · CREAR uno propio → exige nombre + categoría + modalidad. Los tres.
//   · DESCARTAR → ni se crea ni se mapea.
//
// LO QUE ESTE MÓDULO NO HACE: adivinar la modalidad. Sale propuesta SOLO cuando
// hay evidencia, porque equivocarla no es un detalle estético — un «Cat Cow»
// creado como fuerza materializa tres series con sus descansos en el entreno en
// vivo, se archiva como fuerza contaminando la analítica del coach para siempre,
// y deja de mandarse al reloj la carrera estructurada del día. Sin evidencia, la
// elige el coach.

import { modalityFrom } from '@fahybrid/shared/domain/import/label';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { defaultCategoryForModality } from '@/lib/dashboard/v2/pick-exercise';
import type { ReviewWeek } from '@/lib/dashboard/v2/import-review';

/** De dónde salió la modalidad propuesta. `ninguna` = la tiene que elegir él. */
export type ModalityEvidence = 'linea' | 'bloque' | 'ninguna';

/** Por qué un token entra premarcado como que NO es un ejercicio. */
export type NotAnExerciseReason = 'titulo' | 'sin_palabras';

/** Un nombre que la importación necesita y el catálogo no tiene. */
export interface MissingExercise {
  /** Clave estable: el token normalizado. Varias líneas comparten una. */
  key: string;
  /** El nombre tal y como venía, que es lo que se le enseña al coach. */
  token: string;
  /** Los bloques donde aparece, por su título. Es el contexto que decide. */
  blockTitles: string[];
  /** Cuántas líneas de la importación lo usan. */
  lineCount: number;
  /** La modalidad que se propone, o null si no hay evidencia para proponer. */
  suggestedModality: Modality | null;
  /** De dónde salió esa propuesta. */
  evidence: ModalityEvidence;
  /** La categoría que se deriva de la modalidad propuesta. */
  suggestedCategory: ExerciseCategory | null;
  /**
   * La fuente cortó el nombre («Extension de cadera en cuadrúp...»). Crearlo tal
   * cual metería unos puntos suspensivos en el catálogo PARA SIEMPRE, así que
   * hasta que el coach lo complete no se puede crear.
   */
  truncated: boolean;
  /**
   * Esto no parece un ejercicio: es el título de una tarjeta que se coló como
   * token, o no tiene ni una palabra. Entra premarcado como descartado — si no,
   * un coach que le da a «crear todos» se ensucia el catálogo sin enterarse.
   */
  notAnExercise: NotAnExerciseReason | null;
}

/** Misma normalización que usa el resolutor para deduplicar. Se repite aquí
 *  porque la suya vive en un módulo de servidor y esto corre en el navegador. */
function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿La fuente cortó el nombre? */
function isTruncated(token: string): boolean {
  return /(\.{3}|…)\s*$/.test(token.trim());
}

/** ¿Tiene al menos una palabra de verdad? «A)» y «3x» no la tienen. */
function hasRealWord(token: string): boolean {
  return /[a-záéíóúüñ]{3,}/i.test(token);
}

/**
 * La modalidad que se puede DEFENDER para este token, por orden de evidencia:
 *   1. la que la gramática tipó en la propia línea — lo más fuerte que hay,
 *   2. la del título de su tarjeta («MOVILIDAD GENERAL» → movilidad),
 *   3. nada. Y nada significa nada: no se rellena por rellenar.
 *
 * `modalityFrom` solo sabe deducir carrera, remo, ski, bici, movilidad y otro:
 * NUNCA devuelve fuerza, funcional ni core. Así que la mayoría de los nombres de
 * una tarjeta de fuerza caen al caso 3 a propósito, y por eso el panel agrupa por
 * tarjeta: el coach lo resuelve una vez por bloque, no una vez por ejercicio.
 */
function proposeModality(
  lineModality: Modality | undefined,
  blockTitles: readonly string[],
): { modality: Modality | null; evidence: ModalityEvidence } {
  if (lineModality) return { modality: lineModality, evidence: 'linea' };
  for (const title of blockTitles) {
    const fromTitle = modalityFrom(title);
    if (fromTitle) return { modality: fromTitle, evidence: 'bloque' };
  }
  return { modality: null, evidence: 'ninguna' };
}

/**
 * Los ejercicios que faltan, deduplicados y con lo que se puede proponer de cada
 * uno. Solo mira los días que de verdad se van a escribir: excluir un día quita
 * sus ejercicios de la lista, igual que quita sus líneas del confirmar.
 */
export function collectMissingExercises(weeks: readonly ReviewWeek[]): MissingExercise[] {
  // Todos los títulos de tarjeta de esta importación: es contra esto contra lo
  // que se detecta un título colado como ejercicio.
  const blockTitleKeys = new Set<string>();
  for (const week of weeks) {
    for (const day of week.days) {
      for (const block of day.sessions.flatMap((s) => s.blocks)) {
        const key = normalizeKey(block.title);
        if (key) blockTitleKeys.add(key);
      }
      for (const focus of day.sessions.map((s) => s.focus).filter(Boolean)) {
        const key = normalizeKey(focus!);
        if (key) blockTitleKeys.add(key);
      }
    }
  }

  const byKey = new Map<string, MissingExercise>();
  const modalityByKey = new Map<string, Modality | undefined>();

  for (const week of weeks) {
    if (!week.included) continue;
    for (const day of week.days) {
      if (!day.included) continue;
      for (const block of day.sessions.flatMap((s) => s.blocks)) {
        for (const item of block.items) {
          if (item.exercise_id != null && Number(item.exercise_id) > 0) continue;
          const token = item.exercise_name.trim();
          if (!token) continue;
          const key = normalizeKey(token);
          if (!key) continue;

          const existing = byKey.get(key);
          if (existing) {
            existing.lineCount += 1;
            if (!existing.blockTitles.includes(block.title) && block.title) {
              existing.blockTitles.push(block.title);
            }
            continue;
          }
          modalityByKey.set(key, item.prescription.modality);
          byKey.set(key, {
            key,
            token,
            blockTitles: block.title ? [block.title] : [],
            lineCount: 1,
            suggestedModality: null,
            evidence: 'ninguna',
            suggestedCategory: null,
            truncated: isTruncated(token),
            notAnExercise: !hasRealWord(token)
              ? 'sin_palabras'
              : blockTitleKeys.has(key)
                ? 'titulo'
                : null,
          });
        }
      }
    }
  }

  // La propuesta se calcula al final, cuando ya se conocen TODOS los bloques en
  // los que aparece el token: uno solo puede no tener pista y otro sí.
  const out: MissingExercise[] = [];
  for (const missing of byKey.values()) {
    const { modality, evidence } = proposeModality(
      modalityByKey.get(missing.key),
      missing.blockTitles,
    );
    out.push({
      ...missing,
      suggestedModality: modality,
      evidence,
      suggestedCategory: modality ? defaultCategoryForModality(modality) : null,
    });
  }
  return out;
}

/** Cuántos hay que de verdad hay que resolver (los premarcados como basura no
 *  cuentan: el coach no tiene que hacer nada con ellos). */
export function realMissingCount(missing: readonly MissingExercise[]): number {
  return missing.filter((m) => m.notAnExercise === null).length;
}

/** Lo que se decidió para un token: a qué ejercicio del catálogo apunta ahora. */
export interface ResolvedToken {
  /** La clave normalizada del token (`MissingExercise.key`). */
  key: string;
  exercise_id: number;
  /** El nombre con el que se guardó, para que la línea deje de enseñar el token
   *  crudo de la fuente y enseñe el ejercicio de verdad. */
  exercise_name: string;
}

/**
 * Estampa los ejercicios ya resueltos en TODAS las líneas que los usaban.
 *
 * Aquí se cierra el círculo sin maquinaria nueva: la línea pasa a tener
 * `exercise_id`, el día deja de estar bloqueado, y al confirmar el aprendizaje de
 * sinónimos que YA existe aprende la equivalencia sola — porque `buildConfirmBody`
 * emite sinónimo justo cuando un flag venía sin resolver y la línea acaba con id.
 * Así la segunda semana del coach resuelve sola lo que en la primera tuvo que
 * decidir.
 *
 * No muta: devuelve semanas nuevas, como todo lo demás del modelo de revisión.
 */
export function applyResolvedTokens(
  weeks: readonly ReviewWeek[],
  resolved: readonly ResolvedToken[],
): ReviewWeek[] {
  if (resolved.length === 0) return [...weeks];
  const byKey = new Map(resolved.map((r) => [r.key, r]));
  return weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => ({
      ...day,
      sessions: day.sessions.map((session) => ({
        ...session,
        blocks: session.blocks.map((block) => ({
          ...block,
          items: block.items.map((item) => {
            if (item.exercise_id != null && Number(item.exercise_id) > 0) return item;
            const hit = byKey.get(normalizeKey(item.exercise_name));
            return hit
              ? { ...item, exercise_id: hit.exercise_id, exercise_name: hit.exercise_name }
              : item;
          }),
        })),
      })),
    })),
  }));
}
