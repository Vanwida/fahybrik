'use client';

// Client access to the coach "Coach IA redacta el entreno" endpoint (#33).
// GET  /api/coach/ai/suggest-workout?athlete_id= → { llm_configured, levels, axis_label, athlete_level_id }
//      (gates the "Completo" mode and offers the coach's OWN levels, not a fixed scale).
// POST /api/coach/ai/suggest-workout { focus, level_id?, mode, athlete_id? } → { suggestion }.
// The suggestion's `blocks` are WeekDayPart[]; the caller converts them to editor
// blocks (ai-blocks-to-editor) for the preview + insert. No schema duplicated here.

import type { WeekDayPart } from '@fahybrid/shared/schema/program-templates';
import { serializeBlockExercises } from '@/lib/dashboard/v2/editor-serialize';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';

export type SuggestMode = 'fast' | 'slow';
/** Un valor del eje del coach («Nivel» por defecto), tal como lo ofrece el GET. */
export interface CoachLevelOption {
  id: string;
  name: string;
  label: string;
}

export interface SuggestContext {
  llm_configured: boolean;
  levels: CoachLevelOption[];
  axis_label: string;
  /** El nivel del atleta (o el sugerido), si lo tiene y sigue activo. */
  athlete_level_id: string | null;
}

export interface AiSuggestion {
  mode: SuggestMode;
  /** Honest provenance: a real library template, an LLM composition, or the
   *  library fallback when the LLM was unavailable / no template matched. */
  source: 'library' | 'llm' | 'library_fallback';
  blocks: WeekDayPart[];
  matched_template?: { id: string; name: string; format: string };
  notes?: string;
}

export interface SuggestWorkoutInput {
  focus: string;
  mode: SuggestMode;
  /** Un nivel del coach; sin él, la IA no filtra por nivel. */
  level_id?: string | null;
  athlete_id?: string | number;
}

const ENDPOINT = '/api/coach/ai/suggest-workout';

/** Whether Coach IA's LLM is configured (the "Completo" mode) + the coach's levels. */
export async function getSuggestContext(athleteId?: string | number): Promise<SuggestContext> {
  const empty: SuggestContext = { llm_configured: false, levels: [], axis_label: 'Nivel', athlete_level_id: null };
  try {
    const q = athleteId != null ? `?athlete_id=${encodeURIComponent(String(athleteId))}` : '';
    const res = await fetch(`${ENDPOINT}${q}`, { credentials: 'include' });
    if (!res.ok) return empty;
    const body = (await res.json()) as Partial<SuggestContext>;
    return {
      llm_configured: body.llm_configured === true,
      levels: Array.isArray(body.levels) ? body.levels : [],
      axis_label: body.axis_label ?? 'Nivel',
      athlete_level_id: body.athlete_level_id ?? null,
    };
  } catch {
    return empty;
  }
}

/** Solo si el LLM está configurado (el formulario de importar no necesita niveles). */
export async function getLlmConfigured(): Promise<boolean> {
  return (await getSuggestContext()).llm_configured;
}

export class SuggestWorkoutError extends Error {}

/** Request a drafted workout. Throws SuggestWorkoutError with an honest message on failure. */
export async function requestSuggestion(input: SuggestWorkoutInput): Promise<AiSuggestion> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        focus: input.focus,
        mode: input.mode,
        ...(input.level_id ? { level_id: input.level_id } : {}),
        ...(input.athlete_id != null ? { athlete_id: input.athlete_id } : {}),
      }),
    });
  } catch {
    throw new SuggestWorkoutError('Error de red. Reintenta.');
  }
  if (!res.ok) {
    let msg = 'No se pudo redactar el entreno. Reintenta.';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) msg = body.error.message;
    } catch {
      /* keep default */
    }
    throw new SuggestWorkoutError(msg);
  }
  const body = (await res.json()) as { suggestion: AiSuggestion };
  return body.suggestion;
}

// ── Opt-in "guardar bloque compuesto en biblioteca" (#33 fork e) ─────────────────
// A composed (LLM) block is NOT auto-saved — that would pollute Pablo's curated
// methodology library. The coach opts in per block AND picks the methodology group
// (1..10), reusing the SAME create-block endpoint + serializer the Biblioteca uses.

export interface MethodologyGroupOption {
  id: number;
  name: string;
}

/** The coach's 10 pedagogical methodology groups (for the save-to-library picker). */
export async function getMethodologyGroups(): Promise<MethodologyGroupOption[]> {
  try {
    const res = await fetch('/api/coach/methodology-groups', { credentials: 'include' });
    if (!res.ok) return [];
    const body = (await res.json()) as { groups?: { id: number; name_es: string }[] };
    return (body.groups ?? []).map((g) => ({ id: g.id, name: g.name_es }));
  } catch {
    return [];
  }
}

/** Save ONE composed block to the coach's library under a chosen methodology group. */
export async function saveBlockToLibrary(
  block: EditorBlock,
  methodologyGroupId: number,
): Promise<{ ok: boolean; error: string | null }> {
  let exercises;
  try {
    // EditorBlock satisfies the serializer input — same path the Biblioteca uses.
    exercises = serializeBlockExercises([block]);
  } catch {
    return { ok: false, error: 'El bloque tiene líneas sin ejercicio; no se puede guardar.' };
  }
  if (exercises.length === 0) {
    return { ok: false, error: 'El bloque no tiene ejercicios que guardar.' };
  }
  try {
    const res = await fetch('/api/coach/blocks', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: block.title,
        methodology_group_id: methodologyGroupId,
        ...(block.format ? { format: block.format } : {}),
        exercises,
      }),
    });
    if (!res.ok) {
      let msg = 'No se pudo guardar en biblioteca.';
      try {
        const b = (await res.json()) as { error?: { message?: string } };
        if (b?.error?.message) msg = b.error.message;
      } catch {
        /* keep default */
      }
      return { ok: false, error: msg };
    }
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: 'Error de red al guardar en biblioteca.' };
  }
}
