// GET   /api/coach/plan-renewal → { plan_renewal_days_before, effective_days, default_days }
// PATCH /api/coach/plan-renewal   body: { plan_renewal_days_before: number | null }
//
// Cuántos días antes de que acabe el plan de un atleta se prepara la vuelta
// siguiente de su grupo (fin de cadena «repetir» o «subir de nivel»). Es método
// del coach (HARD RULE Nº0): null vuelve al defecto del producto.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { getPlanRenewalSetting, PlanRenewalError, setPlanRenewalDays } from '@/lib/coach/plan-renewal';
import { planRenewalPatchSchema } from '@fahybrid/shared/schema/plan-renewal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  return jsonOk(await getPlanRenewalSetting(auth.session.coach_id));
}

export async function PATCH(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, planRenewalPatchSchema);
  if (!body.ok) return body.response;
  try {
    return jsonOk(await setPlanRenewalDays(auth.session.coach_id, body.data.plan_renewal_days_before));
  } catch (err) {
    if (err instanceof PlanRenewalError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}
