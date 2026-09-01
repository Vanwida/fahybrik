// import-complete-gaps — un clic para desbloquear el confirmar de una importación.
//
// EL PROBLEMA. La rejilla de revisión es un embudo volátil: el coach no quiere
// abrir 40 líneas a mano. Ya hay «Aceptar propuestos» para lo que el importador
// rellenó; falta el gesto simétrico para lo que AÚN BLOQUEA (sin ejercicio del
// catálogo, sin dosis ejecutable).
//
// LO QUE HACE (mecanismo, no magia):
//   1. Tokens basura (título de tarjeta, «A)») → se DESCARTAN (salen del import).
//   2. Tokens con nombre → se resuelven: match cercano fuerte al catálogo, o
//      alta en bloque con modalidad de la tarjeta / strength por defecto.
//   3. Líneas resueltas pero sin dosis ejecutable → se siembra una dosis
//      genérica (defaults del sistema) y se marca como PROPUESTA.
//
// LO QUE NO HACE: inventar ritmo/zona/kg del atleta; no persiste nada (solo
// muta el modelo de revisión en el cliente). El coach refina en el microciclo.

import {
  checkPrescriptionCompleteness,
  hasAnyDose,
  isExecutable,
  type Modality,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import {
  DEFAULT_IMPORT_DEFAULTS,
  type ImportDefaultsValues,
} from '@fahybrid/shared/domain/coach-import-defaults';
import { fillMissingWithDefaults } from '@/lib/import/fill-defaults';
import type { EditorItem, EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { ProposedField } from '@/lib/dashboard/v2/import-provenance';
import { defaultCategoryForModality } from '@/lib/dashboard/v2/pick-exercise';
import type { ReviewDay, ReviewWeek } from '@/lib/dashboard/v2/import-review';
import {
  applyMissingExerciseDecisions,
  collectMissingExercises,
  type MissingExercise,
  type ResolvedToken,
} from '@/lib/dashboard/v2/import-missing';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import type { ScoredCandidate } from '@/lib/dashboard/exercises/near-match';

/** Por encima de esto fusionamos sin preguntar (mismo gesto que «completar»). */
export const AUTO_MERGE_SCORE = 0.85;

/** Series genéricas al sembrar una dosis de fuerza/core/movilidad. */
const SEED_STRENGTH_SETS = 3;

/** Segundos de un steady genérico (run/row/ski/bike) cuando no hay dosis. */
const SEED_CARDIO_TOTAL_S = 30 * 60;

export interface GapCreateSpec {
  key: string;
  name: string;
  modality: Modality;
  category: ExerciseCategory;
}

export interface GapPlan {
  /** Tokens a fusionar con un ejercicio ya existente. */
  merge: ResolvedToken[];
  /** Tokens a crear en el catálogo del coach. */
  create: GapCreateSpec[];
  /** Claves a sacar del import (basura / no-ejercicio). */
  discardKeys: string[];
}

/** ¿Hay algo que el botón pueda cerrar en las semanas incluidas? */
export function hasCompletableGaps(weeks: readonly ReviewWeek[]): boolean {
  for (const week of weeks) {
    if (!week.included) continue;
    for (const day of week.days) {
      if (!day.included || day.sessions.length === 0) continue;
      for (const block of day.sessions.flatMap((s) => s.blocks)) {
        for (const item of block.items) {
          const id = item.exercise_id;
          if (id == null || Number(id) <= 0) return true;
          const check = checkPrescriptionCompleteness(item.prescription);
          if (!isExecutable(check)) return true;
        }
      }
    }
  }
  return false;
}

/** Nombre listo para crear: sin puntos suspensivos de foto cortada. */
export function cleanExerciseName(raw: string): string {
  return raw.replace(/(\.{3}|…)\s*$/g, '').trim();
}

/**
 * Plan puro a partir de los missing + candidaturas del servidor.
 * No llama red. `matchesByToken` usa el token crudo tal cual lo mandó el panel.
 */
export function planGapResolution(
  missing: readonly MissingExercise[],
  matchesByToken: ReadonlyMap<string, readonly ScoredCandidate[]>,
): GapPlan {
  const merge: ResolvedToken[] = [];
  const create: GapCreateSpec[] = [];
  const discardKeys: string[] = [];

  for (const m of missing) {
    if (m.notAnExercise) {
      discardKeys.push(m.key);
      continue;
    }
    const name = cleanExerciseName(m.token);
    if (!name) {
      discardKeys.push(m.key);
      continue;
    }
    const candidates = matchesByToken.get(m.token) ?? matchesByToken.get(m.key) ?? [];
    const best = candidates[0];
    if (best && best.score >= AUTO_MERGE_SCORE) {
      merge.push({ key: m.key, exercise_id: best.id, exercise_name: best.name });
      continue;
    }
    const modality: Modality = m.suggestedModality ?? 'strength';
    create.push({
      key: m.key,
      name,
      modality,
      category: m.suggestedCategory ?? defaultCategoryForModality(modality),
    });
  }

  return { merge, create, discardKeys };
}

/**
 * Siembra una dosis genérica ejecutable cuando la línea no tiene trabajo
 * medible. No toca ritmo/zona/kg. Devuelve campos propuestos en las rutas que
 * el revisor ya sabe pintar (sets[i].measure / target / rest_s).
 */
export function seedExecutableItem(
  item: EditorItem,
  defaults: ImportDefaultsValues = DEFAULT_IMPORT_DEFAULTS,
): { item: EditorItem; proposed: ProposedField[] } {
  const check = checkPrescriptionCompleteness(item.prescription);
  if (isExecutable(check)) return { item, proposed: [] };

  const modality: Modality =
    item.exercise_modality ?? item.prescription.modality ?? 'strength';
  const proposed: ProposedField[] = [];

  // Cardio sin dosis → un steady de 30' genérico (el coach lo cambia después).
  if (modality === 'run' || modality === 'row' || modality === 'ski' || modality === 'bike') {
    if (!hasAnyDose(item.prescription)) {
      const prescription: Prescription = {
        ...item.prescription,
        scheme: item.prescription.scheme === 'sets' ? 'steady' : item.prescription.scheme,
        modality,
        total_s: SEED_CARDIO_TOTAL_S,
      };
      // total_s no tiene ruta en ProposedField — no se pinta campo a campo, pero
      // el día deja de estar en rojo. Suficiente para el embudo de importación.
      return { item: { ...item, prescription }, proposed };
    }
  }

  // Fuerza / core / movilidad / resto → N series con rango de reps.
  const sets = [...(item.prescription.sets ?? [])];
  const needSeedSets = sets.length === 0 || sets.every((s) => s.measure == null && !('reps' in s));
  if (needSeedSets) {
    const n = Math.max(sets.length, SEED_STRENGTH_SETS);
    const nextSets = Array.from({ length: n }, (_, i) => {
      const prev = sets[i] ?? {};
      return {
        ...prev,
        measure: {
          kind: 'reps' as const,
          value: defaults.rep_range_min,
          max: defaults.rep_range_max,
        },
      };
    });
    for (let i = 0; i < nextSets.length; i += 1) {
      proposed.push({
        item_uid: item.uid,
        field: 'reps',
        path: `sets[${i}].measure`,
        snapshot: nextSets[i]!.measure,
      });
    }
    const prescription: Prescription = {
      ...item.prescription,
      scheme: 'sets',
      modality,
      sets: nextSets,
    };
    return { item: { ...item, prescription, exercise_modality: modality }, proposed };
  }

  // Hay series pero sin medida en alguna: rellena solo las vacías.
  let touched = false;
  const nextSets = sets.map((s, i) => {
    if (s.measure != null || ('reps' in s && (s as { reps?: unknown }).reps != null)) return s;
    touched = true;
    const measure = {
      kind: 'reps' as const,
      value: defaults.rep_range_min,
      max: defaults.rep_range_max,
    };
    proposed.push({
      item_uid: item.uid,
      field: 'reps',
      path: `sets[${i}].measure`,
      snapshot: measure,
    });
    return { ...s, measure };
  });
  if (!touched) return { item, proposed: [] };
  return {
    item: {
      ...item,
      prescription: { ...item.prescription, scheme: 'sets', modality, sets: nextSets },
      exercise_modality: item.exercise_modality ?? modality,
    },
    proposed,
  };
}

/** Aplica siembra + fillMissingWithDefaults a TODAS las sesiones de un día. */
export function completeDayDoses(
  day: ReviewDay,
  defaults: ImportDefaultsValues = DEFAULT_IMPORT_DEFAULTS,
): ReviewDay {
  const seededProposed: ProposedField[] = [];
  let sessions: EditorSession[] = day.sessions.map((s) => ({
    ...s,
    blocks: s.blocks.map((b) => ({
      ...b,
      items: b.items.map((it) => {
        if (it.exercise_id == null || Number(it.exercise_id) <= 0) return it;
        const { item, proposed } = seedExecutableItem(it, defaults);
        seededProposed.push(...proposed);
        return item;
      }),
    })),
  }));

  const fill = fillMissingWithDefaults(sessions, defaults);
  sessions = fill.sessions;

  const fillProposed: ProposedField[] = [];
  for (const f of fill.filled) {
    const item = sessions
      .flatMap((s) => s.blocks)
      .flatMap((b) => b.items)
      .find((i) => i.uid === f.item_uid);
    if (!item) continue;
    const m = /^sets\[(\d+)\]\.(measure|target|rest_s)$/.exec(f.path);
    if (!m) continue;
    const set = item.prescription.sets?.[Number(m[1])];
    if (!set) continue;
    const snapshot =
      m[2] === 'measure' ? set.measure : m[2] === 'target' ? set.target : set.rest_s;
    if (snapshot == null) continue;
    fillProposed.push({
      item_uid: f.item_uid,
      field: f.field,
      path: f.path,
      snapshot,
    });
  }

  const byPath = new Map<string, ProposedField>();
  for (const p of [...day.proposed, ...seededProposed, ...fillProposed]) {
    byPath.set(`${p.item_uid}|${p.path}`, p);
  }

  return {
    ...day,
    sessions,
    proposed: [...byPath.values()],
  };
}

/** Completa dosis en todas las semanas (tras resolver ejercicios). */
export function completeWeeksDoses(
  weeks: readonly ReviewWeek[],
  defaults: ImportDefaultsValues = DEFAULT_IMPORT_DEFAULTS,
): ReviewWeek[] {
  return weeks.map((week) => ({
    ...week,
    days: week.days.map((day) =>
      week.included && day.included ? completeDayDoses(day, defaults) : day,
    ),
  }));
}

/**
 * Aplica el plan de resolución (merge + creates ya hechos + discards) y siembra
 * dosis. `created` es la lista en el MISMO orden que `plan.create`.
 */
export function applyGapPlan(
  weeks: readonly ReviewWeek[],
  plan: GapPlan,
  created: ReadonlyArray<{ id: number | string; name: string }>,
  defaults: ImportDefaultsValues = DEFAULT_IMPORT_DEFAULTS,
): ReviewWeek[] {
  const resolved: ResolvedToken[] = [...plan.merge];
  plan.create.forEach((spec, i) => {
    const row = created[i];
    if (!row) return;
    resolved.push({
      key: spec.key,
      exercise_id: Number(row.id),
      exercise_name: row.name,
    });
  });
  const withExercises = applyMissingExerciseDecisions(weeks, {
    resolved,
    discardedKeys: plan.discardKeys,
  });
  return completeWeeksDoses(withExercises, defaults);
}
