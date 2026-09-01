/**
 * Velocidad de barra — helpers puros (fase 3 del plan de sensor).
 *
 * El RIR tecleado NO se sustituye. La pérdida de velocidad se calcula como
 * cociente (primera → última) y se declara; la validación real va por banda
 * de carga en el reloj, no aquí.
 */

export type VelocitySet = {
  mean_velocity_first_m_s: number | null;
  mean_velocity_last_m_s: number | null;
  velocity_loss_pct: number | null;
  velocity_confidence: number | null;
};

/** Pérdida en % a partir de primera y última velocidad media. */
export function velocityLossPct(firstMps: number, lastMps: number): number {
  if (!(firstMps > 0) || !(lastMps >= 0)) return 0;
  return Math.max(0, ((firstMps - lastMps) / firstMps) * 100);
}

/**
 * ¿Se enseña al atleta? Solo si hay confianza suficiente y el coach no ha
 * puesto un corte más estricto.
 */
export function isVelocityDisplayable(
  set: VelocitySet,
  minConfidence = 0.5,
): boolean {
  if (set.mean_velocity_first_m_s == null) return false;
  if (set.mean_velocity_last_m_s == null) return false;
  if (set.velocity_confidence == null) return false;
  return set.velocity_confidence >= minConfidence;
}

/** ¿La serie cruza el corte de pérdida del coach? */
export function hitsVelocityLossCutoff(
  lossPct: number | null | undefined,
  cutoffPct: number,
): boolean {
  if (lossPct == null) return false;
  return lossPct >= cutoffPct;
}
