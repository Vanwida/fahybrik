// EL RITMO AL MISMO PULSO — la única señal que aísla la FORMA del esfuerzo.
//
// LA PREGUNTA. Un atleta corre más rápido cuando aprieta más. Eso no dice nada
// sobre si está mejorando: dice que ese día fue a tope. La pregunta de verdad es
// «al MISMO coste para el corazón, ¿va más rápido que hace un mes?». Si a 150
// pulsaciones antes iba a 5:14 y ahora va a 5:03, el motor ha cambiado — y no
// hace falta que se vacíe en un test para verlo. Por eso es el primer peldaño de
// la escalera de evidencia (`progress.ts`): es la única que separa la forma del
// día que tuvo.
//
// POR QUÉ NO EXISTÍA. En la base había las dos mitades (`avg_hr` y
// `avg_pace_s_per_km` por tramo, desde siempre) y nadie las había cruzado.
// `decoupling.ts` contesta una pregunta pariente pero distinta: cómo se
// desacopla el pulso DENTRO de una sesión. Esto compara SESIONES entre sí.
//
// EL MECANISMO, y por qué es tan estrecho
// ---------------------------------------
// Comparar ritmos a pulsos distintos exige un modelo de cómo se relacionan, y
// cualquier modelo que se elija (proporcional al pulso, proporcional a la
// reserva sobre el reposo, una recta ajustada) da respuestas distintas en
// cuanto los pulsos se separan. Elegir uno sería inventar fisiología.
//
// Así que no se elige: se ACOTA. Solo entran tramos cuyo pulso medio ya cae
// dentro de una banda estrecha alrededor de la referencia (±5 ppm por defecto).
// Dentro de esa banda, todos los modelos coinciden hasta el decimal, así que la
// corrección proporcional
//
//     ritmo_a_la_referencia = ritmo × (pulso / referencia)
//
// es segura precisamente porque nunca se le pide que viaje lejos. Fuera de la
// banda no se extrapola: el tramo se descarta. Un dato menos es más honesto que
// un dato inventado.
//
// LO QUE SE DESCARTA, Y POR QUÉ CADA COSA
// ---------------------------------------
//   · Tramos CORTOS. El corazón llega tarde: en una serie de 200 m el pulso
//     medio describe el final del descanso anterior tanto como el esfuerzo.
//   · Tramos EN CUESTA. Un ritmo al 8 % no es comparable con uno en llano al
//     mismo pulso. El umbral es el del COACH
//     (`gradient_retires_pace_pct`, mismo que viaja al móvil en
//     `run_compliance`), no un segundo número de este fichero.
//   · Tramos que se SABEN cansados. Correr a 150 ppm después de un trineo
//     cuesta más ritmo que correr a 150 ppm fresco — eso es una lectura REAL,
//     pero es OTRA («carrera comprometida», `compromised-pace.ts`). Mezclarlas
//     haría que una semana con más simulacros pareciera pérdida de forma. La
//     clasificación fresco/fatigado NO se rederiva aquí: entra ya resuelta por
//     `classifyEffort` (`race-transfer`), el mismo criterio que usan las otras
//     dos lecturas.
//
//     SOLO CAE EL FATIGADO, no «el que no consta como fresco». La diferencia
//     no es sutil: `classifyEffort` necesita `context_format`/`prior_work_s`
//     (mig 0120) para decir «fresco», y en la base real ese campo viene vacío
//     en la práctica totalidad de los tramos — exigir prueba de frescura dejó
//     la lectura en CERO observaciones sobre los 67 tramos del atleta con más
//     carrera. Es el mismo criterio que la pendiente, dos párrafos más arriba:
//     lo desconocido es ruido y se promedia, lo que se sabe malo es sesgo y se
//     quita. Un tramo sin contexto es, casi siempre, una carrera normal.
//
// UNA SEMANA SIN TRAMOS VÁLIDOS NO TIENE PUNTO. No tiene un cero, ni hereda el
// de la semana anterior: no existe en la serie. Un cero aquí se leería como
// «corrió infinitamente rápido».
//
// Puro y sin base de datos, como todo `shared/domain`.

import { gradientKnownSteep } from './gradient';

/** Un tramo candidato, ya clasificado fresco/fatigado río arriba. */
export interface SameHrObservation {
  /** Lunes de la semana en ISO (`YYYY-MM-DD`). */
  week_start: string;
  /** Pulso medio del tramo, ppm. */
  avg_hr: number;
  /** Ritmo medio del tramo, segundos por kilómetro. */
  pace_s_per_km: number;
  /** Metros del tramo. Pondera la media y filtra los cortos. */
  distance_m: number;
  /** Pendiente media (%), o null si no se sabe. */
  gradient_pct: number | null;
  /** Lo que dijo `classifyEffort`. Cae 'fatigado'; 'fresco' y null entran. */
  effort: 'fresco' | 'fatigado' | null;
}

export interface SameHrOptions {
  /** El pulso contra el que se normaliza todo, ppm. */
  reference_bpm: number;
  /** Media banda alrededor de la referencia, en latidos. */
  tolerance_bpm: number;
  /** Metros mínimos para que el pulso medio del tramo signifique algo. */
  min_distance_m: number;
  /** Pendiente (%) a partir de la cual el ritmo deja de ser comparable. Del
   *  método del coach, no de una constante de este fichero. */
  gradient_retires_pace_pct: number;
}

export interface SameHrPoint {
  /** Lunes de la semana en ISO. */
  semana: string;
  /** Ritmo (s/km) al pulso de referencia, ponderado por distancia. */
  valor: number;
  /** Cuántos tramos lo sostienen. Una semana de uno no es una semana de seis. */
  tramos: number;
}

