import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildDrillDown, resolvePeriod } from '@/lib/athlete/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/analytics/drilldown?kind=&period=&from=&to=&<params>
//
// The OTHER half of the design pattern: every aggregate opens its REAL source
// sessions. Pass the DrillRef the section card carried — `kind` plus its
// params (e.g. type, zone, distance, modality, slug, race_id, metric) and the
// SAME period — and get back the exact rows that produced the number (date /
// pace / distance / HR / time per session), straight from segment_executions /
// races / athlete_benchmarks / athlete_strength_maxes / biometric_streams.
// No fabrication: "ningún número sin su lista".
const KNOWN_KINDS = [
  'running.volume',
  'running.type',
  'running.zone',
  'running.best_effort',
  'ergo.split',
  'strength.lift',
  'hyrox.race',
  'recovery.metric',
] as const;
const kindSchema = z.enum(KNOWN_KINDS);
const periodSchema = z.enum(['7d', 'month', 'year', 'custom']);
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Whitelisted drill params (everything else is ignored). Short, safe strings.
const PARAM_KEYS = ['type', 'zone', 'distance', 'modality', 'slug', 'race_id', 'metric'] as const;

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const url = new URL(request.url);
  const kind = kindSchema.safeParse(url.searchParams.get('kind'));
  if (!kind.success) {
    return jsonError('bad_request', 'kind inválido o ausente', 400);
  }
  const periodKey = periodSchema.safeParse(url.searchParams.get('period') ?? 'month');
  if (!periodKey.success) {
    return jsonError('bad_request', 'period inválido', 400);
  }
  let from: string | null = null;
  let to: string | null = null;
  if (periodKey.data === 'custom') {
    const f = daySchema.safeParse(url.searchParams.get('from'));
    const t = daySchema.safeParse(url.searchParams.get('to'));
    if (!f.success || !t.success || f.data > t.data) {
      return jsonError('bad_request', 'custom requiere from<=to en YYYY-MM-DD', 400);
    }
    from = f.data;
    to = t.data;
  }

  const params: Record<string, string> = {};
  for (const k of PARAM_KEYS) {
    const v = url.searchParams.get(k);
    if (v != null && v.length > 0 && v.length <= 64) params[k] = v;
  }

  const period = resolvePeriod({ key: periodKey.data, from, to });
  const result = await buildDrillDown({ athlete_id: auth.athlete_id, kind: kind.data, params, period });
  if (!result) {
    return jsonError('not_found', 'No hay datos para ese desglose', 404);
  }
  return jsonOk(result);
}
