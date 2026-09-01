// @fahybrid/shared/domain/coach/hr-method — EL MÉTODO DE FRECUENCIA CARDIACA
// DEL COACH. Dónde cortan sus bandas y qué reparto persigue.
//
// POR QUÉ EXISTE ESTE FICHERO (HARD RULE Nº0: mecanismo vs método)
// ---------------------------------------------------------------
// Clasificar un latido en una banda es MECANISMO: `zoneForBpm` lo hace igual
// para todos los entrenadores y vive en `methodology/hr-zones.ts`. DÓNDE cortan
// esas bandas es MÉTODO. La pregunta que decide («¿otro entrenador competente lo
// haría distinto?») da que sí en los tres números que este módulo saca de
// `const` y convierte en dato:
//
//   1. las fracciones de LTHR donde empieza y acaba cada zona,
//   2. dónde se pliegan las cinco zonas en las tres bandas de polarización
//      (hay escuelas que ponen Z3 en el medio y otras que la suben al alto),
//   3. el reparto que el coach persigue — el 80/0/20 que hasta hoy estaba
//      escrito DOS veces: en `coach/polarization.ts` y otra vez, con otro
//      nombre, en `dashboard/coach/deep-dive-performance.ts`.
//
// Los defectos son los nuestros de hoy, así que un coach que no toca nada se
// comporta exactamente igual que antes de esta obra. Mismo patrón que
// `signal-thresholds.ts` (mig 0161): interfaz plana que espeja la fila, defectos
// AQUÍ y nunca como `default` de columna, y el resolutor de web mezcla la fila
// del coach sobre estos valores.
//
// Puro y sin base de datos, como todo `shared/domain`.

// El reparto por resto mayor ya está escrito y probado en el presupuesto de
// carrera, que resuelve exactamente el mismo problema (repartir un total entero
// entre N fracciones sin perder ni ganar una unidad). Se reutiliza en vez de
// escribir un segundo redondeo que se comportaría distinto en los empates.
import { largestRemainder } from '../goal-gap/budget';
import { DEFAULT_HR_ZONE_FRACTIONS, HR_ZONES, type HrZoneFractions } from '../methodology/hr-zones';
import type { ZoneSecondsByZone } from '../methodology/time-in-zone';

/** Una tarta son 100 puntos. */
const PCT_TOTAL = 100;

/** El reparto en tres bandas: fácil, medio, duro. Suma 100. */
export interface PolarizationSplit {
  low: number;
  mid: number;
  high: number;
}

/**
 * Una fila de `coach_hr_method` (única por `coach_id`). Plana a propósito: es
 * exactamente la fila, para que el resolutor no tenga que traducir nada y el
 * editor y el motor no puedan discrepar sobre qué campo es cuál.
 *
 * Las fracciones son del LTHR, no del máximo (ver `hr-zones.ts` sobre por qué el
 * umbral es el ancla). Z1 no tiene suelo — no hay suelo para ir suave — así que
 * no existe `z1_lo_frac`.
 */
export interface CoachHrMethod {
  z1_hi_frac: number;
  z2_lo_frac: number;
  z2_hi_frac: number;
  z3_lo_frac: number;
  z3_hi_frac: number;
  z4_lo_frac: number;
  z4_hi_frac: number;
  z5_lo_frac: number;
  z5_hi_frac: number;
  /** Última zona que cuenta como trabajo FÁCIL (por defecto Z2). */
  polarization_low_max_zone: number;
  /** Última zona que cuenta como zona MEDIA (por defecto Z4; de ahí arriba, dura). */
  polarization_mid_max_zone: number;
  polarization_low_pct: number;
  polarization_mid_pct: number;
  polarization_high_pct: number;
}

/**
 * Los defectos del sistema. Las nueve fracciones son las de
 * `DEFAULT_HR_ZONE_FRACTIONS` — misma fuente, sin copiar un número a mano — y el
 * reparto es el 80/0/20 polarizado clásico: casi todo por debajo del primer
 * umbral, nada en la zona gris, lo que queda por encima.
 *
 * Genéricos y sin nombre propio: son el punto de partida más común del sector,
 * jamás los números de una metodología concreta.
 */
