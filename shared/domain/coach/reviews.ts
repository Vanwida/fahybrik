// Revisiones 1:1 recurrentes coach-atleta (#21) — SINGLE source of truth para el
// vocabulario de dominio compartido por web (dashboard del coach + señal de atención)
// y la app iOS (atleta): la cadencia, el tipo de cita, el kind de notificación y el
// mapeo cadencia → umbral de días. Framework-agnostic: solo códigos estables + labels
// ES + funciones puras. Espeja los CHECK de la migración 0107
// (athletes.review_cadence, appointments.kind).

/** Cadencia de revisión 1:1 que el coach fija por atleta. Cerrado — lo espejan el
 *  CHECK de la DB y el Zod. `ninguna` = opt-out (no dispara señal). */
export const REVIEW_CADENCES = ['ninguna', 'mensual', 'trimestral'] as const;
export type ReviewCadence = (typeof REVIEW_CADENCES)[number];

/** Cadencias que SÍ activan la revisión periódica (todas menos `ninguna`). */
export type ActiveReviewCadence = Exclude<ReviewCadence, 'ninguna'>;

/** Labels ES para los selectores de cadencia (una sola fuente de copy). */
export const REVIEW_CADENCE_LABELS: Record<ReviewCadence, string> = {
  ninguna: 'Sin revisiones',
  mensual: 'Mensual',
  trimestral: 'Trimestral',
};

/** Type guard: ¿es `v` un código de cadencia válido? */
export function isReviewCadence(v: string): v is ReviewCadence {
  return (REVIEW_CADENCES as readonly string[]).includes(v);
}

/** Tipo de cita (appointments.kind). intro = captación de un lead, revision = 1:1 con atleta. */
export const APPOINTMENT_KINDS = ['intro', 'revision'] as const;
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number];

/** El kind de una cita de revisión 1:1 (#21). */
export const REVIEW_APPOINTMENT_KIND: AppointmentKind = 'revision';

/**
 * Discriminador `kind` del payload de la notificación in-app "Pablo te propone una
 * revisión". Sigue el patrón partner_left / subscription_cancelled / payment_failed:
 * type='system' + kind en payload_json (evita una migración del enum notification_type
 * para una notificación de bajo volumen). iOS lee este kind para renderizar la copy.
 */
export const REVIEW_PROPOSED_NOTIFICATION_KIND = 'review_proposed' as const;

/**
 * Días de umbral para que una revisión se considere vencida, según la cadencia. Los
 * NÚMEROS viven en signal-config.ts (cero magic numbers) y se pasan aquí; esta función
 * solo mapea la cadencia → cuál de los dos umbrales aplica. La usan TANTO el evaluador
 * puro (que recibe los thresholds inyectados) COMO getAthleteReviewState (web), así el
 * umbral efectivo se decide en un único sitio. `ninguna` → null (nunca vence).
 */
export function reviewThresholdDays(
  cadence: ReviewCadence,
  thresholds: { mensual: number; trimestral: number },
): number | null {
  switch (cadence) {
    case 'mensual':
      return thresholds.mensual;
    case 'trimestral':
      return thresholds.trimestral;
    default:
      return null; // 'ninguna'
  }
}
