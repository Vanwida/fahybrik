// GET /api/athlete/thresholds → { anclas, declaraciones }
// PUT /api/athlete/thresholds   body: { kind, value | null, note? }
//
// Los umbrales del atleta tal como se resuelven (pulso, ritmo por modalidad,
// potencia por máquina, cada uno con su peldaño) y el toque para declarar el que
// falte: «mi umbral de pulso es 168». Un test sigue ganando a lo declarado.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { desdeSesionDeAtleta } from '@/lib/analytics/atleta-verificado';
import { declararUmbral, getUmbralesAtleta } from '@/lib/analytics/declaraciones';
import { declaracionUmbralSchema } from '@fahybrid/shared/domain/analytics/declaracion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);
  return jsonOk(await getUmbralesAtleta(desdeSesionDeAtleta(auth)));
}

export async function PUT(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);
  const body = await parseBody(request, declaracionUmbralSchema);
  if (!body.ok) return body.response;
  return jsonOk(await declararUmbral(desdeSesionDeAtleta(auth), body.data));
}
