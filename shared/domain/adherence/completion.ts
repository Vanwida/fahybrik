// Completion adherence — the share of an athlete's SCHEDULED sessions they
// actually completed over a trailing window. This is distinct from the
// prescribed-vs-real band (./bands): that judges HOW WELL a single session hit
// its target; this judges HOW MANY of the due sessions got done.
//
// SINGLE SOURCE OF TRUTH for the "adherencia" number. Coaches (TrueCoach /
// TrainingPeaks / Trainerize) read adherencia as a ROLLING multi-week aggregate,
// not a single current week — a quiet week shouldn't read 0% forever, and the
// number must agree everywhere it surfaces (roster · /hoy · mensajes ·
// atleta-detalle). Both the batch roster loader and the single-athlete resumen
// import this window + formula so they can't drift apart.

/** Trailing window, in days, over which completion adherence is measured. */
export const ADHERENCE_WINDOW_DAYS = 30;

/**
 * completed / scheduled over the window → an integer 0–100, or null when nothing
 * was due in the window (no scheduled work ⇒ adherence is undefined, not 0%).
 */
export function adherencePct(scheduled: number, completed: number): number | null {
  if (scheduled <= 0) return null;
  return Math.round((completed / scheduled) * 100);
}
