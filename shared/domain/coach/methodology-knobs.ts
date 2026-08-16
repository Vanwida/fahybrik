// @fahybrid/shared/domain/coach/methodology-knobs — los 5 mandos de
// metodología que edita el coach (`docs/metodologia-coach.html`).
//
// HARD RULE Nº0: mecanismo vs método. Cómo se calcula un TSS o una zona es
// mecanismo (código). Cuántas zonas tiene, qué tests usa, qué hace al acabar
// un bloque, cuándo baja el día y con qué tono habla — eso lo haría distinto
// otro entrenador competente, así que nace como DATO con un valor por defecto.
//
// Coach vacío = estos defectos, NUNCA la fila de otro club. La batería de
// calibración de semana 1 (`test-battery.ts`) es un atajo de producto para
// quien ya tiene tests; no es el default de un coach que no ha tocado nada.
//
// Defectos AQUÍ, nunca como `default` de columna (mismo patrón que
// signal-thresholds / import-defaults). `coach_methodology` (0048) horneó 37
// columnas en el DDL y quedó muerta: no se rellena.
//
// Puro y sin base de datos.

import { HR_ZONES } from '../methodology/hr-zones';

/** Ancla de FC — mismos literales que `coach_methodology.hr_anchor` (0048). */
export const HR_ANCHORS = ['lthr', 'max_hr', 'tanaka'] as const;
export type HrAnchor = (typeof HR_ANCHORS)[number];

/** Ancla de ritmo de carrera — mismos literales que `run_pace_anchor` (0048). */
export const RUN_PACE_ANCHORS = ['5k', '10k', '1mile', 'threshold'] as const;
export type RunPaceAnchor = (typeof RUN_PACE_ANCHORS)[number];

/** Fin de bloque: el mismo trío que `program_sequences.end_policy`. */
export const BLOCK_END_POLICIES = ['repeat', 'level_up', 'stop'] as const;
export type BlockEndPolicy = (typeof BLOCK_END_POLICIES)[number];

/** Registro de voz. Neutro = sin nombre de coach ni escuela. */
export const TONE_REGISTERS = ['neutral', 'directo', 'cercano', 'tecnico'] as const;
export type ToneRegister = (typeof TONE_REGISTERS)[number];

/** Tratamiento — mismos literales que `coach_methodology.address_form`. */
export const ADDRESS_FORMS = ['tu', 'usted'] as const;
export type AddressForm = (typeof ADDRESS_FORMS)[number];

export const HR_ZONE_COUNT_MIN = 3;
export const HR_ZONE_COUNT_MAX = 7;
export const SLEEP_MIN_HOURS_MIN = 3;
export const SLEEP_MIN_HOURS_MAX = 12;
export const HRV_DROP_PCT_MIN = -50;
export const HRV_DROP_PCT_MAX = 0;
export const LOAD_TSB_FLOOR_MIN = -50;
export const LOAD_TSB_FLOOR_MAX = 0;
export const DEFAULT_TEST_SLUG_MAX = 60;
export const DEFAULT_TEST_SLUGS_MAX = 20;

/**
 * Los 5 mandos, anidados como los lee el formulario y como viajan por el
 * cable. Guardar reemplaza el conjunto entero: no hay parche por mando.
 */
export interface CoachMethodologyKnobs {
  /** Zonas: cuántas de FC y contra qué ancla de pulso / ritmo. */
  zones: {
    hr_zone_count: number;
    hr_anchor: HrAnchor;
    run_pace_anchor: RunPaceAnchor;
  };
  /** Tests por defecto del club. Vacío = ninguna batería de marca. */
  default_tests: string[];
  /** Al acabar el bloque: repetir / subir de nivel / parar. */
  block_end_policy: BlockEndPolicy;
  /** Umbrales para bajar el día: sueño, HRV vs basal, frescura (TSB). */
  day_down: {
    sleep_min_hours: number;
    hrv_drop_pct: number;
    load_tsb_floor: number;
  };
  /** Cómo suena el producto al atleta. */
  tone: {
    register: ToneRegister;
    address_form: AddressForm;
  };
}

/**
 * Defectos del mecanismo. Un coach que no ha escrito fila se comporta igual
 * que el producto hoy: 5 zonas de FC ancladas en umbral, ritmo de carrera
 * calibrado por el 5K, sin batería impuesta, el bloque no avanza solo, y el
 * tono no nombra a nadie.
 *
 *   - hr_zone_count = `HR_ZONES.length` (el modelo de pulso no distingue
 *     VO₂max de sprint; no es una escuela).
 *   - hr_anchor = lthr (decisión de producto 28-jul: el umbral gana).
 *   - run_pace_anchor = 5k (el ancla que el motor de zonas de ritmo ya usa).
 *   - default_tests = [] (no se copia la batería de otro club).
 *   - block_end_policy = stop (no asume ciclo ni subida).
 *   - sleep_min_hours = 6 (suelo para recortar el día; el objetivo de
 *     puntuación sigue en 8 h, otro número, otro sitio).
 *   - hrv_drop_pct = −10 (10 % bajo la basal: umbral genérico de modificar,
 *     no el de un club).
 *   - load_tsb_floor = −8 (el aviso de frescura que el producto ya usa como
 *     defecto de sistema en running-thresholds).
 *   - tone = neutral + tú (idioma del producto; sin nombre).
 */
export const DEFAULT_COACH_METHODOLOGY_KNOBS: CoachMethodologyKnobs = {
  zones: {
    hr_zone_count: HR_ZONES.length,
    hr_anchor: 'lthr',
    run_pace_anchor: '5k',
  },
  default_tests: [],
  block_end_policy: 'stop',
  day_down: {
    sleep_min_hours: 6,
    hrv_drop_pct: -10,
    load_tsb_floor: -8,
  },
  tone: {
    register: 'neutral',
    address_form: 'tu',
  },
};

/** Copia fresca (quien llama puede esparcir y mutar). */
export function defaultCoachMethodologyKnobs(): CoachMethodologyKnobs {
  const d = DEFAULT_COACH_METHODOLOGY_KNOBS;
  return {
    zones: { ...d.zones },
    default_tests: [...d.default_tests],
    block_end_policy: d.block_end_policy,
    day_down: { ...d.day_down },
    tone: { ...d.tone },
  };
}