export const DEFAULT_COACH_HR_METHOD: CoachHrMethod = {
  z1_hi_frac: DEFAULT_HR_ZONE_FRACTIONS[1].hi,
  z2_lo_frac: DEFAULT_HR_ZONE_FRACTIONS[2].lo,
  z2_hi_frac: DEFAULT_HR_ZONE_FRACTIONS[2].hi,
  z3_lo_frac: DEFAULT_HR_ZONE_FRACTIONS[3].lo,
  z3_hi_frac: DEFAULT_HR_ZONE_FRACTIONS[3].hi,
  z4_lo_frac: DEFAULT_HR_ZONE_FRACTIONS[4].lo,
  z4_hi_frac: DEFAULT_HR_ZONE_FRACTIONS[4].hi,
  z5_lo_frac: DEFAULT_HR_ZONE_FRACTIONS[5].lo,
  z5_hi_frac: DEFAULT_HR_ZONE_FRACTIONS[5].hi,
  polarization_low_max_zone: 2,
  polarization_mid_max_zone: 4,
  polarization_low_pct: 80,
  polarization_mid_pct: 0,
  polarization_high_pct: 20,
};

/** Los defectos, en copia fresca (quien llama puede esparcir y mutar). */
export function defaultCoachHrMethod(): CoachHrMethod {
  return { ...DEFAULT_COACH_HR_METHOD };
}

/** Las claves editables, para recorrerlas sin repetir la lista a mano. */
export const COACH_HR_METHOD_KEYS = Object.keys(DEFAULT_COACH_HR_METHOD) as Array<
  keyof CoachHrMethod
>;

/** El reparto que el coach persigue, sacado de su método. */
export function polarizationTargetFrom(method: CoachHrMethod): PolarizationSplit {
  return {
    low: method.polarization_low_pct,
    mid: method.polarization_mid_pct,
    high: method.polarization_high_pct,
  };
}

/**
 * Las bandas del coach en la forma que `resolveHrZones` entiende. Es la ÚNICA
 * traducción entre la fila plana y el modelo de zonas, así que nadie más tiene
 * que saber cómo se llaman las columnas.
 */
export function hrZoneFractionsFrom(method: CoachHrMethod): HrZoneFractions {
  return {
    // Z1 arranca en 0 por definición del modelo, no por decisión del coach.
    1: { lo: 0, hi: method.z1_hi_frac },
    2: { lo: method.z2_lo_frac, hi: method.z2_hi_frac },
    3: { lo: method.z3_lo_frac, hi: method.z3_hi_frac },
    4: { lo: method.z4_lo_frac, hi: method.z4_hi_frac },
    5: { lo: method.z5_lo_frac, hi: method.z5_hi_frac },
  };
}

/**
 * Plegar las cinco zonas en las tres bandas de polarización, por donde el coach
 * dice que se pliegan. Puro, para que el mismo reparto salga igual en SQL, en la
 * ficha y en el test.
 */
export function collapseToPolarization(
  seconds: ZoneSecondsByZone,
  method: CoachHrMethod,
): PolarizationSplit {
  let low = 0;
  let mid = 0;
  let high = 0;
  for (const zone of HR_ZONES) {
    const s = seconds[zone] ?? 0;
    if (zone <= method.polarization_low_max_zone) low += s;
    else if (zone <= method.polarization_mid_max_zone) mid += s;
    else high += s;
  }
  return { low, mid, high };
}

/**
 * El reparto en porcentajes enteros que suman 100 EXACTAMENTE.
 *
 * Por resto mayor y no zona a zona: tres `Math.round` independientes dan 34/33/34
 * según caiga, y una tarta que no suma 100 en la pantalla del coach se lee como
 * un fallo de cálculo. Null cuando no hay ni un segundo clasificado — «no se
 * sabe» nunca es un 0/0/0.
 */
export function polarizationPct(split: PolarizationSplit): PolarizationSplit | null {
  const total = split.low + split.mid + split.high;
  if (total <= 0) return null;
  const [low = 0, mid = 0, high = 0] = largestRemainder(
    [split.low / total, split.mid / total, split.high / total],
    PCT_TOTAL,
  );
  return { low, mid, high };
}

/**
 * Cuánto se ha desviado un reparto del objetivo del coach, en puntos.
 *
 * Σ|actual − objetivo| sobre las tres bandas, que es la lectura que ya usa la
 * ficha del atleta. Un reparto y su objetivo suman 100 los dos, así que la suma
 * de desviaciones cuenta cada punto movido dos veces: da 0 cuando coinciden y
 * 200 en el extremo opuesto, y lo que importa es comparar una semana con otra.
 */
export function polarizationDriftFrom(
  split: PolarizationSplit,
  target: PolarizationSplit,
): number {
  return (
    Math.abs(split.low - target.low) +
    Math.abs(split.mid - target.mid) +
    Math.abs(split.high - target.high)
  );
}
