// Amazfit / Zepp (Huami Web API) webhook ingest — EXTENSION POINT (stub).
//
// =============================================================================
// TODO — NOT YET IMPLEMENTED. THIS FUNCTION PERSISTS NOTHING.
//
// PERO OJO ANTES DE IMPLEMENTARLO: los entrenos de un Amazfit YA NOS LLEGAN.
// La app Zepp sincroniza con Apple Salud ("Sync with Apple Health", en More
// Settings; fuente: support.amazfit.com), y nuestra ingesta de HealthKit no
// filtra por aplicación de origen, así que esos entrenos entran hoy por esa vía
// y se casan con el assignment del día como cualquier otro.
//
// O sea que esta vía directa es un MEJOR, no un NECESARIO. Lo que aporta sobre
// Apple Salud: la propia Zepp avisa de que "not all types of exercise records
// can be synchronized", y por Salud perdemos la atribución (todo llega marcado
// como healthkit) y el detalle de laps. Nada de eso justifica adivinar el
// esquema: cuando llegue la doc de partner, se implementa bien.
// =============================================================================
//
// This is the single, clearly-marked entry point the Amazfit webhook delegates
// to once a notification has been authenticated and its Huami user id resolved
// to an athlete_id. It deliberately does NOT map biometric/workout fields yet:
// the Huami Web API's exact per-data-type schemas live in api-doc.html (which
// currently 404s — only the base host api-open.huami.com and the /users/-/
// namespace are verified), and fabricating a field mapping now would be a guess
// that silently writes wrong data. We leave a typed, documented stub so the
// webhook route compiles and the auth/resolve path is exercisable end-to-end
// before the schema is confirmed on partner onboarding.
//
// IMPORTANT DOMAIN CAVEATS for whoever implements this:
//   * Huami webhooks are NOTIFICATIONS of a data change, not the data itself.
//     The real shape is typically a notify of {userId, dataType, date-range};
//     the actual records are then PULLED from api-open.huami.com/users/-/<type>
//     with the stored access token (load it via loadWearableConnection). Do NOT
//     assume the webhook body carries full workout/sleep payloads.
//   * Scopes map to data types: sport/sportDetail (workouts + GPS track), sleep,
//     heartrate, activity (daily steps/distance/calories), profile. HRV /
//     recovery / readiness / VO2max / training-load are NOT exposed by the Huami
//     Web API — do NOT promise or fabricate them.
//   * Data depth via Zepp can be shallower than Garmin/HealthKit (no per-rep /
//     structured-set granularity). Treat sport summaries as activity-level.
//
// WHEN IMPLEMENTING, MIRROR lib/sync/ingest-coros.ts / lib/sync/ingest-garmin.ts:
//   * Idempotency: guard every insert on (athlete_id, source='amazfit',
//     external_id) where external_id is Huami's stable workout/summary id,
//     falling back to a start-time when absent.
//   * Modality: map Huami sport/activity type → our modality enum (the Garmin
//     equivalent is garminActivityToModality in lib/garmin/lap-mapping.ts).
//   * Targets: workout summaries → workout_executions; per-interval/lap data →
//     segment_executions; biometrics (HR, sleep) → biometric_streams — same
//     target tables ingest-garmin writes.
//   * Source precedence: define Amazfit vs HealthKit/Garmin/COROS precedence
//     explicitly (Garmin currently wins over HK for the same workout per spec;
//     decide where Amazfit sits before writing workout_executions).
//   * Accept an optional `client?: Sql | TransactionClient` for transactional
//     callers, like the rest of lib/sync and lib/wearables/token-store.
//   * Keep heavy work OFF the webhook response path: the Huami contract requires
//     a 204 within ~2s or the subscription is dropped. Enqueue, don't block.
//
// Until the above lands, this function is a no-op that returns without touching
// the database.

/**
 * Ingest a single Amazfit / Zepp (Huami) webhook payload for the given athlete.
 *
 * @param athlete_id resolved from the Huami user id via findConnectionByProviderUser
 * @param payload    the parsed (JSON) Huami webhook body — schema TO-CONFIRM
 *
 * NO-OP STUB: persists nothing yet. See the file header before implementing.
 */
export async function ingestAmazfitWorkout(
  _athlete_id: bigint,
  _payload: unknown,
): Promise<void> {
  // Intentionally empty. Do not fabricate a field mapping — see header.
  return;
}
