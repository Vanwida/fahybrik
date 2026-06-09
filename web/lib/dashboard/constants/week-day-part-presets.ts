import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import type { BlockFormat } from '@fahybrid/shared/schema/blocks';
import type { WeekDayPartConfig } from '@fahybrid/shared/schema/program-templates';

// Menú "A medida": el coach crea un bloque vacío eligiendo su TIPO. La taxonomía
// tiene dos clusters:
//
//   A) Estructura de sesión — piezas del día (calentamiento, movilidad,
//      accesorios, vuelta a la calma). NO son grupos metodológicos.
//   B) Entrenamiento — los 10 grupos metodológicos de Pablo (tabla
//      methodology_groups, ids 1–10). Cada tipo clasifica el bloque a medida
//      igual que los 97 de la Biblioteca, para que biblioteca/IA lo entiendan.
//
// Cada preset asigna:
//   - `format`: el enum técnico `templates.format` (8 valores) que entienden el
//     editor de timing, el guardado y el MATERIALIZADOR. NO confundir con
//     `blockFormat` (los 10 de la biblioteca).
//   - `methodology_group_id`: 1–10 para los de Entrenamiento; null para
//     Estructura (no son grupos metodológicos).
//   - `blockFormat`: el format real de los 97 bloques (referencia/coherencia),
//     null para Estructura.
//   - `paramFields`: qué campos de parámetro muestra el editor a nivel bloque
//     (Running ≠ Fuerza ≠ Ergómetros). Fuente única consumida por el panel.
//   - `defaultConfig`: valores por defecto sensatos para ese tipo.

/** Campos de parámetro que un tipo de bloque expone en el editor (a nivel bloque). */
export type PartParamField =
  | 'time_cap_seconds'
  | 'emom_interval_seconds'
  | 'rounds'
  | 'work_seconds'
  | 'rest_seconds'
  | 'stations'
  | 'duration_seconds'
  | 'distance_meters'
  | 'pace_sec_per_km'
  | 'hr_zone'
  | 'sets'
  | 'reps'
  | 'load_pct'
  | 'load_kg'
  | 'rpe';

export interface WeekDayPartPreset {
  id: string;
  emoji: string;
  title: string;
  /** Enum técnico que persisten part.format + materializador. Uno de los 8. */
  format: TemplateFormat;
  /** Grupo metodológico de Pablo (1–10), o null para piezas de Estructura. */
  methodology_group_id: number | null;
  /** Format real de la Biblioteca (los 10), referencia. Null para Estructura. */
  blockFormat: BlockFormat | null;
  hint: string;
  /** Campos de parámetro que el editor muestra para este tipo. */
  paramFields: PartParamField[];
  /** Config por defecto al crear el bloque vacío. */
  defaultConfig: WeekDayPartConfig;
}

// HR zone por defecto para Zona 2 / recuperación aeróbica (grupo 5).
const ZONE2_HR = 2;

