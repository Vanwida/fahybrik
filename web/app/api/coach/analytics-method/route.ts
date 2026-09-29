// GET /api/coach/analytics-method → { method, is_custom, defaults, list_keys }
// PUT /api/coach/analytics-method   body: { method: {...} | null }
//
// El método del coach para las analíticas del atleta (`coach_analytics_method`,
// migs 0189/0190/0277/0279/0280): ventanas de la carga, escalera por modalidad,
// bandas de frescura, cumplimiento, cambio significativo, reparto de intensidad,
// «¿mejoro?» por familia, ventana basal, capacidad y recuperación. Guardar
// reemplaza el conjunto; `null` vuelve a los defectos del producto. Lo pinta el
// editor de Ajustes › Método (`AnalyticsMethodSettings`) y ambos validan con el
// mismo esquema Zod.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import {
  getCoachAnalyticsMethodSetting,
  resetCoachAnalyticsMethod,
  upsertCoachAnalyticsMethod,
} from '@/lib/coach/analytics-method';
import { analyticsMethodPutSchema } from '@fahybrid/shared/domain/methodology/method-editors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  return jsonOk(await getCoachAnalyticsMethodSetting(auth.session.coach_id));
}

export async function PUT(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, analyticsMethodPutSchema);
  if (!body.ok) return body.response;
  const coach_id = auth.session.coach_id;
  if (body.data.method == null) await resetCoachAnalyticsMethod(coach_id);
  else await upsertCoachAnalyticsMethod(coach_id, body.data.method);
  return jsonOk(await getCoachAnalyticsMethodSetting(coach_id));
}
