import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import {
  applyAdjustment,
  listHistory,
  MassAdjustmentError,
} from '@/lib/coach/mass-adjustments';
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

  try {
    const result = await applyAdjustment({
      coach_id: auth.session.coach_id,
      applied_by_user_id: auth.session.user_id,
      scope: parsed.data.scope,
      payload: parsed.data.payload,
      excluded_athlete_ids: parsed.data.excluded_athlete_ids,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof MassAdjustmentError && err.code === 'empty_scope') {
      return jsonError('empty_scope', 'No athletes selected after exclusions', 422);
    }
    throw err;
  }
}

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const rows = await listHistory({ coach_id: auth.session.coach_id });
  return jsonOk({ rows });
}
