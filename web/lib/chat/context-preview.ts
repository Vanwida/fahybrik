// La PREVISUALIZACIÓN del contexto de un mensaje — VIVA, resuelta al LEER,
// nunca guardada. Ver docs/DECISIONS.md 12-ago "El chat aprende SOBRE QUÉ va
// el mensaje" (ampliación de previsualización) y `web/lib/chat/schema.ts`
// (`messageContextDtoSchema`).
//
// POR QUÉ VIVA Y NO CONGELADA
// ---------------------------
// La ETIQUETA (`context_label`) se congela al enviar porque es un recuerdo de
// "sobre qué hablaba yo" — "hoy"/"ayer" mintiendo la semana siguiente sería
// peor que nada. La PREVISUALIZACIÓN es lo contrario: el coach está a punto de
// contestar o corregir la cosa, así que necesita su estado de AHORA. Una
// previsualización congelada le haría contestar sobre un fantasma. Por eso
// nunca se guarda en `chat_messages` y se recalcula en cada lectura.
//
// POR QUÉ EN LOTE
// ---------------
// El hilo pagina de 30 en 30 (`listMessages`). Resolver cada burbuja con su
// propia consulta sería un N+1 de manual. En su lugar, el llamante junta TODAS
// las referencias de la página, `resolveContextPreviews` las agrupa por
// `kind` y cada grupo se resuelve con sus propias consultas EN LOTE (por
// refs, nunca una por mensaje) — el número de consultas depende de cuántos
// `kind` distintos aparecen en la página, no de cuántos mensajes la componen.
//
// REUTILIZACIÓN, NO UNA SEGUNDA GRAMÁTICA
// ----------------------------------------
// `session` sin `sub` reutiliza `loadTemplateSummaries` (exportada de
// `web/lib/athlete/week-plan.ts` para esto) — el MISMO cálculo de bloques +
// `sessionDuration` que ya sirve la semana del atleta. `session` con `sub`
// reutiliza `prescriptionToText` (`shared/domain/prescription/to-text.ts`), el
// mismo formateador de dosis que el detalle de asignación. La cuenta atrás de
// `race` reutiliza `diffDays`/`parseIsoDate`/`startOfDayInBox`
// (`shared/domain/dates.ts`) y `exactTimeLabel`
// (`shared/domain/goal-gap/label.ts`); su día-mes reutiliza `raceDayLabel` de
// `./context.ts`. `exercise` reutiliza los diccionarios de etiqueta ya
// existentes del catálogo (`EXERCISE_CATEGORY_LABELS`, `MODALITY_LABELS`).
// Ninguno de estos formateadores nace aquí.

