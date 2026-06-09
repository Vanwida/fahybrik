import type { WeekDayPart } from '@fahybrid/shared/schema/program-templates';

// Helpers de presentación del panel de detalle de un bloque (Fase 3). Aíslan la
// lógica de derivar la prescripción verbatim y el resumen compacto de params
// del componente, para mantener el panel declarativo y testeable.

/**
 * Prescripción VERBATIM de Pablo de un bloque de biblioteca: el cuerpo del
 * `coach_note` ANTES del separador de modificadores ("\n\n— "). Espeja el
 * contrato de `block-to-part` (la nota del atleta vive en `athlete_note`, no en
 * `coach_note`). Para un bloque a medida devuelve cadena vacía (no hay verbatim).
 */
export function blockPrescription(part: Pick<WeekDayPart, 'coach_note' | 'source_block_id'>): string {
  if (part.source_block_id == null) return '';
  const note = part.coach_note ?? '';
  const modSep = note.indexOf('\n\n— ');
  return (modSep >= 0 ? note.slice(0, modSep) : note).trim();
}

const REST_FMT = (s: number) => (s < 60 ? `${s}s` : Number.isInteger(s / 60) ? `${s / 60}′` : `${(s / 60).toFixed(1)}′`);

function dur(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec === 0 ? `${m}′` : `${m}′${sec.toString().padStart(2, '0')}`;
}

function pace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}/km`;
}

function num(v: number | string | undefined): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Resumen denso de una línea de los params de un ejercicio para la fila
 * colapsada (p.ej. "4×8 · 80% · RPE 8 · 90s"). Orden de prioridad pensado para
 * que el coach vea lo importante de un vistazo sin abrir la fila.
 */
export function exerciseRowSummary(
  params: Record<string, number | string | undefined>,
): string {
  const parts: string[] = [];

  const sets = num(params.sets);
  const reps = num(params.reps);
  const scheme = typeof params.reps_scheme === 'string' ? params.reps_scheme : null;
  if (scheme) parts.push(scheme);
  else if (sets != null && reps != null) parts.push(`${sets}×${reps}`);
  else if (reps != null) parts.push(`${reps} reps`);
  else if (sets != null) parts.push(`${sets} sets`);

  const loadKg = num(params.load_kg);
  const loadPct = num(params.load_pct);
  if (loadKg != null) parts.push(`${loadKg} kg`);
  else if (loadPct != null) parts.push(`${loadPct}%`);

  const distM = num(params.distance_meters);
  const distKm = num(params.distance_km);
  if (distKm != null) parts.push(Number.isInteger(distKm) ? `${distKm} km` : `${distKm.toFixed(1)} km`);
  else if (distM != null) parts.push(distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${distM} m`);

  const cals = num(params.calories);
  if (cals != null) parts.push(`${cals} cal`);

  const durationS = num(params.duration_seconds);
  if (durationS != null && durationS > 0) parts.push(dur(durationS));

  const hr = num(params.hr_zone);
  if (hr != null) parts.push(`Z${hr}`);

  const paceS = num(params.pace_sec_per_km);
  if (paceS != null && paceS > 0) parts.push(pace(paceS));

  const rpe = num(params.rpe);
  if (rpe != null) parts.push(`RPE ${rpe}`);

  const rest = num(params.rest_seconds);
  if (rest != null && rest > 0) parts.push(REST_FMT(rest));

  return parts.join(' · ');
}