export const WEEK_DAY_PART_PRESETS: WeekDayPartPreset[] = [
  // ---------- A) Estructura de sesión ----------
  {
    id: 'warmup',
    emoji: '🔥',
    title: 'Calentamiento',
    format: 'tempo',
    methodology_group_id: null,
    blockFormat: null,
    hint: 'Activación general · duración',
    paramFields: ['duration_seconds'],
    defaultConfig: { duration_seconds: 10 * 60 },
  },
  {
    id: 'mobility',
    emoji: '🧘',
    title: 'Movilidad',
    format: 'tempo',
    methodology_group_id: null,
    blockFormat: null,
    hint: 'Prehab · movilidad articular',
    paramFields: ['duration_seconds'],
    defaultConfig: { duration_seconds: 10 * 60 },
  },
  {
    id: 'accessory',
    emoji: '💪',
    title: 'Accesorios',
    format: 'strength_block',
    methodology_group_id: null,
    blockFormat: null,
    hint: 'Complementario · unilateral · series/reps',
    paramFields: ['sets', 'reps', 'rest_seconds'],
    defaultConfig: { sets: 3, reps: 12, rest_seconds: 60 },
  },
  {
    id: 'cooldown',
    emoji: '🌙',
    title: 'Vuelta a la calma',
    format: 'tempo',
    methodology_group_id: null,
    blockFormat: null,
    hint: 'Recuperación activa · duración',
    paramFields: ['duration_seconds'],
    defaultConfig: { duration_seconds: 8 * 60 },
  },

  // ---------- B) Entrenamiento — los 10 grupos metodológicos ----------
  {
    id: 'strength_base',
    emoji: '🏋️',
    title: 'Fuerza Base',
    format: 'strength_block',
    methodology_group_id: 1,
    blockFormat: 'strength_block',
    hint: 'Series · reps · % / kg · RPE',
    paramFields: ['sets', 'reps', 'load_pct', 'load_kg', 'rpe', 'rest_seconds'],
    defaultConfig: { sets: 5, reps: 5, rest_seconds: 180 },
  },
  {
    id: 'power_plyo',
    emoji: '⚡',
    title: 'Fuerza Explosiva / Pliométrica',
    format: 'strength_block',
    methodology_group_id: 2,
    blockFormat: 'plyometric',
    hint: 'Series · reps · carga · descanso',
    paramFields: ['sets', 'reps', 'load_kg', 'rest_seconds'],
    defaultConfig: { sets: 4, reps: 6, rest_seconds: 120 },
  },
  {
    id: 'erg_intervals',
    emoji: '🚣',
    title: 'Series de Ergómetros',
    format: 'intervals',
    methodology_group_id: 3,
    blockFormat: 'erg_intervals',
    hint: 'Row / SkiErg / Bike · trabajo · descanso · zona',
    paramFields: ['rounds', 'duration_seconds', 'distance_meters', 'rest_seconds', 'hr_zone', 'rpe'],
    defaultConfig: { rounds: 6, duration_seconds: 120, rest_seconds: 90 },
  },
  {
    id: 'run_intervals',
    emoji: '🏃',
    title: 'Series de Running',
    format: 'intervals',
    methodology_group_id: 4,
    blockFormat: 'run_intervals',
    hint: 'Distancia · ritmo · zona · intervalos',
    paramFields: ['rounds', 'distance_meters', 'pace_sec_per_km', 'duration_seconds', 'rest_seconds', 'hr_zone'],
    defaultConfig: { rounds: 6, distance_meters: 400, rest_seconds: 90 },
  },
  {
    id: 'zone2',
    emoji: '🫀',
    title: 'Zona 2 / Recuperación',
    format: 'tempo',
    methodology_group_id: 5,
    blockFormat: 'zone2',
    hint: 'Aeróbico continuo · duración · zona Z2',
    paramFields: ['duration_seconds', 'distance_meters', 'hr_zone'],
    defaultConfig: { duration_seconds: 45 * 60, hr_zone: ZONE2_HR },
  },
  {
    id: 'metcon',
    emoji: '🔁',
    title: 'WOD / Metcon',
    format: 'amrap',
    methodology_group_id: 6,
    blockFormat: 'metcon',
    hint: 'AMRAP · EMOM · For Time',
    paramFields: ['time_cap_seconds', 'rounds', 'emom_interval_seconds'],
    defaultConfig: { time_cap_seconds: 12 * 60 },
  },
  {
    id: 'race_sim',
    emoji: '🎯',
    title: 'Simulación de Carrera',
    format: 'hyrox_sim',
    methodology_group_id: 7,
    blockFormat: 'race_sim',
    hint: 'HYROX / DEKA · estaciones · distancia · cap',
    paramFields: ['stations', 'distance_meters', 'time_cap_seconds'],
    defaultConfig: { stations: 8, time_cap_seconds: 60 * 60 },
  },
  {
    id: 'core_mobility',
    emoji: '🧱',
    title: 'Core / Movilidad / Preventivos',
    format: 'strength_block',
    methodology_group_id: 8,
    blockFormat: 'core_mobility',
    hint: 'Core · prevención · reps / duración',
    paramFields: ['sets', 'reps', 'duration_seconds', 'rest_seconds'],
    defaultConfig: { sets: 3, reps: 15, rest_seconds: 45 },
  },
  {
    id: 'functional_circuit',
    emoji: '🔂',
    title: 'Circuito Funcional',
    format: 'circuit',
    methodology_group_id: 9,
    blockFormat: 'functional_circuit',
    hint: 'Fuerza-resistencia · rondas · estaciones',
    paramFields: ['rounds', 'stations', 'rest_seconds'],
    defaultConfig: { rounds: 4, stations: 5, rest_seconds: 60 },
  },
  {
    id: 'tapering',
    emoji: '🪶',
    title: 'Tapering / Activación',
    format: 'tempo',
    methodology_group_id: 10,
    blockFormat: 'tapering',
    hint: 'Volumen ligero pre-carrera · duración / reps',
    paramFields: ['duration_seconds', 'sets', 'reps'],
    defaultConfig: { duration_seconds: 20 * 60 },
  },
];