import type { Sql } from '@/lib/db';
import { loadTemplateSummaries, type TemplateSummary } from '@/lib/athlete/week-plan';
import { EXERCISE_CATEGORY_LABELS } from '@/lib/dashboard/exercises/filter-chips';
import { MODALITY_LABELS } from '@/lib/dashboard/exercises/catalog-ui';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import {
  durationUnknownEs,
  prescriptionToText,
  safeParsePrescription,
  type Modality,
} from '@fahybrid/shared/domain/prescription';
import { diffDays, parseIsoDate, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import { exactTimeLabel } from '@fahybrid/shared/domain/goal-gap';
import { raceDayLabel } from './context';
import type { ChatContext } from './schema';

export type ChatContextPreview = {
  preview: string | null;
  exists: boolean;
  state: 'done' | 'pending' | null;
};

const NOT_FOUND: ChatContextPreview = { preview: null, exists: false, state: null };

/** Clave del mapa de previsualizaciones — una entrada por terna real, así que
 *  dos mensajes que citan la MISMA sesión/ejercicio/carrera comparten
 *  resultado sin recalcularlo dos veces. */
export function previewKey(c: Pick<ChatContext, 'kind' | 'ref' | 'sub'>): string {
  return `${c.kind}:${c.ref}:${c.sub ?? ''}`;
}

/**
 * `workout_assignments.status` → el binario que el móvil necesita para saber
 * qué ficha abrir. MISMO corte que ya usa `buildExecutionBlock` en
 * `web/lib/athlete/assignment-detail.ts` ("completed" y "partial" son las dos
 * formas de haberlo hecho; todo lo demás — scheduled/missed/skipped — es la
 * ficha previa). Una constante, no un formateador: cero grafía nueva, solo
 * repite el mismo corte de dos valores.
 */
const DONE_STATUSES = new Set(['completed', 'partial']);
function assignmentState(status: string): 'done' | 'pending' {
  return DONE_STATUSES.has(status) ? 'done' : 'pending';
}

/**
 * Resuelve, EN LOTE, la previsualización de cada contexto de la página. Los
 * agrupa por `kind` (máximo 3 grupos) y cada grupo dispara sus propias
 * consultas por lote de refs — nunca una por contexto. Vacío → mapa vacío,
 * sin tocar la base.
 */
export async function resolveContextPreviews(
  sql: Sql,
  contexts: ChatContext[],
): Promise<Map<string, ChatContextPreview>> {
  const out = new Map<string, ChatContextPreview>();
  if (contexts.length === 0) return out;

  const sessions = contexts.filter((c) => c.kind === 'session');
  const exercises = contexts.filter((c) => c.kind === 'exercise');
  const races = contexts.filter((c) => c.kind === 'race');

  await Promise.all([
    resolveSessionPreviews(sql, sessions, out),
    resolveExercisePreviews(sql, exercises, out),
    resolveRacePreviews(sql, races, out),
  ]);

  return out;
}

// -----------------------------------------------------------------------------
// session — el entreno (workout_assignments), con `sub` opcional = una línea
// (template_segments) DENTRO de ese entreno.
// -----------------------------------------------------------------------------

type AssignmentExistenceRow = { ref: string; status: string; template_id: string };

async function resolveSessionPreviews(
  sql: Sql,
  contexts: ChatContext[],
  out: Map<string, ChatContextPreview>,
): Promise<void> {
  if (contexts.length === 0) return;

  // Consulta 1/2 del kind `session`: existencia + estado + plantilla de CADA
  // assignment referenciado (con o sin `sub` — los dos casos la necesitan).
  const refs = Array.from(new Set(contexts.map((c) => c.ref)));
  const rows = await sql<AssignmentExistenceRow[]>`
    select id::text as ref, status::text as status, template_id::text as template_id
    from workout_assignments
    where id = any(${refs}::bigint[])
  `;
  const byRef = new Map(rows.map((r) => [r.ref, r]));

  const noSub = contexts.filter((c) => !c.sub);
  const withSub = contexts.filter((c) => c.sub);

  await Promise.all([
    resolveSessionSummaryPreviews(sql, noSub, byRef, out),
    resolveSessionLinePreviews(sql, withSub, byRef, out),
  ]);
}

/** `session` SIN `sub` — la prescripción corta y el reloj que YA escribe el
 *  plan para esa sesión, reutilizando `loadTemplateSummaries`
 *  (`web/lib/athlete/week-plan.ts`) tal cual sirve `/api/athlete/plan/week`. */
async function resolveSessionSummaryPreviews(
  sql: Sql,
  contexts: ChatContext[],
  byRef: Map<string, AssignmentExistenceRow>,
  out: Map<string, ChatContextPreview>,
): Promise<void> {
  if (contexts.length === 0) return;

  const templateIds = Array.from(
    new Set(
      contexts
        .map((c) => byRef.get(c.ref)?.template_id)
        .filter((t): t is string => t != null),
    ),
  );
  // Consulta 2/2 del kind `session` (rama sin `sub`): batch por plantilla —
  // varios assignments distintos pueden compartir la misma plantilla. `sql`
  // se pasa EXPLÍCITO: sin él, `loadTemplateSummaries` cae a su cliente por
  // defecto y este módulo dejaría de respetar el cliente que le pasó su
  // llamante (una rama de test, una transacción) — justo el escape que
  // `web/tests/utils/test-db.ts` avisa que hay que evitar.
  const summaries: Map<string, TemplateSummary> =
    templateIds.length > 0 ? await loadTemplateSummaries(templateIds, sql) : new Map();

  for (const c of contexts) {
    const assignment = byRef.get(c.ref);
    if (!assignment) {
      out.set(previewKey(c), NOT_FOUND);
      continue;
    }
    const summary = summaries.get(assignment.template_id);
    out.set(previewKey(c), {
      preview: summary ? formatSessionSummaryPreview(summary) : null,
      exists: true,
      state: assignmentState(assignment.status),
    });
  }
}

/** "Calentamiento · Series · Vuelta a la calma · 30 min" — el resumen de
 *  bloques + el reloj, exactamente como ya los deriva `loadTemplateSummaries`.
 *  El reloj SIEMPRE tiene algo que decir (número o motivo, nunca los dos a la
 *  vez null — ver `TemplateSummary`); el resumen de bloques puede faltar
 *  (plantilla-reloj sin segmentos), y entonces la línea es solo el reloj. */
function formatSessionSummaryPreview(summary: TemplateSummary): string {
  const durationText =
    summary.est_duration_minutes != null
      ? `${summary.est_duration_minutes} min`
      : summary.duration_unknown_reason != null
        ? durationUnknownEs(summary.duration_unknown_reason)
        : null;
  return [summary.short_prescription, durationText].filter((s): s is string => !!s).join(' · ');
}

/** `session` CON `sub` — la dosis de ESA línea (reps, carga, RIR/RPE, tempo,
 *  descanso), tal como ya la redacta el detalle de asignación vía
 *  `prescriptionToText`. Un solo `join`: `ts.template_id = wa.template_id`
 *  (leído de la consulta de existencia) descarta un `sub` que ya no
 *  pertenece a la plantilla ACTUAL del assignment — el mismo criterio que
 *  `context.ts`'s `resolveSession` usa al validar en el envío, así que "ya no
 *  está" significa lo mismo al escribir y al leer. */
async function resolveSessionLinePreviews(
  sql: Sql,
  contexts: ChatContext[],
  byRef: Map<string, AssignmentExistenceRow>,
  out: Map<string, ChatContextPreview>,
): Promise<void> {
  if (contexts.length === 0) return;

  const subIds = Array.from(new Set(contexts.map((c) => c.sub!)));
  const segRows = await sql<
    { sub: string; template_id: string; prescription_json: unknown }[]
  >`
    select id::text as sub, template_id::text as template_id, prescription_json
    from template_segments
    where id = any(${subIds}::bigint[])
  `;
  const bySub = new Map(segRows.map((r) => [r.sub, r]));

  for (const c of contexts) {
    const assignment = byRef.get(c.ref);
    if (!assignment) {
      out.set(previewKey(c), NOT_FOUND);
      continue;
    }
    const seg = bySub.get(c.sub!);
    if (!seg || seg.template_id !== assignment.template_id) {
      // El entreno sigue navegable (el móvil abre la sesión igual); lo que ya
      // no está es la línea concreta que se citó — su dosis no se inventa.
      out.set(previewKey(c), { preview: null, exists: false, state: assignmentState(assignment.status) });
      continue;
    }
    const parsed = seg.prescription_json ? safeParsePrescription(seg.prescription_json) : null;
    out.set(previewKey(c), {
      preview: parsed && parsed.success ? prescriptionToText(parsed.data) : null,
      exists: true,
      state: assignmentState(assignment.status),
    });
  }
}

// -----------------------------------------------------------------------------
// exercise — el ejercicio del catálogo, en abstracto (no una línea de un
// entreno concreto). Categoría + modalidad son intrínsecas al ejercicio
// (migración 0053, "locked") — no dependen del coach que las lee.
// -----------------------------------------------------------------------------

async function resolveExercisePreviews(
  sql: Sql,
  contexts: ChatContext[],
  out: Map<string, ChatContextPreview>,
): Promise<void> {
  if (contexts.length === 0) return;

  const refs = Array.from(new Set(contexts.map((c) => c.ref)));
  const rows = await sql<{ ref: string; category: string; modality: string }[]>`
    select id::text as ref, category::text as category, modality
    from exercises
    where id = any(${refs}::bigint[])
  `;
  const byRef = new Map(rows.map((r) => [r.ref, r]));

  for (const c of contexts) {
    const row = byRef.get(c.ref);
    if (!row) {
      out.set(previewKey(c), NOT_FOUND);
      continue;
    }
    out.set(previewKey(c), {
      preview: exerciseCategoryModalityLabel(row.category, row.modality),
      exists: true,
      state: null,
    });
  }
}

/** "HYROX · Remo" — categoría + modalidad, en el vocabulario que ya habla el
 *  catálogo (`EXERCISE_CATEGORY_LABELS`, `MODALITY_LABELS`). Cuando las dos
 *  etiquetas coinciden (p. ej. categoría "Fuerza" + modalidad "Fuerza") se
 *  colapsan a una sola — repetir la misma palabra dos veces no añade
 *  información. */
function exerciseCategoryModalityLabel(category: string, modality: string): string {
  const categoryLabel = EXERCISE_CATEGORY_LABELS[category as ExerciseCategory] ?? category;
  const modalityLabel = MODALITY_LABELS[modality as Modality] ?? modality;
  return categoryLabel === modalityLabel ? categoryLabel : `${categoryLabel} · ${modalityLabel}`;
}

// -----------------------------------------------------------------------------
// race — fecha, cuenta atrás y objetivo (si lo hay). `race` no tiene `sub`.
// -----------------------------------------------------------------------------

async function resolveRacePreviews(
  sql: Sql,
  contexts: ChatContext[],
  out: Map<string, ChatContextPreview>,
): Promise<void> {
  if (contexts.length === 0) return;

  const refs = Array.from(new Set(contexts.map((c) => c.ref)));
  const rows = await sql<
    { ref: string; race_date: string; goal_time_seconds: number | null }[]
  >`
    select id::text as ref, race_date::text as race_date, goal_time_seconds
    from races
    where id = any(${refs}::bigint[])
  `;
  const byRef = new Map(rows.map((r) => [r.ref, r]));

  for (const c of contexts) {
    const row = byRef.get(c.ref);
    if (!row) {
      out.set(previewKey(c), NOT_FOUND);
      continue;
    }
    out.set(previewKey(c), {
      preview: raceCountdownPreview(row.race_date, row.goal_time_seconds),
      exists: true,
      state: null,
    });
  }
}

/** "11 nov · en 91 días · objetivo 1:25:00" — fecha (mismo formato que la
 *  etiqueta congelada, `raceDayLabel`), cuenta atrás (positiva = queda;
 *  negativa = ya pasó, una carrera de la que se sigue hablando después) y
 *  objetivo si el atleta lo fijó. "Hoy" en huso del box — igual que cada
 *  otra cuenta atrás de carrera de la app (`getNextRace`). */
function raceCountdownPreview(raceDate: string, goalTimeSeconds: number | null): string {
  const days = diffDays(parseIsoDate(raceDate), startOfDayInBox(new Date()));
  const parts = [raceDayLabel(raceDate), countdownWord(days)];
  if (goalTimeSeconds != null) parts.push(`objetivo ${exactTimeLabel(goalTimeSeconds)}`);
  return parts.join(' · ');
}

function countdownWord(days: number): string {
  if (days === 0) return 'hoy';
  if (days > 0) return `en ${days} ${days === 1 ? 'día' : 'días'}`;
  const elapsed = Math.abs(days);
  return `hace ${elapsed} ${elapsed === 1 ? 'día' : 'días'}`;
}
