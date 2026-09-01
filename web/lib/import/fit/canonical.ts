// La actividad CANÓNICA de un import de archivo — el contrato entre el parser
// (FIT hoy; TCX/GPX mañana) y el materializador que la convierte en sesión.
//
// POR QUÉ EXISTE ESTE SEAM. El criterio de empresa es que el año de reloj que un
// atleta trae al suscribirse entre COMPLETO (laps, ruta, muestras, cadencia), no
// como el blob plano de Apple Salud. La Health API de Garmin está pausada para
// altas nuevas (ver docs/DECISIONS.md 2026-08-13); el archivo FIT que Garmin
// entrega al atleta por GDPR lleva todo lo que la API daría. El parser NO sabe
// de base de datos y el materializador NO sabe de formatos: un TCX de Polar es
// otro parser que produce ESTE mismo tipo, no otro pipeline.
//
// Todo opcional salvo lo que define una sesión (ventana temporal + modalidad):
// un FIT de cinta no lleva GPS, uno antiguo no lleva cadencia, y el contrato no
// puede obligar a inventar — HONEST NULLS, como en el resto de la analítica.

import type { SegmentModality } from '@fahybrid/shared/domain/segment-modality';

/** Un lap tal como lo marcó el reloj (auto-km, botón, o paso de workout). */
export interface CanonicalLap {
  started_at: Date;
  ended_at: Date;
  distance_m: number | null;
  /** Segundos del lap según el reloj (timer time, no elapsed). */
  duration_s: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  /** Ritmo medio en s/km cuando el propio fichero lo trae; si no, el
   *  materializador lo deriva de distancia+duración. */
  avg_pace_s_per_km: number | null;
  /** Cadencia de carrera en pasos/min (ya doblada si el dispositivo manda
   *  revoluciones). Solo tiene sentido en modalidad run. */
  run_cadence_spm: number | null;
  /** Desnivel positivo del lap, en metros. */
  elevation_gain_m: number | null;
  /**
   * El PAPEL del lap, ya traducido del vocabulario del formato de origen
   * (en FIT, `intensity`: active/rest/warmup/cooldown/recovery) al nuestro:
   *  - 'work'     → esfuerzo puntuable (mig 0146: leg_role='work')
   *  - 'recovery' → metros reales que NO son un intento (trote entre series,
   *                 calentamiento, vuelta a la calma) → leg_role='recovery'
   * El parser decide con el vocabulario del formato; el materializador NO
   * re-interpreta.
   */
  role: 'work' | 'recovery';
}

/** Una muestra puntual de pulso. */
export interface CanonicalHrSample {
  at: Date;
  bpm: number;
}

/** Un punto de la ruta GPS. */
export interface CanonicalRoutePoint {
  at: Date;
  lat: number;
  lon: number;
}

export interface CanonicalActivity {
  /**
   * Identificador ESTABLE de la actividad dentro de su fuente, para dedupe:
   * el mismo fichero subido dos veces produce el mismo ref. Para FIT:
   * `fit:<serial_number>:<start_time_epoch>` (y si el fichero no trae serial,
   * `fit:sha1(bytes):<start_time_epoch>`). Va a `workout_executions.source_workout_ref`.
   */
  source_ref: string;
  /** De qué formato salió — hoy 'fit'; mañana 'tcx' | 'gpx'. Va a
   *  `workout_executions.source`. Prefijado: 'fit_import'. */
  source: 'fit_import';
  /**
   * Modalidad YA mapeada por el parser desde el sport del formato, con la
   * lección de la 0192 aplicada: walking/hiking NO son 'run' — van a 'other'.
   * Lo que el formato no sepa nombrar → 'other'; jamás se abre un cubo nuevo.
   */
  modality: SegmentModality;
  started_at: Date;
  ended_at: Date;
  /** Timer time de la sesión en segundos (sin pausas), si el fichero lo trae. */
  duration_s: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories_kcal: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  /** Laps en orden. Vacío si el fichero no trae (o solo trae el lap-espejo de
   *  la sesión entera, que el parser debe descartar como no-informativo). */
  laps: CanonicalLap[];
  /** Muestras de pulso en orden temporal. Vacío si no hay sensor. */
  hr_samples: CanonicalHrSample[];
  /** Ruta GPS en orden temporal. Vacío en cinta/indoor. */
  route: CanonicalRoutePoint[];
}

/** Resultado de parsear UN fichero: puede traer varias actividades (un FIT
 *  multideporte trae una session por tramo) o ninguna (un FIT de settings). */
export interface ParsedFile {
  activities: CanonicalActivity[];
  /** Avisos no fatales, para el resumen del job («2 ficheros ilegibles»).
   *  En castellano de atleta no: esto es diagnóstico interno. */
  warnings: string[];
}
