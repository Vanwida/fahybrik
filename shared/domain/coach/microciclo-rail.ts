// Tres nombres de coach, nunca la palabra «parcial».
//
//  1. Badge del microciclo: «N de M publicadas»
//  2. Carril por semana: Visible | Borrador
//  3. Ejecución cortada: «a medias»
//
// «Parcial» era una trampa (auditoría 18-ago): el badge del microciclo, la
// sesión que el atleta guardó a medias y el MCP «publicado a medias» decían
// la misma palabra. El enum interno `publish_state: 'partial'` se queda —
// es mecanismo. Lo que lee el coach no.

export const RAIL_VISIBLE = 'Visible';
export const RAIL_BORRADOR = 'Borrador';
export const EXECUTION_A_MEDIAS = 'a medias';
export const PUBLISH_EMPTY_LABEL = 'sin publicar';

export type MicrocicloRailWeek = {
  week_start: string;
  visible: boolean;
};

export function publishedWeekCount(weekCount: number, draftWeekCount: number): number {
  return Math.max(0, weekCount - draftWeekCount);
}

/** Badge de la ficha Plan. Vacío = nada que entregar; si hay sesiones, el recuento. */
export function publishBadgeLabel(input: {
  session_count: number;
  week_count: number;
  draft_week_count: number;
}): string {
  if (input.session_count === 0 || input.week_count === 0) return PUBLISH_EMPTY_LABEL;
  return `${publishedWeekCount(input.week_count, input.draft_week_count)} de ${input.week_count} publicadas`;
}

export function railWeekLabel(visible: boolean): typeof RAIL_VISIBLE | typeof RAIL_BORRADOR {
  return visible ? RAIL_VISIBLE : RAIL_BORRADOR;
}

/** Lista «Ejecución reciente» de Plan. El token DB sigue siendo `partial`. */
export function executionStatusLabel(status: string): string {
  if (status === 'completed') return 'hecha';
  if (status === 'partial') return EXECUTION_A_MEDIAS;
  if (status === 'missed') return 'sin hacer';
  return status;
}

/**
 * Frase de `get_plan`. Todo en borrador conserva la frase del MCP (él no lo
 * ve). A medias de publicar usa el mismo recuento que el badge, no «parcial».
 */
export function mcpMicrocicloPhrase(input: {
  publish_state: 'draft' | 'partial' | 'published';
  session_count: number;
  week_count: number;
  draft_week_count: number;
}): string | null {
  if (input.session_count === 0 || input.publish_state === 'published') return null;
  if (input.publish_state === 'draft') return 'todavía en borrador (él no lo ve)';
  return publishBadgeLabel(input);
}
