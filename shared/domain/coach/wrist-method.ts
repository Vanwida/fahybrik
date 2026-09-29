// @fahybrid/shared/domain/coach/wrist-method — el método del coach que la
// muñeca necesita para correr, tal como VIAJA al reloj.
//
// MECANISMO vs MÉTODO (HARD RULE Nº0)
// -----------------------------------
// Que un paso a ritmo se juzgue «rápido / dentro / lento», que el aviso pase por
// una histéresis, que la vuelta automática se mida por GPS, que el ritmo actual
// sea una ventana de 10 s y que un ritmo por encima de 20:00/km no se enseñe es
// MECANISMO: vive en el código del reloj (`FAHYBRIKCore/Vivo`) y es el mismo para
// todos los coaches. Cuánta holgura se da antes de avisar, cada cuánto se repite,
// cuántos segundos de gracia tiene un paso a zona, hacia dónde avisa un rodaje,
// cada cuántos metros se cierra una vuelta, dónde empieza una tirada, si de
// calentar a las series se pasa solo o hasta pulsar, qué parte de una serie
// cortada cuenta como hecha y cómo se llama cada RPE es MÉTODO: la pregunta que
// decide («¿otro entrenador competente lo haría distinto?») da que sí, así que
// nace como DATO con un valor por defecto y nunca como `const`.
//
// DÓNDE VIVE CADA COSA
//   · Los números y los sí/no: columnas `wrist_*` de `coach_signal_thresholds`
//     (mig 0282), declaradas en `COACH_THRESHOLD_SPEC` (signal-thresholds.ts) con
//     su defecto y sus límites. NULL = el defecto.
//   · Las palabras del RPE: `wrist_rpe_words` (text[] de 11), aquí, porque un
//     texto no cabe en el registro numérico.
//   · Este fichero: cómo se lee ese método hacia el reloj (`buildWristMethod`).
//     El reloj recibe SIEMPRE el valor efectivo y completo, nunca un hueco que
//     rellenar con su propio defecto (el decoder de iOS puede tener uno de
//     reserva para una sesión cacheada antes de esta tanda, pero el servidor no
//     manda medias tintas).
//
// LOS DEFECTOS SON LOS DE HOY. Los del kit del doble (`REGLAS_AVISO_DEFECTO`,
// `METODO_RESUMEN_DEFECTO`, `RPE_PALABRA_DEFECTO`) y los de Swift
// (`Vivo.reglasAvisoDefecto`, `UmbralesCorrer`, la vuelta de 1000 m) son las
// mismas cifras: un test de paridad (web/tests/coach/wrist-method.test.ts) las
// compara para que no diverjan. Un coach que no toca nada se comporta como hoy.
//
// Puro y sin base de datos, como el resto de `shared/domain`.

import { z } from 'zod';
import type { CoachThresholdKey, CoachThresholds } from './signal-thresholds';

// ── Vocabularios cerrados ────────────────────────────────────────────────────

/**
 * Hacia dónde avisa un rodaje a zona cuando el tramo no lo dice. La POSICIÓN es
 * el valor guardado en `wrist_alert_continuous_zone` (0, 1, 2). Se razona en
 * intensidad: «arriba» es más pulso; un tope de FC solo avisa por encima.
 */
export const WRIST_ALERT_DIRECTIONS = ['ninguno', 'arriba', 'ambos'] as const;
export type WristAlertDirection = (typeof WRIST_ALERT_DIRECTIONS)[number];

/**
 * Las clases de sesión donde la vuelta automática tiene sentido (un correr
 * continuo). Una clase más = una columna `wrist_auto_lap_<clase>` y una entrada aquí.
 */
export const WRIST_AUTO_LAP_CLASSES = ['rodaje', 'tirada', 'tempo', 'progresivo', 'carrera'] as const;
export type WristAutoLapClass = (typeof WRIST_AUTO_LAP_CLASSES)[number];

export const WRIST_AUTO_LAP_KEYS = {
  rodaje: 'wrist_auto_lap_rodaje',
  tirada: 'wrist_auto_lap_tirada',
  tempo: 'wrist_auto_lap_tempo',
  progresivo: 'wrist_auto_lap_progresivo',
  carrera: 'wrist_auto_lap_carrera',
} as const satisfies Record<WristAutoLapClass, CoachThresholdKey>;

/** De calentar a las series: solo, o hasta que el atleta pulse. */
export type WristGate = 'auto' | 'manual';

// ── Las palabras del RPE ─────────────────────────────────────────────────────

/** El RPE va de 0 a 10 (CR-10): once palabras, el 0 también tiene la suya. */
export const WRIST_RPE_WORD_COUNT = 11;
/** Una palabra que no cabe en la muñeca no se dice: tope de caracteres. */
export const WRIST_RPE_WORD_MAX_LENGTH = 24;

/** Las palabras de fábrica (las del kit del doble, `RPE_PALABRA_DEFECTO`). */
export const DEFAULT_WRIST_RPE_WORDS: readonly string[] = [
  'nada',
  'muy suave',
  'muy suave',
  'suave',
  'suave',
  'moderado',
  'moderado',
  'fuerte',
  'fuerte',
  'muy fuerte',
  'máximo',
];

