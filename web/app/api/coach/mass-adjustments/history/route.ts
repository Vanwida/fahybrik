import { jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { listHistory } from '@/lib/coach/mass-adjustments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const rows = await listHistory({ coach_id: auth.session.coach_id });
  return jsonOk({ rows });
}
