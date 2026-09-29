// LOS TIPOS DEL PLAN COMPACTO — la cabecera que viaja con los pasos.
//
// `PlanSesion` (kit-reloj/secuencia.ts) es el contrato del motor y lleva TODO
// lo que el reloj muestra o decide: pasos, zonas (con su procedencia), reglas
// de aviso, vocabulario del coach, método, bandas de ritmo y la pareja de
// dobles (HARD RULE Nº0: ninguna constante de método en el reloj). Aquí solo
// queda lo que es de la sesión y no del plan: la cabecera (`MetaSesion`).
//
// QUÉ NO HACER: no poner aquí valores por defecto. Un plan que sale del
// servidor lleva TODO lo que el reloj muestra o decide; si falta algo, el
// codificador lo rechaza (`vocabulario-incompleto`, `metodo-ausente`) en vez
// de dejar que el reloj invente. Los defectos los pone el constructor del
// servidor (`completarPlan`, meta.ts), no el reloj.

import type { Entorno } from '../../kit-reloj/paso';
import type { PlanSesion } from '../../kit-reloj/secuencia';

// El contrato del método vive en el kit (`kit-reloj/metodo.ts`, `paso.ts`); se
// re-exporta para que quien importe el códec no busque en dos sitios.
export type { MetodoReloj, NombreClase, RangoAnotar, Vocabulario } from '../../kit-reloj/metodo';
export type { BandaRitmo, BandasRitmo } from '../../kit-reloj/paso';

export interface MetaSesion {
  /** Id de la asignación: lo que el resultado devuelve al servidor. */
  asignacionId: number;
  /** Huella de la versión del plan (31 bits, opaca para el reloj): el resultado dice con cuál se hizo. */
  huella: number;
  /** Deporte y subdeporte del FIT: dato del servidor (mapa A4), opaco para el reloj. */
  fitSport: number;
  fitSubSport: number;
  /** Dónde se hace la sesión si es una sola cosa para todos los pasos; `null` = mixto o sin decir. */
  entorno: Entorno | null;
  duracionEstS: number;
}

/** Lo que sale de decodificar: la cabecera y el plan tal como los entiende el motor. */
export interface SesionCompacta {
  meta: MetaSesion;
  plan: PlanSesion;
}
