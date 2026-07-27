import 'server-only';
import type { Sql, TransactionClient } from '@/lib/db';
import {
  benchmarkForTestEvent,
  type TestEvent,
} from '@fahybrid/shared/domain/athlete/record-test-result';

// KEYSTONE — the benchmark sink (thin SQL wrapper over the pure shared mapping).
//
// APPENDS one dated `athlete_benchmarks` row per recorded test, so every
// post-onboarding test (coach/athlete · threshold/strength) lands canonical
// progression evidence — feeding the progress engine + the coach test_logged
// signal — instead of writing only its plan-facing projection. Accepts a
// TransactionClient so the route commits the projection + this benchmark together
// (one atomic test event). `notes` carries the provenance tag (coach_test |
// athlete_test), kept distinct from onboarding's 'onboarding' tag so a re-submit
// never deletes a real recorded test.
export async function recordTestBenchmark(
  client: Sql | TransactionClient,
  event: TestEvent,
): Promise<void> {
  const b = benchmarkForTestEvent(event);
  // `source` is the typed provenance column (0139); `notes` keeps carrying the same
  // tag as a human-readable trace, exactly as before.
  await client`
    insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, notes, source)
    values (${event.athlete_id}, ${b.exercise_slug}, ${b.value}, ${b.unit}, ${event.source}, ${event.source})
  `;
}
