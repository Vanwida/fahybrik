// EL CÁLCULO DEL DESPUÉS — lo propio del resumen de esta pantalla, PURO.
//
// Lo genérico ya es del kit (el Swift lo espeja allí): la completitud y el
// coste de la carrera comprometida (`kit-reloj/despues.ts`, con el método del
// coach en `METODO_RESUMEN_DEFECTO`) y la estructura en líneas de dato
// (`kit-reloj/estructura.ts`: `filasDePasos`, `lineaBrief`, `hoyDe`,
// `paginar`). Aquí queda el `Resultado` que sella la muñeca al guardar y las
// cuentas de fuerza del resumen.

import type { HechoSesion, PasoBase, TramoHecho, Vuelta, ZonasCoach } from '../../kit-reloj';

/**
 * El estado de guardado, con el mismo lenguaje que el móvil (DECISIONS
 * 25-09, acuses del reloj): el sobre sigue en el reloj hasta que el móvil
 * acusa `held` (en su cola, sin cobertura), `saved` (el servidor dijo 2xx) o
 * `rejected` (4xx: «Guardado en tu móvil»). Nunca «Guardado en el iPhone»
 * mientras solo esté en cola.
 */
export type EstadoGuardado = 'en-reloj' | 'en-cola' | 'guardado' | 'en-movil';

/** Un km de la vuelta automática, con su desnivel (+ sube, − baja). */
export interface KmHecho extends Vuelta {
  /** `null` = sin barómetro en esa vuelta (no se inventa un cero). */
  desnivel: number | null;
}

/** Una serie de fuerza tal como quedó: lo prescrito por defecto no cuenta como declarado hasta confirmarlo (P11). */
export interface SerieFuerza {
  reps: number | null;
  /** kg por implemento: 2 mancuernas de 20 → kg 20, implementos 2. */
  kg: number | null;
  implementos?: number;
  rir: number | null;
  confirmada: boolean;
  /** Series por tiempo (el trineo): lo que tardó. */
  segundos?: number;
}

export interface EjercicioHecho {
  /** El paso prescrito (el de la primera serie): nombre, slot, dosis, objetivos, carga. */
  paso: PasoBase;
  series: SerieFuerza[];
}

/** Lo que decide la completitud (`HechoSesion`: pasos, i, final, series) es del kit. */
export interface Resultado extends HechoSesion {
  zonas: ZonasCoach;
  t: number;
  metros: number | null;
  ppmMedio: number | null;
  ppmMax: number | null;
  desnivel: number | null;
  /** Segundos en cada zona del coach, de Z1 a ZN. */
  zonasS: number[];
  km: KmHecho[];
  fuerza: EjercicioHecho[];
  circuito: TramoHecho[];
  /** Total de Roxzone; `null` = el coach no la activó en esta sesión. */
  roxzoneS: number | null;
  rpe: number | null;
  guardado: EstadoGuardado;
  /** Enfriamiento libre grabado tras «Seguir», en s. */
  libreS: number;
}

// ---------------------------------------------------------------------------
// Fuerza
// ---------------------------------------------------------------------------

/** kg por serie contando implementos (2 × 20 kg = 40). */
export function kgSerie(e: EjercicioHecho, s: SerieFuerza): number | null {
  return s.kg == null ? null : s.kg * (s.implementos ?? e.paso.carga?.implementos ?? 1);
}

/** Volumen de un ejercicio: Σ reps × kg (lo que no lleva carga no suma; el trineo, tampoco: es por metros). */
export function volumen(e: EjercicioHecho): number {
  if (e.paso.medida.tipo !== 'reps') return 0;
  return e.series.reduce((a, s) => a + (s.reps ?? 0) * (kgSerie(e, s) ?? 0), 0);
}

/** La serie más pesada: la de más kg; a igual kg, la de más reps. */
export function masPesada(e: EjercicioHecho): SerieFuerza | null {
  return e.series.reduce<SerieFuerza | null>((m, s) => {
    if (s.kg == null) return m;
    if (!m || s.kg > (m.kg ?? 0) || (s.kg === m.kg && (s.reps ?? 0) > (m.reps ?? 0))) return s;
    return m;
  }, null);
}

/** «9 872» — miles con espacio fino, como en el móvil. */
export function miles(n: number): string {
  return Math.round(n).toLocaleString('es-ES').replace(/\./g, ' ');
}
