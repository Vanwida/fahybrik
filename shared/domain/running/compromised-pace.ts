// CARRERA COMPROMETIDA — «lo que le cuesta correr cansado» (#71, mockup
// carrera-en-el-panel §05). Cuánto ritmo pierde el atleta al correr un
// objetivo YA CONOCIDO (misma banda) después de trabajo previo, contra ese
// mismo objetivo en fresco.
//
// EL MECANISMO YA EXISTÍA — se reutiliza, no se reinventa. `classifyEffort`
// (`shared/domain/race-transfer/compute.ts`) ya distingue fresco/fatigado
// desde `context_format` + `prior_work_s` (migración 0120): es EXACTAMENTE
// la misma pregunta que ya resuelve el cruce carrera×entreno para las 8
// estaciones + la carrera. Portar una segunda clasificación aquí sería la
// clase de divergencia que este proyecto ya ha pagado más de una vez — dos
// sitios que prometen calcular "fresco vs fatigado" y que un día dejan de
// estar de acuerdo. `FRESH_PRIOR_WORK_MAX_S` (300 s) tampoco se toca aquí
// por la misma razón: es un mecanismo compartido, no un ajuste de esta
// tarjeta.
//
// LO QUE SÍ ES NUEVO. `race-transfer` clasifica y agrega TODO el histórico a
// un único fresco/fatigado por estación — no empareja por objetivo ni
// trocea por semana. "Carrera comprometida" necesita las dos cosas:
//
//   · EMPAREJAR por la MISMA banda prescrita (`band_fast_s`/`band_slow_s`):
//     "el 1 km a este ritmo, fatigado, contra el mismo 1 km a este ritmo, en
//     fresco" — nunca una serie de umbral fatigada contra un rodaje suave
//     fresco, que no diría nada del coste de la fatiga.
//   · UNA CURVA SEMANAL, no un snapshot: la referencia en fresco de una
//     banda es la media de TODO lo fresco visto HASTA esa semana (nunca del
//     futuro — un punto de la curva no puede explicarse con un dato que
//     todavía no había pasado), y el coste de esa semana es esa referencia
//     contra la media de lo fatigado ESA semana.
//
// LA UNIDAD ES s/km, NO PORCENTAJE — a diferencia de `decoupling_pct` (que
// el motor sólo produce como %), aquí las dos partes YA son ritmos en la
// misma unidad: restarlas no inventa nada, es la resta literal que pide el
// mockup ("de 9 s/km a 4 s/km").
//
// SIN VALIDAR CONTRA CARRERA REAL (Alex/team-lead, 12-ago): la base de hoy
// es de demostración — un seed pobre no dice nada sobre si el mecanismo vale,
// sólo sobre cuántas filas metió el seed. Los casos de prueba de este módulo
// están fabricados a mano representando el dominio (una serie de carrera
// dentro de un bloque multiestación, la misma en fresco, las combinaciones
// que rompen), no esperan a que el seed traiga parejas. Cuando existan
// carreras reales de atletas reales, hay que releer esto contra ellas antes
// de darlo por bueno — la nota va en DECISIONS.md, no aquí, para que quede
// donde se mira antes de tocar el dominio.

import { classifyEffort } from '../race-transfer/compute';

/** Un tramo de trabajo de carrera, con lo mínimo para clasificarlo y
 *  emparejarlo. Reusa la forma de `ObservedEffort` (race-transfer) + la
 *  identidad del objetivo + la semana — lo que race-transfer no necesita
 *  porque nunca empareja ni trocea por fecha. */
export interface CompromisedRunObservation {
  /** Lunes de la semana de la sesión, en la zona del atleta. */
  week_start: string;
  /** El objetivo prescrito — dos observaciones son "la misma carrera" sólo
   *  cuando su banda coincide exactamente. `RunComplianceTramo.band` cuando
   *  el eje es 'pace'. */
  band_fast_s: number;
  band_slow_s: number | null;
  /** Ritmo real del tramo, s/km. */
  pace_s_per_km: number;
  /** Ver `ObservedEffort` (race-transfer/types) — mismos campos, mismo
   *  significado, para poder llamar a `classifyEffort` sin traducir nada. */
  context_format: string | null;
  prior_work_s: number | null;
  position: number;
}

