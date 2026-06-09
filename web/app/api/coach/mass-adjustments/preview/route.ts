import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { buildPreview } from '@/lib/coach/mass-adjustments';
import { massAdjustmentRequestSchema } from '@/lib/coach/mass-adjustments-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }
  const parsed = massAdjustmentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid request', 400, parsed.error.flatten());
  }

  const preview = await buildPreview({
    coach_id: auth.session.coach_id,
    scope: parsed.data.scope,
    payload: parsed.data.payload,
    excluded_athlete_ids: parsed.data.excluded_athlete_ids,
  });
  return jsonOk(preview);
}
