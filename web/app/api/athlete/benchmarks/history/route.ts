import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadAthleteBenchmarkSeries } from '@/lib/athlete/benchmark-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/benchmarks/history[?slug=run_5k] — the calling athlete's dated
// benchmark progression from athlete_benchmarks, grouped per slug (oldest→newest).
// The athlete twin of the coach ficha's progression curves. Athlete bearer.
// snake_case. Distinct from GET /api/athlete/benchmarks (current 1RM per lift, from
// athlete_strength_maxes) — this is the full dated series across every benchmark.
export async function GET(req: Request) {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete bearer token required', 401);

  const slug = new URL(req.url).searchParams.get('slug');
  const series = await loadAthleteBenchmarkSeries({
    athlete_id: Number(auth.athlete_id),
    slug,
  });

  return jsonOk({ series });
}