export interface CompromisedWeekPoint {
  week_start: string;
  /** s/km de MÁS al correr fatigado contra el fresco de referencia hasta
   *  esa semana. Positivo = pierde ritmo fatigado (el caso normal); negativo
   *  sería un dato real y se enseña igual, nunca se recorta a 0. */
  cost_s_per_km: number;
  /** Cuántas bandas distintas entraron en la media de esta semana. */
  bands: number;
}

export interface CompromisedPaceTrend {
  /** Si hay parejas de sobra para enseñar la curva. Método del coach
   *  (`min_pairs_for_compromised_trend`, defecto 4) — ver `points`: SIGUEN
   *  yendo completos aunque esto sea false, misma ley que el resto de este
   *  encargo (número sí, cuando lo hay; lo que se retira es la promesa de
   *  que la curva ya es de fiar). */
  has_enough_data: boolean;
  min_pairs_required: number;
  /** Comparaciones válidas totales — pares (semana, banda) con fresco Y
   *  fatigado. Es el número que enseña el mockup ("sobre 5 comparaciones"). */
  valid_pairs: number;
  /** Un punto por semana con al menos una comparación válida — las semanas
   *  sin ninguna no aparecen (no hay hueco que rellenar: aquí sí hay un
   *  "no sé" real, a diferencia del volumen en km). */
  points: CompromisedWeekPoint[];
}

function bandKey(fast_s: number, slow_s: number | null): string {
  return `${fast_s}|${slow_s ?? 'x'}`;
}

/**
 * Construye la curva de coste de correr cansado a partir de observaciones ya
 * resueltas (banda + ritmo + los tres campos que clasifica `classifyEffort`).
 * Puro: sin I/O. El wire (`web/lib/coach/running-analytics.ts`) resuelve la
 * banda de cada tramo (vía `buildRunCompliance`) y `context_format`/
 * `prior_work_s` (de `segment_executions`, migración 0120).
 */
export function buildCompromisedPaceTrend(
  observations: readonly CompromisedRunObservation[],
  opts: { min_pairs_for_trend: number },
): CompromisedPaceTrend {
  const classified = observations
    .map((o) => ({
      ...o,
      klass: classifyEffort({
        value_s: o.pace_s_per_km,
        context_format: o.context_format,
        prior_work_s: o.prior_work_s,
        position: o.position,
      }),
    }))
    .filter((o): o is typeof o & { klass: 'fresco' | 'fatigado' } => o.klass != null);

  const weeks = [...new Set(classified.map((o) => o.week_start))].sort();

  const points: CompromisedWeekPoint[] = [];
  let valid_pairs = 0;

  for (const week of weeks) {
    const byBand = new Map<
      string,
      { fatigadoThisWeek: number[]; frescoUpToWeek: number[] }
    >();
    for (const o of classified) {
      if (o.week_start > week) continue; // nunca mirar al futuro de este punto
      const key = bandKey(o.band_fast_s, o.band_slow_s);
      const entry = byBand.get(key) ?? { fatigadoThisWeek: [], frescoUpToWeek: [] };
      if (o.klass === 'fresco') entry.frescoUpToWeek.push(o.pace_s_per_km);
      else if (o.week_start === week) entry.fatigadoThisWeek.push(o.pace_s_per_km);
      byBand.set(key, entry);
    }

    const deltas: number[] = [];
    for (const { fatigadoThisWeek, frescoUpToWeek } of byBand.values()) {
      if (fatigadoThisWeek.length === 0 || frescoUpToWeek.length === 0) continue;
      const meanFatigado = mean(fatigadoThisWeek);
      const meanFresco = mean(frescoUpToWeek);
      deltas.push(meanFatigado - meanFresco);
    }

    if (deltas.length > 0) {
      valid_pairs += deltas.length;
      points.push({ week_start: week, cost_s_per_km: Math.round(mean(deltas)), bands: deltas.length });
    }
  }

  return {
    has_enough_data: valid_pairs >= opts.min_pairs_for_trend,
    min_pairs_required: opts.min_pairs_for_trend,
    valid_pairs,
    points,
  };
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
