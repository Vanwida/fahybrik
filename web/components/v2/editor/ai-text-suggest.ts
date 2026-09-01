'use client';

// Cliente de /api/coach/ai/text-suggest — los BORRADORES de las dos notas que el
// atleta lee en el móvil: la del entreno (cabecera de la sesión) y la de una
// línea prescrita (el ejercicio del compositor).
//
// Vive aquí y no en cada pantalla porque las dos superficies comparten contrato,
// tope y semántica de fallo: la ayuda es BLANDA, así que cualquier error (red,
// sesión caducada, payload rechazado) devuelve lista vacía y el campo se queda
// exactamente como estaba. Nunca se le mete al coach un texto que no ha elegido.
//
// El shape del contexto es el que valida el servidor (`text-ai-suggest.ts`); se
// declara aquí porque aquel módulo es `server-only` y no cruza la frontera.

import type { Modality, Prescription } from '@fahybrid/shared/domain/prescription';

const ENDPOINT = '/api/coach/ai/text-suggest';

/** Un bloque de la sesión tal como lo describe el editor (mismo shape que «Sugerir título»). */
export interface SessionNoteBlock {
  title?: string;
  format?: string | null;
  items: Array<{ exercise_name?: string; modality?: Modality }>;
}

export type TextSuggestRequest =
  | { surface: 'coach_note'; context: { session_title?: string; blocks: SessionNoteBlock[] } }
  | {
      surface: 'item_note';
      context: { exercise_name?: string; block_title?: string; prescription?: Prescription };
    };

/**
 * Pide borradores para un campo. NUNCA lanza: lista vacía = «no hay propuesta»,
 * que la UI resuelve dejando el campo intacto.
 */
export async function fetchTextSuggestions(body: TextSuggestRequest): Promise<string[]> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { suggestions?: unknown };
    if (!Array.isArray(data.suggestions)) return [];
    return data.suggestions.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  } catch {
    return [];
  }
}
