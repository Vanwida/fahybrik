// «Respuestas fuera de rango» — el aviso del alta para lo que el atleta contestó y
// no se pudo guardar tal cual (auditoría de la app del atleta, F-01).
//
// El envío del cuestionario ya no se rechaza entero por una respuesta: la que no
// cabe se recorta o se descarta, y queda anotada en
// `athletes.intake_notes_json.onboarding_out_of_range` con lo que llegó
// (`web/lib/athlete/onboarding-snapshot.ts`). Aquí se convierte en un aviso que el
// coach lee (y marca «Visto») antes de asignar: sabe qué falta y por qué, en vez
// de ver un hueco sin explicación.

import type { IntakeWarning } from './intake';

interface StoredIssue {
  field: string;
  value: string | number | boolean | null;
  action: 'descartada' | 'recortada';
}

/** Cómo se llama cada respuesta en el cuestionario del atleta. */
const FIELD_LABELS: Record<string, string> = {
  full_name: 'Nombre',
  date_of_birth: 'Fecha de nacimiento',
  height_cm: 'Altura',
  weight_kg: 'Peso',
  goal_other_text: 'Otro objetivo',
  sleep_quality: 'Calidad del sueño',
  stress_level: 'Nivel de estrés',
  commitment_level: 'Compromiso',
  movement_limitations: 'Limitaciones de movimiento',
  available_from: 'Disponible desde',
  available_to: 'Disponible hasta',
  session_minutes: 'Duración de la sesión',
  facility_other_text: 'Otra instalación',
  watch_model: 'Modelo de reloj',
  goal_short: 'Objetivo a corto plazo',
  goal_mid: 'Objetivo a medio plazo',
  goal_long: 'Objetivo a largo plazo',
  biggest_obstacle: 'Mayor obstáculo',
  pct_depends_on_me: '¿Cuánto depende de ti?',
  coach_role: 'Qué espera de su coach',
  one_rm_back_squat_kg: 'Back squat (1RM)',
  one_rm_deadlift_kg: 'Peso muerto (1RM)',
  one_rm_bench_press_kg: 'Press banca (1RM)',
  one_rm_ohp_kg: 'Press militar (1RM)',
  one_rm_clean_kg: 'Cargada (1RM)',
  one_rm_snatch_kg: 'Arrancada (1RM)',
  strict_pull_ups_max: 'Dominadas (máx.)',
  push_ups_per_minute: 'Flexiones en 1 min',
  time_5k_seconds: '5K',
  time_10k_seconds: '10K',
  time_half_seconds: 'Media maratón',
  time_marathon_seconds: 'Maratón',
  time_2k_row_seconds: '2K remo',
  time_1k_row_seconds: '1K remo',
  time_1k_ski_seconds: '1K SkiErg',
  lthr_bpm: 'Pulso de umbral',
  max_hr_bpm: 'FC máxima',
  ftp_watts: 'Potencia de umbral',
  threshold_pace_seconds_per_km: 'Ritmo de umbral',
  time_1_mile_seconds: '1 milla',
  hyrox_best_time_seconds: 'Mejor tiempo HYROX',
  training_years: 'Años entrenando',
  training_level: 'Nivel',
  hours_per_week: 'Horas por semana',
  primary_discipline: 'Disciplina principal',
  days_per_week: 'Días por semana',
};

function labelOf(field: string): string {
  const direct = FIELD_LABELS[field];
  if (direct) return direct;
  if (field.startsWith('races[')) {
    if (field.endsWith('.goal_time_seconds')) return 'Tiempo objetivo de la carrera';
    if (field.endsWith('.name')) return 'Nombre de la carrera';
    if (field.endsWith('.location')) return 'Lugar de la carrera';
    return 'Carrera';
  }
  if (field.startsWith('injuries[')) return 'Lesión';
  if (field.startsWith('availability.') || field.startsWith('preferred_week.')) return 'Disponibilidad';
  if (field.startsWith('equipment')) return 'Material';
  return field;
}

function clock(total: number): string {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

function shown(issue: StoredIssue): string {
  const { field, value } = issue;
  if (value == null) return labelOf(field);
  const text =
    typeof value === 'number' && field.endsWith('_seconds') && Number.isFinite(value)
      ? clock(value)
      : String(value);
  // Un texto recortado se nombra, no se repite: el coach lo lee entero en las respuestas.
  if (issue.action === 'recortada') return labelOf(field);
  return `${labelOf(field)} (${text})`;
}

function parseIssues(notes: unknown): StoredIssue[] {
  if (!notes || typeof notes !== 'object') return [];
  const list = (notes as Record<string, unknown>).onboarding_out_of_range;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (i): i is StoredIssue =>
      typeof i === 'object' &&
      i !== null &&
      typeof (i as StoredIssue).field === 'string' &&
      ((i as StoredIssue).action === 'descartada' || (i as StoredIssue).action === 'recortada'),
  );
}

/** El aviso del alta, o null si todas las respuestas cupieron. */
export function outOfRangeWarning(intakeNotes: unknown): IntakeWarning | null {
  const issues = parseIssues(intakeNotes);
  if (issues.length === 0) return null;
  const dropped = issues.filter((i) => i.action === 'descartada').map(shown);
  const clipped = [...new Set(issues.filter((i) => i.action === 'recortada').map(shown))];
  const parts = [
    dropped.length > 0 ? `No se guardaron: ${dropped.join(' · ')}` : null,
    clipped.length > 0 ? `Se guardaron recortadas: ${clipped.join(' · ')}` : null,
  ].filter((p): p is string => p != null);
  return {
    kind: 'answers_out_of_range',
    severity: 'warning',
    label: issues.length === 1 ? 'Una respuesta fuera de rango' : `${issues.length} respuestas fuera de rango`,
    detail: `${parts.join('. ')}. Pregúntaselo si lo necesitas.`,
  };
}