// Agrupación visual del menú "A medida": Estructura de sesión + Entrenamiento
// (los 10 grupos metodológicos). Fuente única — la usa AddBlockMenu.
const PART_GROUP_IDS: { label: string; ids: string[] }[] = [
  { label: 'Estructura de sesión', ids: ['warmup', 'mobility', 'accessory', 'cooldown'] },
  {
    label: 'Entrenamiento · grupos de Pablo',
    ids: [
      'strength_base',
      'power_plyo',
      'erg_intervals',
      'run_intervals',
      'zone2',
      'metcon',
      'race_sim',
      'core_mobility',
      'functional_circuit',
      'tapering',
    ],
  },
];

export interface GroupedPresets {
  label: string;
  presets: WeekDayPartPreset[];
}

export const GROUPED_PART_PRESETS: GroupedPresets[] = PART_GROUP_IDS.map((group) => ({
  label: group.label,
  presets: group.ids
    .map((id) => WEEK_DAY_PART_PRESETS.find((p) => p.id === id))
    .filter((p): p is WeekDayPartPreset => Boolean(p)),
}));

// Alias retro-compat de ids de preset previos a la taxonomía de 2 clusters, para
// no romper callers existentes (p.ej. Pablo IA usa 'strength' como bloque
// principal). Mapea id antiguo → id actual.
const LEGACY_PRESET_ID_ALIASES: Record<string, string> = {
  strength: 'strength_base',
  hyrox: 'race_sim',
  intervals: 'run_intervals',
  amrap: 'metcon',
  emom: 'metcon',
  for_time: 'metcon',
  circuit: 'functional_circuit',
};

export function presetById(id: string): WeekDayPartPreset | undefined {
  const resolved = LEGACY_PRESET_ID_ALIASES[id] ?? id;
  return WEEK_DAY_PART_PRESETS.find((p) => p.id === resolved);
}

/**
 * Campos de parámetro a mostrar para un bloque a medida según su grupo
 * metodológico (1–10). Devuelve null si el grupo no es de Entrenamiento (las
 * piezas de Estructura no tienen grupo) — el editor cae al modo por `format`.
 */
export function paramFieldsForGroup(
  methodology_group_id: number | null | undefined,
): PartParamField[] | null {
  if (methodology_group_id == null) return null;
  const hit = WEEK_DAY_PART_PRESETS.find(
    (p) => p.methodology_group_id === methodology_group_id,
  );
  return hit ? hit.paramFields : null;
}

/**
 * Config por defecto para un part. Para un bloque a medida creado desde el menú
 * usar el `defaultConfig` del preset (sabe su grupo); este helper queda como
 * fallback por `format` para callers que solo tienen el format (biblioteca).
 */
export function defaultConfigForPartFormat(format: TemplateFormat): WeekDayPartConfig {
  switch (format) {
    case 'emom':
      return { emom_interval_seconds: 60, time_cap_seconds: 12 * 60, rounds: 12 };
    case 'amrap':
      return { time_cap_seconds: 10 * 60 };
    case 'for_time':
      return { time_cap_seconds: 20 * 60 };
    case 'intervals':
      return { rounds: 6, work_seconds: 120, rest_seconds: 90 };
    case 'circuit':
      return { rounds: 4, stations: 5 };
    case 'strength_block':
      return { rounds: 4, rest_seconds: 120 };
    case 'hyrox_sim':
      return { rounds: 1, stations: 8 };
    default:
      return {};
  }
}

export function formatLabel(format: TemplateFormat): string {
  const hit = WEEK_DAY_PART_PRESETS.find((p) => p.format === format);
  if (hit) return hit.title;
  return format.replace(/_/g, ' ');
}
