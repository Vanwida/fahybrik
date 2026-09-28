// EL TONELAJE DE FUERZA — cuántos kilos movió el atleta: la suma de carga × reps
// de las series que HIZO.
//
// Una sola regla para todos los lectores (el detalle de una sesión que ven el
// atleta y el coach, el reparto de la semana del deep dive y la tarjeta de
// volumen de analíticas). Antes cada uno la escribía a su manera, y el detalle de
// la sesión ni siquiera leía las series: servía el peso de la última y reps nulas,
// y el volumen salía 0 para un 5×100 · 5×110 · 3×115 · 3×120.
//
//   · Cuenta una serie hecha (`done`) o escalada (`scaled`: se hizo, más ligera).
//     Una serie saltada (`skipped`) no suma nunca.
//   · Solo suma lo que tiene carga (> 0 kg) y reps: el peso corporal suma reps,
//     no kilos.
//   · Sin ninguna serie con carga, el volumen es `null` («no aplica / no se sabe»),
//     nunca un 0 inventado.
//
// El registro sin series (una línea anotada con un solo número de reps y carga,
// anterior al registro serie a serie de la 0088) se lee como UNA serie: es lo que
// el atleta dejó escrito, y es lo que ya sumaba el reparto del deep dive.

export type SetExecutionStatus = 'done' | 'scaled' | 'skipped';

export interface VolumeSet {
  reps: number | null;
  kg: number | null;
  status?: SetExecutionStatus | string | null;
}

/** Kilos que suma UNA serie; 0 si no cuenta (saltada, sin carga o sin reps). */
export function setVolumeKg(s: VolumeSet): number {
  if (s.status === 'skipped') return 0;
  if (s.reps == null || s.reps <= 0 || s.kg == null || s.kg <= 0) return 0;
  return s.reps * s.kg;
}

/** Σ carga × reps de las series que cuentan; null si ninguna tiene carga. */
export function setsVolumeKg(sets: ReadonlyArray<VolumeSet>): number | null {
  let total = 0;
  let any = false;
  for (const s of sets) {
    const v = setVolumeKg(s);
    if (v > 0) {
      total += v;
      any = true;
    }
  }
  return any ? Math.round(total * 100) / 100 : null;
}

/**
 * El volumen de un TRAMO: sus series si las registró; si no, su línea única
 * (reps × carga del propio tramo). Null cuando no hay carga que sumar.
 */
export function segmentVolumeKg(seg: {
  sets: ReadonlyArray<VolumeSet>;
  reps_completed: number | null;
  weight_used_kg: number | null;
}): number | null {
  if (seg.sets.length > 0) return setsVolumeKg(seg.sets);
  return setsVolumeKg([{ reps: seg.reps_completed, kg: seg.weight_used_kg, status: 'done' }]);
}