/** Las once palabras del coach: ni una menos, ni una vacía, ni una que no quepa. */
export const wristRpeWordsSchema = z
  .array(z.string().trim().min(1, 'Cada RPE lleva su palabra.').max(WRIST_RPE_WORD_MAX_LENGTH))
  .length(WRIST_RPE_WORD_COUNT, 'Hacen falta las once palabras, del 0 al 10.');

/** Las palabras efectivas: las del coach, o las de fábrica. Siempre once. */
export function effectiveWristRpeWords(stored: readonly string[] | null | undefined): string[] {
  if (stored && stored.length === WRIST_RPE_WORD_COUNT) return [...stored];
  return [...DEFAULT_WRIST_RPE_WORDS];
}

// ── El método hacia el reloj ─────────────────────────────────────────────────

/**
 * Lo que la muñeca lee del método del coach al correr. snake_case en el cable
 * (Swift lo decodifica con `convertFromSnakeCase`), y en las unidades que el
 * reloj usa por dentro: segundos, metros, fracción de 0 a 1.
 */
export interface WristMethod {
  alerts: {
    /** Holgura fuera de la banda antes de contar como fuera, por eje (unidad del eje). */
    slack: { pace_s: number; hr_bpm: number; split500_s: number; watts: number; cadence_spm: number };
    /** Mínimo entre dos avisos del mismo paso. */
    gap_s: number;
    /** Segundos seguidos fuera antes del primer aviso. */
    confirm_s: number;
    /** Segundos al empezar un paso a zona sin avisar «aprieta». */
    zone_grace_s: number;
    in_warmup: boolean;
    in_recovery: boolean;
    /** Hacia dónde avisa un rodaje a zona cuando el tramo no trae su `alert`. */
    continuous_zone: WristAlertDirection;
    prewarn_s: number;
    prewarn_m: number;
    /** Un paso más corto que esto no lleva preaviso. */
    prewarn_min_step_s: number;
  };
  auto_lap: {
    /** Cada cuántos metros se cierra una vuelta sola; 0 = apagada. */
    every_m: number;
    /** En qué clases de sesión se cierra. */
    classes: WristAutoLapClass[];
  };
  run: {
    /** Un rodaje de al menos esto es una tirada… */
    long_run_s: number;
    /** …o de al menos esto. */
    long_run_m: number;
    /** Una serie de como mucho esto, dentro de un repetir, es un stride. */
    stride_max_s: number;
    gate: WristGate;
  };
  finish: {
    /** Fracción de lo prescrito a partir de la cual una serie cortada cuenta como hecha. */
    short_rep_done_fraction: number;
    /** Segundos quieto antes de guardar sola una sesión que ya acabó. */
    idle_save_s: number;
  };
  /** Once palabras, del RPE 0 al 10. */
  rpe_words: string[];
}

const SECONDS_PER_MINUTE = 60;
const METERS_PER_KM = 1000;
const PERCENT = 100;

/** Una posición de `WRIST_ALERT_DIRECTIONS` (un código fuera de la lista cae al defecto de fábrica). */
function directionOf(code: number): WristAlertDirection {
  return WRIST_ALERT_DIRECTIONS[code] ?? 'arriba';
}

/**
 * El método efectivo del coach, listo para el reloj. `t` son los umbrales
 * efectivos (defecto + su fila) y `rpeWords` sus palabras (o null = las de fábrica).
 */
export function buildWristMethod(
  t: Pick<CoachThresholds, WristScalarKey>,
  rpeWords?: readonly string[] | null,
): WristMethod {
  return {
    alerts: {
      slack: {
        pace_s: t.wrist_slack_pace_s,
        hr_bpm: t.wrist_slack_hr_bpm,
        split500_s: t.wrist_slack_split500_s,
        watts: t.wrist_slack_watts,
        cadence_spm: t.wrist_slack_cadence_spm,
      },
      gap_s: t.wrist_alert_gap_s,
      confirm_s: t.wrist_alert_confirm_s,
      zone_grace_s: t.wrist_alert_zone_grace_s,
      in_warmup: t.wrist_alert_in_warmup === 1,
      in_recovery: t.wrist_alert_in_recovery === 1,
      continuous_zone: directionOf(t.wrist_alert_continuous_zone),
      prewarn_s: t.wrist_prewarn_s,
      prewarn_m: t.wrist_prewarn_m,
      prewarn_min_step_s: t.wrist_prewarn_min_step_s,
    },
    auto_lap: {
      every_m: t.wrist_auto_lap_m,
      classes: WRIST_AUTO_LAP_CLASSES.filter((c) => t[WRIST_AUTO_LAP_KEYS[c]] === 1),
    },
    run: {
      long_run_s: t.wrist_long_run_min * SECONDS_PER_MINUTE,
      long_run_m: t.wrist_long_run_km * METERS_PER_KM,
      stride_max_s: t.wrist_stride_max_s,
      gate: t.wrist_gate_manual === 1 ? 'manual' : 'auto',
    },
    finish: {
      short_rep_done_fraction: t.wrist_short_rep_done_pct / PERCENT,
      idle_save_s: t.wrist_idle_save_min * SECONDS_PER_MINUTE,
    },
    rpe_words: effectiveWristRpeWords(rpeWords),
  };
}

/** Las claves numéricas que lee el reloj: todas las `wrist_*` de `COACH_THRESHOLD_SPEC`. */
export type WristScalarKey = Extract<CoachThresholdKey, `wrist_${string}`>;
