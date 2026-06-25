// COROS Open API webhook ingest — EXTENSION POINT (stub).
//
// =============================================================================
// TODO — NOT YET IMPLEMENTED. THIS FUNCTION PERSISTS NOTHING.
// =============================================================================
//
// This is the single, clearly-marked entry point the COROS webhook delegates to
// once a notification has been authenticated and its COROS user id resolved to
// an athlete_id. It deliberately does NOT map biometric/workout fields yet:
// COROS's exact summary schema lives in their private API Reference Guide, and
// fabricating a field mapping now would be a guess that silently writes wrong
// data. We leave a typed, documented stub so the webhook route compiles and the
// auth/resolve path is exercisable end-to-end before the schema is confirmed.
//
// WHEN IMPLEMENTING, MIRROR lib/sync/ingest-garmin.ts:
//   * Idempotency: guard every insert on (athlete_id, source='coros',
//     external_id) where external_id is COROS's stable summary/workout id,
//     falling back to a start-time when absent (see ingest-garmin's external_id
//     derivation).
//   * Modality: map COROS sport/activity type → our modality enum (the Garmin
//     equivalent is garminActivityToModality in lib/garmin/lap-mapping.ts).
//   * Targets: workout summaries → workout_executions; per-interval/lap data →
//     segment_executions; biometrics (HR, sleep, HRV, weight, vo2max) →
//     biometric_streams — same target tables ingest-garmin writes.
//   * Source precedence: define COROS vs HealthKit/Garmin precedence explicitly
//     (Garmin currently wins over HK for the same workout per spec; decide where
//     COROS sits before writing workout_executions).
//   * Accept an optional `client?: Sql | TransactionClient` for transactional
//     callers, like the rest of lib/sync and lib/wearables/token-store.
//
// Until the above lands, this function is a no-op that returns without touching
// the database.

/**
 * Ingest a single COROS webhook payload for the given athlete.
 *
 * @param athlete_id resolved from the COROS user id via findConnectionByProviderUser
 * @param payload    the parsed (JSON) COROS webhook body — schema TO-CONFIRM
 *
 * NO-OP STUB: persists nothing yet. See the file header before implementing.
 */
export async function ingestCorosWorkout(
  _athlete_id: bigint,
  _payload: unknown,
): Promise<void> {
  // Intentionally empty. Do not fabricate a field mapping — see header.
  return;
}
