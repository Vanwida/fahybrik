// Cómo el cajón Entreno lee la respuesta de
// GET /api/coach/athletes/[id]/sessions/[session_id]/detail.
//
// Vive fuera del componente para poder clavar el contrato sin montar React:
// 400/404 no es un fallo de carga (el id no era de este atleta), el resto de
// no-OK sí lo es, y un 200 sin `session` no se pinta como si hubiera detalle.

import type { CoachSessionDetail } from '@/lib/dashboard/coach/athlete-session-adapter';

export type CoachSessionDetailLoad =
  | { kind: 'invalid' }
  | { kind: 'error' }
  | { kind: 'ready'; session: CoachSessionDetail };

export async function readCoachSessionDetailResponse(
  res: Response,
): Promise<CoachSessionDetailLoad> {
  if (res.status === 400 || res.status === 404) return { kind: 'invalid' };
  if (!res.ok) return { kind: 'error' };
  try {
    const body = (await res.json()) as { session?: CoachSessionDetail | null };
    if (!body.session) return { kind: 'error' };
    return { kind: 'ready', session: body.session };
  } catch {
    return { kind: 'error' };
  }
}
