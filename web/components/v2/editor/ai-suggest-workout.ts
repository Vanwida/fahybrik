'use client';

// Client access to the coach "Pablo IA redacta el entreno" endpoint (#33).
// GET  /api/coach/ai/suggest-workout → { llm_configured } (gates the "Completo" mode).
// POST /api/coach/ai/suggest-workout { focus, level?, mode, athlete_id? } → { suggestion }.
// The suggestion's `blocks` are WeekDayPart[]; the caller converts them to editor
// blocks (ai-blocks-to-editor) for the preview + insert. No schema duplicated here.

import type { WeekDayPart } from '@fahybrid/shared/schema/program-templates';

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

/** Whether Pablo IA's LLM is configured — drives showing/enabling the "Completo" mode. */
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
