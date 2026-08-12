// LA HUELLA — «cómo reparte el esfuerzo» (#71, mockup carrera-en-el-panel §05).
//
// PORT FIEL de `aguanteDe`/`ritmoDe`, de `web/components/design-twin/tramos.ts`
// — el mismo cálculo que ya corre en el reloj del atleta (`FormaDeCarrera.swift`,
// que a su vez cita `tramos.ts` como su origen). Este archivo es la TERCERA copia
// de la misma aritmética (twin TS → Swift on-device → esto), y es DELIBERADO, no
// un descuido: las constantes (`MIN_LEGS_FOR_PACING_SHAPE`, `PACING_SHAPE_MARGIN`)
// tienen que leer EXACTAMENTE igual que lo que el atleta ya ve al terminar
// («son las mismas tres palabras que la app le enseña a él»), así que NO se
// tocan aquí — cambiarlas sólo en el agregado del coach abriría una divergencia
// entre lo que el atleta lee por sesión y lo que el coach lee en agregado, la
// misma clase de bug que este proyecto ya ha pagado dos veces (ver
// `segment-work.ts`, cabecera). Deuda declarada: el sitio correcto para esto es
// UN módulo puro que las tres superficies importen, pero Swift no puede
// importar TypeScript, así que la unificación real sólo llega hasta donde el
// lenguaje lo permite — este puerto y el de Swift quedan sincronizados a mano.
//
// LO QUE SE PORTA, y lo que NO. `tramos.ts` resuelve la carrera ENTERA desde
// una serie de muestras crudas de ritmo (detección de fronteras con mediana
// móvil + disparador de Schmitt) porque un fartlek grabado en vivo no sabe de
// antemano dónde empieza cada tramo. Aquí no hace falta nada de eso: cada
// tramo de trabajo YA es una fila de `segment_executions` con su propio
// `duration_seconds`/`distance_meters` — es exactamente el caso `desdeMarcados`
// de `tramos.ts` («no se infiere nada: se lee»). Lo único que se porta es el
// núcleo numérico: `ritmoDe` (aquí `paceOf`) y `aguanteDe` (aquí
// `sessionPacingShape`).
//
// Puro: sin I/O. El wire (`web/lib/coach/running-analytics.ts`) reúne los
// tramos de trabajo de cada sesión (vía `RunComplianceTramo.rep_ordinal`) y
// agrega el veredicto de N sesiones con `summarizePacingShape`.

/** Mínimo de tramos de trabajo para que "aguantaste" sea una lectura y no una
 *  anécdota — `MIN_TRAMOS_AGUANTE` en `tramos.ts` / `Umbral.minTramosAguante`
 *  en `FormaDeCarrera.swift`. NO es método del coach (ver cabecera): fijo por
 *  diseño para no divergir del veredicto que ya ve el atleta. */
export const MIN_LEGS_FOR_PACING_SHAPE = 4;

/**
 * Cuánto puede caer el ritmo entre mitades y seguir siendo "aguantaste", en
 * PORCENTAJE relativo (no s/km absolutos: 5 s/km sobre 3:00 es otra cosa que
 * sobre 6:00) — `UMBRAL_AGUANTE` en `tramos.ts` / `Umbral.aguante` en Swift.
 * Misma razón que el umbral de arriba: no se toca aquí.
 */
export const PACING_SHAPE_MARGIN = 0.02;

export const PACING_SHAPE_VERDICTS = ['aguantaste', 'de_menos_a_mas', 'se_te_fue'] as const;
export type PacingShapeVerdict = (typeof PACING_SHAPE_VERDICTS)[number];

/** Etiqueta corta para el agregado del coach — «Aguanta: 2 de 9 sesiones». La
 *  del atleta sigue siendo en 2.ª persona («aguantaste»); ésta es sólo para
 *  el recuento, nunca sustituye al veredicto por sesión. */
export const PACING_SHAPE_LABEL: Record<PacingShapeVerdict, string> = {
  aguantaste: 'Aguanta',
  de_menos_a_mas: 'De menos a más',
  se_te_fue: 'Se le va',
};

