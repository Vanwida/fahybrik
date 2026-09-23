// GET /api/coach/running-thresholds → { thresholds, is_custom, defaults }
// PUT /api/coach/running-thresholds   body: { <clave>: número | null, … }
//
// Los umbrales de las lecturas de carrera del coach (`coach_running_thresholds`,
// migs 0183/0184/0187). Se cambian por clave; `null` = el defecto de esa clave.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { getCoachRunningThresholdsSetting, patchCoachRunningThresholds } from '@/lib/coach/running-thresholds';
import { runningThresholdsPatchSchema } from '@fahybrid/shared/domain/methodology/method-editors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  return jsonOk(await getCoachRunningThresholdsSetting(auth.session.coach_id));
}

export async function PUT(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, runningThresholdsPatchSchema);
  if (!body.ok) return body.response;
  await patchCoachRunningThresholds(auth.session.coach_id, body.data);
  return jsonOk(await getCoachRunningThresholdsSetting(auth.session.coach_id));
}
