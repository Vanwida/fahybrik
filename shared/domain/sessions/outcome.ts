// Outcome of a 1:1 sales call (#14). Structured (not free text) so the funnel metrics
// (#20) and nurturing (#10) can read it. Only meaningful for a LEAD session; an athlete
// 1:1 leaves it null. Single source of truth — DB enum `session_report_outcome`, this
// tuple, and the Zod enum all derive from here.

// NOTE: 'quiere_empezar' is INTENT on the call — NOT the lead status `convertido`, which
// is earned when the athlete claims the account. Metrics (#20) measure them separately.
export const SESSION_OUTCOMES = [
  'quiere_empezar',
  'pensandoselo',
  'no_interesado',
  'seguimiento',
  'no_asistio',
] as const;

export type SessionOutcome = (typeof SESSION_OUTCOMES)[number];

export const SESSION_OUTCOME_LABEL: Record<SessionOutcome, string> = {
  quiere_empezar: 'Quiere empezar',
  pensandoselo: 'Se lo piensa',
  no_interesado: 'No le interesa',
  seguimiento: 'Requiere seguimiento',
  no_asistio: 'No asistió',
};

/** UI pill tone (v2 tone vocabulary). */
export const SESSION_OUTCOME_TONE: Record<SessionOutcome, 'ok' | 'info' | 'warn' | 'neutral'> = {
  quiere_empezar: 'ok',
  pensandoselo: 'info',
  seguimiento: 'warn',
  no_interesado: 'neutral',
  no_asistio: 'neutral',
};

export function isSessionOutcome(v: unknown): v is SessionOutcome {
  return typeof v === 'string' && (SESSION_OUTCOMES as readonly string[]).includes(v);
}
