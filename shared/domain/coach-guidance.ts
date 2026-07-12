// @fahybrid/shared/domain/coach-guidance — the coach's editable "consejos".
//
// A coach attaches a short, ordered list of tactical tips to a CONTEXT (the
// doubles race board, the doubles simulation). The list is coach-owned and fully
// editable from the dashboard; until the coach writes their own, every coach
// sees the SYSTEM DEFAULTS below.
//
// AGNOSTIC BY CONTRACT: these defaults name no brand, no coach, no athlete — the
// software ships them for any coach on any account. The business's real voice
// lives in the coach's edited rows, never here. (Same rule as every other system
// default in the domain layer.)

/** The surfaces a coach can attach tips to. Persisted as a text CHECK in the DB
 *  (migration 0123 coach_guidance.context) and validated on write. */
export const COACH_GUIDANCE_CONTEXTS = ['race_doubles', 'sim_doubles'] as const;
export type CoachGuidanceContext = (typeof COACH_GUIDANCE_CONTEXTS)[number];

/** A coach may author between 1 and this many tips per context. */
export const COACH_GUIDANCE_MAX_ITEMS = 8;
/** Each tip is trimmed and capped at this many characters. */
export const COACH_GUIDANCE_MAX_ITEM_CHARS = 200;

export function isCoachGuidanceContext(v: string): v is CoachGuidanceContext {
  return (COACH_GUIDANCE_CONTEXTS as readonly string[]).includes(v);
}

/**
 * The system defaults, per context. Served whenever the coach has authored no
 * row for that context. Generic hybrid/HYROX doubles tactics — no names, no
 * numbers tied to any real person or event.
 */
export const DEFAULT_COACH_TIPS: Record<CoachGuidanceContext, readonly string[]> = {
  race_doubles: [
    'Runs 1–2 por debajo del ritmo objetivo: en dobles el arranque rápido se paga doble.',
    'El que descansa, guía: canta las repeticiones y prepara el relevo antes de llegar a la estación.',
    'Wall balls en tandas cortas con señal de cambio pactada antes de salir.',
    'Repasad el reparto la víspera y no lo cambiéis el día de la carrera.',
  ],
  sim_doubles: [
    'La sim es el ensayo del reparto: probad hoy el que llevaréis en la carrera.',
    'Cronometrad también los relevos — ahí se esconde el tiempo fácil.',
    'Si un tramo se os va, apuntadlo tal cual: la estrategia se corrige con datos, no con sensaciones.',
  ],
};

/** The default tips for a context, as a mutable copy (callers may render/emit). */
export function defaultCoachTips(context: CoachGuidanceContext): string[] {
  return [...DEFAULT_COACH_TIPS[context]];
}
