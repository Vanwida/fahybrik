'use client';

// Client access to the coach "Coach IA redacta el entreno" endpoint (#33).
// GET  /api/coach/ai/suggest-workout → { llm_configured } (gates the "Completo" mode).
// POST /api/coach/ai/suggest-workout { focus, level?, mode, athlete_id? } → { suggestion }.
// The suggestion's `blocks` are WeekDayPart[]; the caller converts them to editor
// blocks (ai-blocks-to-editor) for the preview + insert. No schema duplicated here.

import type { WeekDayPart } from '@fahybrid/shared/schema/program-templates';
import { serializeBlockExercises } from '@/lib/dashboard/v2/editor-serialize';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';

export type SuggestMode = 'fast' | 'slow';
export type ProgramLevel = 'beginner' | 'intermediate' | 'pro' | 'elite';

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
  level?: ProgramLevel;
  athlete_id?: string | number;
}

const ENDPOINT = '/api/coach/ai/suggest-workout';

/** Whether Coach IA's LLM is configured — drives showing/enabling the "Completo" mode. */
export async function getLlmConfigured(): Promise<boolean> {
  try {
    const res = await fetch(ENDPOINT, { credentials: 'include' });
    if (!res.ok) return false;
    const body = (await res.json()) as { llm_configured?: boolean };
    return body.llm_configured === true;
  } catch {
    return false;
  }
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
        ...(input.level ? { level: input.level } : {}),
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
