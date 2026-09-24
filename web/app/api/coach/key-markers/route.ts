// GET /api/coach/key-markers → la elección del coach + el catálogo.
// POST /api/coach/key-markers { keys: string[] } → reemplaza la elección (en orden).
//
// Los marcadores clave son MÉTODO del coach (mig 0233); el catálogo y el defecto
// viven en shared/domain/coach/key-markers.ts.

import { z } from 'zod';
import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import {
  KEY_MARKERS_MAX,
  KEY_MARKER_CATALOG,
} from '@fahybrid/shared/domain/coach/key-markers';
import { KeyMarkersError, loadCoachKeyMarkers, saveCoachKeyMarkers } from '@/lib/coach/key-markers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const putSchema = z
  .object({
    keys: z
      .array(z.string().min(1).max(64))
      .min(1, 'Elige al menos un marcador.')
      .max(KEY_MARKERS_MAX, `Como mucho ${KEY_MARKERS_MAX} marcadores.`),
  })
  .strict();

function payload(selected: { key: string }[]) {
  return {
    selected: selected.map((d) => d.key),
    catalog: KEY_MARKER_CATALOG.map((d) => ({ key: d.key, label: d.label })),
    max: KEY_MARKERS_MAX,
  };
}

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  return jsonOk(payload(await loadCoachKeyMarkers(auth.session.coach_id)));
}

export async function POST(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  try {
    const saved = await saveCoachKeyMarkers({ coach_id: auth.session.coach_id, keys: body.data.keys });
    return jsonOk(payload(saved));
  } catch (err) {
    if (err instanceof KeyMarkersError) return jsonError('bad_request', err.message, 400);
    throw err;
  }
}
