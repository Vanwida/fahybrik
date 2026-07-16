import 'server-only';

// The athlete's OWN benchmark progression from `athlete_benchmarks` — the dated,
// canonical results the ejecución→benchmark bridge appends (real coach/athlete
// tests + onboarding). Athlete-scoped (own athlete_id) — the coach twin
// (loadBenchmarkHistory in dashboard/v2/atleta-detalle) is the same shape but
// coach-scoped. Grouped per slug, oldest→newest, capped so a runaway history stays
// bounded. Powers GET /api/athlete/benchmarks/history (the app's progression curves).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { benchmarkLabel } from '@fahybrid/shared/domain/coach/benchmark-slugs';

export interface AthleteBenchmarkPoint {
  value: number;
  recorded_at: string;
}

export interface AthleteBenchmarkSeries {
  exercise_slug: string;
  label: string;
  /** Stored unit ('seconds' | 'kg' | 'reps' | 'bpm' | …) — drives rendering. */
  unit: string;
  /** Oldest→newest, for the progression curve. */
  results: AthleteBenchmarkPoint[];
}

// A single runaway slug can't flood the response; the curve only needs the recent
// history. Latest N kept, then re-ordered oldest→newest for the client.
const MAX_POINTS_PER_SLUG = 50;

export async function loadAthleteBenchmarkSeries(params: {
  athlete_id: number;
  /** Narrow to one slug; omit/null for every series the athlete has. */
  slug?: string | null;
  client?: Sql;
}): Promise<AthleteBenchmarkSeries[]> {
  const client = params.client ?? defaultSql;
  const { athlete_id } = params;
  const slug = params.slug?.trim() || null;

  const rows = await client<
    { exercise_slug: string; value: number; unit: string; recorded_at: Date }[]
  >`
    select exercise_slug, value, unit, recorded_at
    from (
      select
        ab.exercise_slug,
        ab.value::float8 as value,
        ab.unit,
        ab.recorded_at,
        ab.id,
        row_number() over (
          partition by ab.exercise_slug order by ab.recorded_at desc, ab.id desc
        ) as rn
      from athlete_benchmarks ab
      where ab.athlete_id = ${athlete_id}
        and (${slug}::text is null or ab.exercise_slug = ${slug})
    ) ranked
    where rn <= ${MAX_POINTS_PER_SLUG}
    order by exercise_slug asc, recorded_at asc, id asc
  `;

  const grouped = new Map<string, AthleteBenchmarkSeries>();
  for (const r of rows) {
    let series = grouped.get(r.exercise_slug);
    if (!series) {
      series = {
        exercise_slug: r.exercise_slug,
        label: benchmarkLabel(r.exercise_slug),
        unit: r.unit,
        results: [],
      };
      grouped.set(r.exercise_slug, series);
    }
    series.results.push({ value: r.value, recorded_at: r.recorded_at.toISOString() });
  }
  return [...grouped.values()];
}
