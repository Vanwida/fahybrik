// Polar AccessLink webhook ingest — EXTENSION POINT (stub).
//
// =============================================================================
// TODO — NOT YET IMPLEMENTED. THIS FUNCTION PERSISTS NOTHING.
// =============================================================================
//
// This is the single, clearly-marked entry point the Polar webhook delegates to
// once a notification has been authenticated and its Polar user id resolved to an
// athlete_id. It deliberately does NOT map biometric/workout fields yet: Polar's
// AccessLink event payloads only reference an entity (e.g. an EXERCISE id) that
// must then be FETCHED from the AccessLink REST API (apiBase in lib/polar/config),
// and fabricating a field mapping now would be a guess that silently writes wrong
// data. We leave a typed, documented stub so the webhook route compiles and the
// auth/resolve path is exercisable end-to-end before the schema is confirmed.
//
// WHEN IMPLEMENTING, MIRROR lib/sync/ingest-garmin.ts (and ingest-coros.ts):
//   * Fetch: Polar webhooks notify, they don't carry full data. Load the access
//     token (loadWearableConnection), GET the referenced entity from apiBase
//     (refreshAccessToken with basicAuth:true when the ~12h token has expired),
//     then map the fetched body.
//   * Idempotency: guard every insert on (athlete_id, source='polar', external_id)
//     where external_id is Polar's stable exercise/transaction id, falling back
//     to a start-time when absent (see ingest-garmin's external_id derivation).
//   * Modality: map Polar sport/detailed-sport-info → our modality enum (the
//     Garmin equivalent is garminActivityToModality in lib/garmin/lap-mapping.ts).
//   * Targets: exercise summaries → workout_executions; per-sample/lap data →
//     segment_executions; biometrics (HR, sleep, nightly recharge, continuous
//     samples) → biometric_streams — same target tables ingest-garmin writes.
//   * Source precedence: define Polar vs HealthKit/Garmin/COROS precedence
//     explicitly before writing workout_executions.
//   * Accept an optional `client?: Sql | TransactionClient` for transactional
//     callers, like the rest of lib/sync and lib/wearables/token-store.
//
// Until the above lands, this function is a no-op that returns without touching
// the database.

/**
 * Ingest a single Polar AccessLink webhook payload for the given athlete.
 *
 * @param athlete_id resolved from the Polar user id via findConnectionByProviderUser
 * @param payload    the parsed (JSON) Polar webhook body — schema TO-CONFIRM
 *
 * NO-OP STUB: persists nothing yet. See the file header before implementing.
 */
export async function ingestPolar(
  _athlete_id: bigint,
  _payload: unknown,
): Promise<void> {
  // Intentionally empty. Do not fabricate a field mapping — see header.
  return;
}
