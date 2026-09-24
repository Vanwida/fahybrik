'use server';

// Carga del vistazo de un atleta como acción de servidor: el componente vive en
// `components/v2/shared` y la ruta `/api/coach/athletes/[id]/peek` no es de este
// dueño (plan §7). Misma sesión y mismo alcance que una ruta: coach de la cookie,
// y un atleta ajeno es «no encontrado». Si se prefiere una ruta GET, basta con
// envolver `loadAthletePeek` igual que aquí.

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadAthletePeek, type AthletePeekData } from '@/lib/coach/athlete-peek';

const idSchema = z.string().regex(/^\d{1,18}$/);

export type PeekResult =
  | { ok: true; data: AthletePeekData }
  | { ok: false; code: 'unauthorized' | 'not_found' | 'bad_request' | 'internal'; message: string };

export async function fetchAthletePeek(athleteId: string): Promise<PeekResult> {
  const parsed = idSchema.safeParse(athleteId);
  if (!parsed.success) return { ok: false, code: 'bad_request', message: 'Atleta no válido' };
  const session = await getCoachSession();
  if (!session) return { ok: false, code: 'unauthorized', message: 'Tu sesión ha caducado. Vuelve a entrar.' };
  try {
    const data = await loadAthletePeek({ coach_id: session.coach_id, athlete_id: parsed.data });
    if (!data) return { ok: false, code: 'not_found', message: 'Este atleta ya no está en tu lista.' };
    return { ok: true, data };
  } catch {
    return { ok: false, code: 'internal', message: 'No se ha podido cargar el atleta.' };
  }
}
