// Resumen legible de los parámetros de un `block_exercise` para la BIBLIOTECA.
// Única fuente de verdad del formato mostrado (ej. "5×10/10/8/8/6 @65-80%",
// "5×180s · RPE8 · rest45s"). Opera sobre el shape canónico de params_json
// (migration 0038): sets, reps, load_kg, load_pct, load_pct_range,
// distance_meters, duration_seconds, hr_zone, rest_seconds, rounds, rpe.

type Params = Record<string, unknown>;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}min` : `${m}:${String(rem).padStart(2, '0')}`;
}

function formatDistance(m: number): string {
  return m >= 1000 && m % 1000 === 0 ? `${m / 1000}km` : `${m}m`;
}

/**
 * Resumen de una serie/intervalo. `reps_scheme` (esquema por-serie verbatim de
 * Pablo, "10/10/8/8/6") tiene prioridad sobre el escalar `reps` cuando existe.
 */
export function formatBlockExerciseParams(
  params: Params,
  reps_scheme?: string | null,
): string {
  const parts: string[] = [];

  // Volumen: sets × (reps_scheme | reps), o rounds × tiempo/distancia.
  const sets = num(params.sets);
  const rounds = num(params.rounds);
  const reps = num(params.reps);
  const scheme = str(reps_scheme);
  const count = sets ?? rounds;

  if (count != null) {
    if (scheme) parts.push(`${count}×${scheme}`);
    else if (reps != null) parts.push(`${count}×${reps}`);
    else parts.push(`${count}×`);
  } else if (scheme) {
    parts.push(scheme);
  } else if (reps != null) {
    parts.push(`${reps} reps`);
  }

  // Duración / distancia del intervalo.
  const dur = num(params.duration_seconds);
  if (dur != null) parts.push(formatSeconds(dur));
  const dist = num(params.distance_meters);
  if (dist != null) parts.push(formatDistance(dist));

  // Carga: rango de % tiene prioridad sobre el % escalar y los kg.
  const pctRange = str(params.load_pct_range);
  const pct = num(params.load_pct);
  const kg = num(params.load_kg);
  if (pctRange) parts.push(`@${pctRange}%`);
  else if (pct != null) parts.push(`@${pct}%`);
  if (kg != null) parts.push(`${kg}kg`);

  // Intensidad / zona / descanso.
  const rpe = num(params.rpe);
  if (rpe != null) parts.push(`RPE${rpe}`);
  const hr = num(params.hr_zone);
  if (hr != null) parts.push(`Z${hr}`);
  const rest = num(params.rest_seconds);
  if (rest != null) parts.push(`rest ${formatSeconds(rest)}`);

  return parts.join(' · ');
}