export interface SameHrPaceSeries {
  /** Semanas con al menos un tramo válido, en orden ascendente. */
  points: SameHrPoint[];
  reference_bpm: number;
  /** Tramos que entraron, para poder decir sobre cuánto se está afirmando. */
  accepted: number;
  /** Tramos mirados y descartados, por motivo. Diagnóstico, no adorno: si una
   *  lectura sale vacía, esto dice si fue por falta de pulso o por cuestas. */
  rejected: {
    sin_pulso_util: number;
    fuera_de_banda: number;
    demasiado_corto: number;
    en_cuesta: number;
    fatigado: number;
  };
}

/** Un tramo utilizable: números finitos y positivos. Un ritmo de 0 s/km o un
 *  pulso de 0 ppm no son mediciones bajas, son ausencias mal codificadas. */
function esUsable(o: SameHrObservation): boolean {
  return (
    Number.isFinite(o.avg_hr) &&
    o.avg_hr > 0 &&
    Number.isFinite(o.pace_s_per_km) &&
    o.pace_s_per_km > 0 &&
    Number.isFinite(o.distance_m) &&
    o.distance_m > 0
  );
}

/**
 * La serie semanal del ritmo al pulso de referencia.
 *
 * Ponderada por DISTANCIA y no por número de tramos: un rodaje de 8 km describe
 * el estado del motor mucho mejor que un tramo de 1 km, y contarlos igual
 * dejaría que una sesión de series troceada mandara sobre la media de la semana
 * por el simple hecho de venir partida en más filas.
 */
export function buildSameHrPaceSeries(
  observations: readonly SameHrObservation[],
  opts: SameHrOptions,
): SameHrPaceSeries {
  const rejected = {
    sin_pulso_util: 0,
    fuera_de_banda: 0,
    demasiado_corto: 0,
    en_cuesta: 0,
    fatigado: 0,
  };

  // Acumuladores por semana: Σ(ritmo_corregido × metros) y Σ(metros).
  const porSemana = new Map<string, { suma: number; metros: number; tramos: number }>();
  let accepted = 0;

  const referencia = opts.reference_bpm;
  if (!Number.isFinite(referencia) || referencia <= 0) {
    // Sin ancla no hay nada contra qué normalizar. Serie vacía, no una serie de
    // ritmos crudos disfrazada de "al mismo pulso".
    return { points: [], reference_bpm: 0, accepted: 0, rejected };
  }

  for (const o of observations) {
    if (!esUsable(o)) {
      rejected.sin_pulso_util += 1;
      continue;
    }
    // El orden importa para que el diagnóstico sea legible: se cuenta el PRIMER
    // motivo por el que cae, no todos.
    if (o.distance_m < opts.min_distance_m) {
      rejected.demasiado_corto += 1;
      continue;
    }
    if (Math.abs(o.avg_hr - referencia) > opts.tolerance_bpm) {
      rejected.fuera_de_banda += 1;
      continue;
    }
    if (gradientKnownSteep(o.gradient_pct, opts.gradient_retires_pace_pct)) {
      rejected.en_cuesta += 1;
      continue;
    }
    // Solo el que SE SABE fatigado. `null` (sin contexto grabado) sigue: ver la
    // cabecera — exigir prueba de frescura vacía la lectura en datos reales.
    if (o.effort === 'fatigado') {
      rejected.fatigado += 1;
      continue;
    }

    // La corrección, dentro de la banda estrecha donde es segura. Iba más
    // rápido de lo que le tocaba a ese pulso → su ritmo a la referencia es
    // mejor (número menor) que el crudo, y al revés.
    const corregido = o.pace_s_per_km * (o.avg_hr / referencia);

    const acc = porSemana.get(o.week_start) ?? { suma: 0, metros: 0, tramos: 0 };
    acc.suma += corregido * o.distance_m;
    acc.metros += o.distance_m;
    acc.tramos += 1;
    porSemana.set(o.week_start, acc);
    accepted += 1;
  }

  const points: SameHrPoint[] = [...porSemana.entries()]
    .filter(([, acc]) => acc.metros > 0)
    .map(([semana, acc]) => ({
      semana,
      valor: Math.round(acc.suma / acc.metros),
      tramos: acc.tramos,
    }))
    .sort((a, b) => a.semana.localeCompare(b.semana));

  return { points, reference_bpm: referencia, accepted, rejected };
}

/**
 * El pulso de referencia a partir de una banda de zona: su punto medio.
 *
 * Se saca de la banda DEL ATLETA y no de un número fijo porque «150 ppm» no
 * significa lo mismo en dos personas; lo que se compara semana a semana es SU
 * zona, y qué zona la elige el coach (`same_hr_reference_zone`).
 *
 * Null cuando la banda no tiene los dos bordes. Hoy eso sólo le pasa a la Z1,
 * que no tiene suelo por definición del modelo (no hay un mínimo para ir
 * suave) — y por eso la zona de referencia está acotada a Z2–Z5 en su umbral y
 * en la tabla, no aquí: mejor que no se pueda elegir a que se elija y la
 * lectura salga muda. Esta guarda es la red de debajo, no la puerta.
 */
export function referenceBpmFromBand(band: {
  min_bpm: number | null;
  max_bpm: number | null;
}): number | null {
  const { min_bpm, max_bpm } = band;
  if (min_bpm == null || max_bpm == null) return null;
  if (!Number.isFinite(min_bpm) || !Number.isFinite(max_bpm)) return null;
  if (min_bpm <= 0 || max_bpm <= min_bpm) return null;
  return Math.round((min_bpm + max_bpm) / 2);
}
