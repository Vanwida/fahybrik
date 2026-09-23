// GET /api/coach/hr-method → { method, is_custom, defaults }
// PUT /api/coach/hr-method   body: { method: {...} | null }
//
// Dónde cortan las cinco bandas de FC (fracción del umbral) y el reparto que
// persigue el coach (`coach_hr_method`, mig 0168). Guardar reemplaza el conjunto;
// `null` vuelve a los defectos del producto.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { getCoachHrMethodSetting, resetCoachHrMethod, upsertCoachHrMethod } from '@/lib/coach/hr-method';
import { hrMethodPutSchema } from '@fahybrid/shared/domain/methodology/method-editors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  return jsonOk(await getCoachHrMethodSetting(auth.session.coach_id));
}

export async function PUT(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, hrMethodPutSchema);
  if (!body.ok) return body.response;
  const coach_id = auth.session.coach_id;
  if (body.data.method == null) await resetCoachHrMethod(coach_id);
  else await upsertCoachHrMethod(coach_id, body.data.method);
  return jsonOk(await getCoachHrMethodSetting(coach_id));
}
