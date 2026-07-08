// Athlete lifecycle (#13) — SINGLE source of truth for the lifecycle status +
// pause-reason label maps, shared by web (coach dashboard) and the iOS athlete/coach
// surfaces. Mirrors the pg `athlete_lifecycle_status` enum and the
// `athlete_pauses.reason` / `athlete_pause_requests.reason` CHECK sets (migration 0104).
//
// Framework-agnostic: only stable CODES + Spanish labels live here. The web lib
// (web/lib/coach/athlete-lifecycle.ts) re-exports the type + PAUSE_REASONS so its
// callers get them without importing two paths.

/** Athlete lifecycle state — distinct from the billing subscription status. */
export type AthleteLifecycleStatus = 'activo' | 'pausado' | 'baja';

/** Stable pause-reason codes. Closed set — the DB CHECK + the Zod enum mirror this. */
export const PAUSE_REASONS = ['lesion', 'vacaciones', 'paron', 'otro'] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

/** Who initiated a pause (athlete_pauses.requested_by). */
export type PauseRequestedBy = 'coach' | 'athlete';

/** Lifecycle of an athlete-initiated pause request (athlete_pause_requests.status). */
export type PauseRequestStatus = 'pending' | 'confirmed' | 'declined';

/** ES labels for the pause reasons — reused by every UI so copy stays in one place. */
export const PAUSE_REASON_LABELS: Record<PauseReason, string> = {
  lesion: 'Lesión',
  vacaciones: 'Vacaciones',
  paron: 'Parón',
  otro: 'Otro',
};

/** ES labels for the lifecycle states (pills / status chips). */
export const LIFECYCLE_STATUS_LABELS: Record<AthleteLifecycleStatus, string> = {
  activo: 'Activo',
  pausado: 'Pausado',
  baja: 'Baja',
};

/** Type guard: is `v` a valid pause-reason code? */
export function isPauseReason(v: string): v is PauseReason {
  return (PAUSE_REASONS as readonly string[]).includes(v);
}