/** Un tramo de TRABAJO ya ejecutado, con lo mínimo que hace falta para
 *  juzgar el reparto del esfuerzo. */
export interface PacingShapeLeg {
  /** Orden dentro de la serie (`RunComplianceTramo.rep_ordinal`). Decide qué
   *  es "primera mitad" y qué es "segunda" — si llega desordenado, el
   *  veredicto miente. */
  rep_ordinal: number;
  duration_s: number;
  distance_m: number;
}

/**
 * EL RITMO MEDIO DE UN CONJUNTO DE TRAMOS — y no es la media aritmética.
 *
 * El ritmo es s/km: un inverso. La media aritmética de los ritmos sale más
 * lenta que la verdad porque pesa igual un tramo rápido (que cubre más
 * metros en el mismo tiempo) que uno lento. La media correcta es tiempo
 * total / distancia total (port de `ritmoDe`, `tramos.ts`).
 */
function paceOf(legs: readonly PacingShapeLeg[]): number {
  const duration_s = legs.reduce((a, l) => a + l.duration_s, 0);
  const distance_m = legs.reduce((a, l) => a + l.distance_m, 0);
  return (duration_s / distance_m) * 1000;
}

/**
 * EL VEREDICTO DE UNA SESIÓN — port fiel de `aguanteDe`.
 *
 * Compara el ritmo medio (tiempo/distancia, nunca media de ritmos) de la
 * primera mitad de los tramos de trabajo contra la segunda. Con un número
 * impar de tramos, el del medio queda fuera de las dos mitades a propósito
 * — mismo comportamiento que el original (`Math.floor(n/2)` y
 * `slice(length-corte)`, no una partición que lo cuente dos veces ni que lo
 * fuerce a un lado).
 *
 * Null por debajo de `MIN_LEGS_FOR_PACING_SHAPE`: con menos, "aguantaste" es
 * una anécdota, no una lectura — la sesión no entra en el agregado, no se
 * cuenta como ninguno de los tres veredictos.
 */
export function sessionPacingShape(legs: readonly PacingShapeLeg[]): PacingShapeVerdict | null {
  const valid = legs.filter((l) => l.duration_s > 0 && l.distance_m > 0);
  if (valid.length < MIN_LEGS_FOR_PACING_SHAPE) return null;

  const ordered = [...valid].sort((a, b) => a.rep_ordinal - b.rep_ordinal);
  const cut = Math.floor(ordered.length / 2);
  const first = paceOf(ordered.slice(0, cut));
  const last = paceOf(ordered.slice(ordered.length - cut));
  const driftSkm = last - first;
  const margin = first * PACING_SHAPE_MARGIN;

  if (driftSkm > margin) return 'se_te_fue';
  if (driftSkm < -margin) return 'de_menos_a_mas';
  return 'aguantaste';
}

export interface PacingShapeSummary {
  /** Sesiones con forma legible — las que pasaron el mínimo de tramos. Un
   *  rodaje uniforme, o una serie corta, no entra aquí (nunca en el total). */
  total: number;
  aguantaste: number;
  de_menos_a_mas: number;
  se_te_fue: number;
}

/** Agrega los veredictos (ya resueltos, uno por sesión) de una ventana de
 *  semanas. Los `null` de `sessionPacingShape` NUNCA llegan aquí — el caller
 *  los descarta antes: una sesión sin forma legible no es un cuarto cubo. */
export function summarizePacingShape(verdicts: readonly PacingShapeVerdict[]): PacingShapeSummary {
  let aguantaste = 0;
  let de_menos_a_mas = 0;
  let se_te_fue = 0;
  for (const v of verdicts) {
    if (v === 'aguantaste') aguantaste++;
    else if (v === 'de_menos_a_mas') de_menos_a_mas++;
    else se_te_fue++;
  }
  return { total: verdicts.length, aguantaste, de_menos_a_mas, se_te_fue };
}
