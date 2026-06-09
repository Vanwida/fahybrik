import { requireAdmin } from '@/lib/auth/require-admin';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildBusinessMetrics } from '@/lib/dashboard/coach/business-metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/metrics — business metrics over the subscriptions table
// (MRR, churn, altas, renovaciones, desglose por modalidad). Read-only.
//
// MOVED from /api/coach/metrics: the money belongs to the platform owner, so
// it's admin-only now. Gated by requireAdmin (404 for non-admins).
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const metrics = await buildBusinessMetrics({});
    return jsonOk({ metrics });
  } catch (err) {
    console.error('[GET /api/admin/metrics]', err);
    return jsonError('metrics_failed', 'No se pudieron cargar las métricas.', 500);
  }
}
