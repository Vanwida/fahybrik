import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listHistory } from '@/lib/coach/weekly-review';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }
  const url = new URL(req.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

  const items = await listHistory({
    coach_id: session.coach_id,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  return jsonOk({ items });
}
