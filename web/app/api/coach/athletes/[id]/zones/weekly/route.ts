import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { sql } from '@/lib/db';
import {
  loadWeeklyZones,
  WEEKLY_ZONES_DEFAULT_WEEKS,
  ZONE_MODALITIES,
} from '@/lib/zones/weekly';
import type { SegmentModality } from '@/lib/sync/ingest-execution-segments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/athletes/[id]/zones/weekly?weeks=26&modality=run
//
// El reparto semanal de tiempo en zonas de un atleta, más los tramos de su plan
// para la banda del eje. La agregación entera va en Postgres.
//
// El atleta se comprueba CONTRA EL COACH de la sesión: la ficha de un atleta
// ajeno responde 404, no una gráfica vacía.
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID inválido', 400);
  const athlete_id = Number(parsedId.data.id);

  const owned = await sql<Array<{ id: string }>>`
    select id::text as id from athletes
    where id = ${athlete_id} and coach_id = ${session.coach_id}
    limit 1
  `;
  if (owned.length === 0) return jsonError('not_found', 'Atleta no encontrado', 404);

  const url = new URL(request.url);
  const rawWeeks = url.searchParams.get('weeks');
  const weeks = rawWeeks != null && /^\d+$/.test(rawWeeks) ? Number(rawWeeks) : WEEKLY_ZONES_DEFAULT_WEEKS;

  const rawModality = url.searchParams.get('modality');
  // Una modalidad que no existe es una petición mal hecha, no «todas»: servir
  // todo el volumen bajo la etiqueta «Correr» sería mentir en silencio.
  if (rawModality != null && !ZONE_MODALITIES.includes(rawModality as SegmentModality)) {
    return jsonError('bad_request', 'modality inválida', 400);
  }

  const zones = await loadWeeklyZones({
    athlete_id,
    weeks,
    modality: (rawModality as SegmentModality | null) ?? null,
  });
  return jsonOk({ zones });
}
