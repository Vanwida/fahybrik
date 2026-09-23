// Llamadas de las acciones en bloque de Atletas (§4.7, §4.8) y sus textos.
// Cliente fino sobre `apiJson`: el servidor valida y decide; aquí solo se arma
// el cuerpo y se cuenta el resultado en castellano.

import type { BulkAthletesInput, BulkAthletesResponse } from '@fahybrid/shared/schema/bulk';
import type { BulkWeekPublishResult } from '@fahybrid/shared/schema/week-publishing';
import type { AssignUndoResult } from '@fahybrid/shared/schema/assign-many';
import { apiJson } from '@/components/v2/shared/api';

export function runBulk(body: BulkAthletesInput): Promise<BulkAthletesResponse> {
  return apiJson<BulkAthletesResponse>('/api/coach/athletes/bulk', { method: 'POST', body });
}

export function publishWeek(athlete_ids: string[], week_start: string): Promise<BulkWeekPublishResult> {
  return apiJson<BulkWeekPublishResult>('/api/coach/weeks/publish', { method: 'POST', body: { athlete_ids, week_start } });
}

/** Deshacer «Publicar»: la semana vuelve a quedar oculta (retenida) para quien se abrió. */
export async function hideWeek(athlete_ids: string[], week_start: string): Promise<number> {
  const res = await Promise.allSettled(
    athlete_ids.map((id) =>
      apiJson(`/api/coach/athletes/${id}/weeks/${week_start}/hold`, { method: 'POST', body: { held: true } }),
    ),
  );
  return res.filter((r) => r.status === 'fulfilled').length;
}

export interface BroadcastResult {
  sent: number;
  failed: number;
  failed_ids: string[];
}

export function broadcast(athlete_ids: string[], body: string): Promise<BroadcastResult> {
  return apiJson<BroadcastResult>('/api/coach/messages/broadcast', { method: 'POST', body: { athlete_ids, body } });
}

export function undoAssign(batch_id: string): Promise<AssignUndoResult> {
  return apiJson<AssignUndoResult>(`/api/coach/assign/${batch_id}/undo`, { method: 'POST' });
}

/** «3 atletas», «1 atleta». */
export function atletas(n: number): string {
  return `${n} ${n === 1 ? 'atleta' : 'atletas'}`;
}

/** Lo que no se hizo, en una línea: «2 ya estaban así». */
export function skippedLine(res: Pick<BulkAthletesResponse, 'skipped' | 'results'>): string | undefined {
  if (res.skipped === 0) return undefined;
  const first = res.results.find((r) => !r.ok && r.message)?.message;
  return first && res.skipped === 1 ? first : `${res.skipped} sin cambios${first ? ` · ${first}` : ''}`;
}
