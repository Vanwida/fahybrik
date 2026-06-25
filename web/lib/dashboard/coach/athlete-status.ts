// Read de estado del atleta: UNA palabra derivada de cumplimiento (7d) +
// readiness. ÚNICA fuente de verdad compartida entre el HUB de la ficha
// (AthleteShellHeader) y el ROSTER (/atletas) — así la palabra de estado y su
// color coinciden exactamente en ambas superficies.
//
// Umbrales (spec §B3): cualquier señal en rango BAJO → "Necesita atención"
// (danger); ambas en rango ALTO → "En ritmo" (success); el resto (alguna media,
// o una alta + otra ausente) → "Seguir de cerca" (warning). Sin datos
// suficientes → estado desconocido (muted, sin falsa alarma).

/** Severidad del estado, en orden de urgencia para el triage del roster. */
export type AthleteStateLevel = 'attention' | 'watch' | 'ok' | 'unknown';

export type AthleteStateRead = {
  level: AthleteStateLevel;
  word: string;
  /** Variable de color SEMÁNTICO (no acento). */
  tone: string;
};

export const ATHLETE_STATE_TONE: Record<AthleteStateLevel, string> = {
  attention: 'var(--danger)',
  watch: 'var(--status-warning)',
  ok: 'var(--status-success)',
  unknown: 'var(--text-muted)',
};

const ATHLETE_STATE_WORD: Record<AthleteStateLevel, string> = {
  attention: 'Necesita atención',
  watch: 'Seguir de cerca',
  ok: 'En ritmo',
  unknown: 'Sin datos',
};

// Umbrales de cumplimiento (%) y readiness (0-100). Idénticos al Hub.
export const COMPLIANCE_OK = 80;
export const COMPLIANCE_LOW = 50;
export const READINESS_OK = 67;
export const READINESS_LOW = 34;

/**
 * Menor (= más urgente) es primero al ordenar el roster por triage:
 * attention → watch → ok → unknown.
 */
export const ATHLETE_STATE_SORT_RANK: Record<AthleteStateLevel, number> = {
  attention: 0,
  watch: 1,
  ok: 2,
  unknown: 3,
};

/** Deriva la palabra de estado + color a partir de cumplimiento + readiness. */
export function computeAthleteState(
  compliance: number | null,
  readiness: number | null,
): AthleteStateRead {
  let level: AthleteStateLevel;

  if (compliance == null && readiness == null) {
    level = 'unknown';
  } else if (
    (compliance != null && compliance < COMPLIANCE_LOW) ||
    (readiness != null && readiness < READINESS_LOW)
  ) {
    // Cualquier señal en rango BAJO manda → necesita atención.
    level = 'attention';
  } else if (
    compliance != null &&
    compliance >= COMPLIANCE_OK &&
    readiness != null &&
    readiness >= READINESS_OK
  ) {
    // Ambas en rango ALTO → en ritmo.
    level = 'ok';
  } else {
    // El resto (alguna media, o una alta + otra ausente) → seguir de cerca.
    level = 'watch';
  }

  return { level, word: ATHLETE_STATE_WORD[level], tone: ATHLETE_STATE_TONE[level] };
}
