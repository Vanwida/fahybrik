// GET   /api/coach/weeks/auto-publish → { auto_publish_days_before, effective_days, default_days }
// PATCH /api/coach/weeks/auto-publish   body: { auto_publish_days_before: number | null }
//
// Cuántos días antes de empezar se abre sola una semana en borrador automático.
// Es método del coach (HARD RULE Nº0): null vuelve al defecto del producto.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import {
  getAutoPublishSetting,
  setAutoPublishDays,
  WeekPublishingError,
} from '@/lib/coach/week-publishing';
import { autoPublishPatchSchema } from '@fahybrid/shared/schema/week-publishing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  return jsonOk(await getAutoPublishSetting(auth.session.coach_id));
}

export async function PATCH(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, autoPublishPatchSchema);
  if (!body.ok) return body.response;
  try {
    return jsonOk(await setAutoPublishDays(auth.session.coach_id, body.data.auto_publish_days_before));
  } catch (err) {
    if (err instanceof WeekPublishingError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}
