// CALIBRACIÓN DE RITMOS (#71) — «¿le estoy poniendo bien los ritmos?»
//
// Pregunta del coach, no del atleta: sobre las series con ritmo objetivo de
// las últimas semanas, ¿el ritmo prescrito estuvo bien puesto? Dos lecturas,
// nunca una:
//
//   · HACIA DÓNDE FALLA — no basta un % de acierto: el mismo 74 % puede leer
//     «se me pasa un poco» o «lo tengo mal calibrado del todo», según hacia
//     qué lado caen los fallos. `bias` cuenta las tres direcciones.
//   · DÓNDE SE ROMPE DENTRO DE LA SERIE — un 74 % puede ser «bien todo el
//     rato» o «perfecto las tres primeras, roto de la cuarta en adelante», y
//     son dos problemas distintos con soluciones distintas (el ritmo está
//     mal puesto vs. el volumen es demasiado). `positions` lo desglosa.
//
// EXPLÍCITAMENTE NO ENTRAN los veredictos de recuperación ni de duración
// (#66): son preguntas DISTINTAS («¿aguantó el descanso?», «¿corrió el
// tiempo entero?») y mezclarlas en el mismo porcentaje repetiría el error
// que ese mismo encargo acaba de arreglar — un solo número que no distingue
// qué falló. Esta lectura es, a propósito, sólo de RITMO: el caller filtra a
// observaciones con `band_axis === 'pace'` antes de llegar aquí (ver
// `RunComplianceTramo.band_axis`); un tramo de HR o RPE respondería otra
// pregunta bajo el mismo titular.
//
// DISCIPLINA DE MUESTRA (Alex, mockup carrera-en-el-panel.html §05/§08): un
// entrenador competente pondría un mínimo distinto — cuántas series hacen
// falta para juzgar la calibración entera, y cuántas repeticiones hacen
// falta en UNA posición para ponerle porcentaje. Los dos son MÉTODO del
// coach (`shared/domain/coach/running-thresholds.ts`), nunca una constante
// aquí. `has_enough_data` y el `pct_dentro` de cada posición son los dos
// puntos donde ese umbral decide; ni `bias` ni el `n` de cada posición se
// esconden nunca — el número de observaciones se dice siempre, sólo el
// PORCENTAJE se retira cuando la muestra es corta (nunca un 0 % que sea en
// realidad "no lo sé").
//
// Puro: sin I/O, sin DB. El wire (`web/lib/coach/running-analytics.ts`)
// junta las observaciones de N sesiones y resuelve el umbral del coach.

import { summarizeRunCompliance, type RunComplianceSummary, type RunComplianceVerdict } from '../adherence/run-compliance';

/** Una repetición de trabajo ya juzgada por ritmo, lista para el agregado. */
export interface CalibrationObservation {
  /** Ordinal 1-based dentro de SU serie: `RunComplianceTramo.rep_ordinal`.
   *  «La 3.ª repetición de este 6×800», nunca el turno dentro de toda la
   *  ejecución (eso mezclaría series de largos distintos sin decirlo). */
  rep_ordinal: number;
  verdict: RunComplianceVerdict;
}

/** Hacia dónde falla el conjunto — mismo shape que el resumen de sesión
 *  (`RunComplianceSummary`): total/evaluable/dentro/fuera_rapido/fuera_lento/
 *  sin_dato/pct_dentro. Se reutiliza tal cual: la pregunta «¿cuántas cayeron
 *  dentro, y las que no, hacia qué lado?» es literalmente la misma que ya
 *  resuelve una sesión — aquí sólo cambia que las observaciones vienen de
 *  muchas. */
export type CalibrationBias = RunComplianceSummary;

/** Una posición dentro de la serie («la 4.ª»), con su propio n y su propio
 *  porcentaje — o sin porcentaje, si la muestra en ESA posición es corta. */
export interface CalibrationPosition {
  /** 1-based: 1 = "la 1.ª". */
  position: number;
  /** Repeticiones EVALUABLES que llegaron a esta posición (sin_dato aparte). */
  n: number;
  /** % dentro en esta posición. Null cuando `n < min_reps_per_position`: un
   *  0 % sostenido por dos observaciones sería una conclusión inventada, no
   *  una lectura (mockup §07, fila «Posición con muy pocas repeticiones»). */
  pct_dentro: number | null;
}

export interface RunCalibration {
  /** Si hay series de sobra para afirmar algo del conjunto. Cuando es
   *  false, `bias`/`positions` SIGUEN yendo completos (para que la tarjeta
   *  pueda decir «llevas 12 de 20») — lo que no debe hacer el consumidor es
   *  pintar un porcentaje con la bandera a false. */
  has_enough_data: boolean;
  /** El umbral que decidió `has_enough_data` — para que la tarjeta pueda
   *  decir «12 de 20» sin volver a preguntarle al resolutor del coach. */
  min_series_required: number;
  bias: CalibrationBias;
  /** Ordenadas por posición ascendente. Sólo aparecen posiciones con al
   *  menos una observación real — no se inventan huecos a n:0. */
  positions: CalibrationPosition[];
}

export interface RunCalibrationOptions {
  /** Mínimo de observaciones EVALUABLES+sin_dato (`bias.total`) para que la
   *  tarjeta entera se atreva a hablar. Método del coach — defecto 20. */
  min_series_for_calibration: number;
  /** Mínimo de evaluables en UNA posición para ponerle porcentaje a esa
   *  columna. Método del coach — defecto 3. */
  min_reps_per_position: number;
}

/** Agrega observaciones de RITMO (ya filtradas a `band_axis === 'pace'`) de
 *  todas las series que entran en la ventana, en una lectura de calibración. */
export function buildRunCalibration(
  observations: readonly CalibrationObservation[],
  opts: RunCalibrationOptions,
): RunCalibration {
  const bias = summarizeRunCompliance(observations.map((o) => o.verdict));

  const byPosition = new Map<number, RunComplianceVerdict[]>();
  for (const o of observations) {
    const list = byPosition.get(o.rep_ordinal) ?? [];
    list.push(o.verdict);
    byPosition.set(o.rep_ordinal, list);
  }
  const positions: CalibrationPosition[] = [...byPosition.entries()]
    .sort(([a], [b]) => a - b)
    .map(([position, verdicts]) => {
      const s = summarizeRunCompliance(verdicts);
      return {
        position,
        n: s.evaluable,
        pct_dentro: s.evaluable >= opts.min_reps_per_position ? s.pct_dentro : null,
      };
    });

  return {
    has_enough_data: bias.total >= opts.min_series_for_calibration,
    min_series_required: opts.min_series_for_calibration,
    bias,
    positions,
  };
}
