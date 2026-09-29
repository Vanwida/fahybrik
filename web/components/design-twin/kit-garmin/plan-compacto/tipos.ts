// LOS TIPOS DEL PLAN COMPACTO — lo que viaja además de los pasos.
//
// `PlanSesion` (kit-reloj/secuencia.ts) es el contrato del motor: pasos +
// zonas + reglas. El reloj necesita más para ser un reproductor sin
// constantes de método (HARD RULE Nº0): la cabecera de la sesión, la
// procedencia de las bandas, el vocabulario del coach y los rangos de
// anotación. Eso es `MetaSesion`. Hoy `PlanSesion` no tiene dónde llevarlo
// (el kit lee los `*_DEFECTO` directamente en una veintena de sitios): es el
// hueco nº 1 del doc y por eso viaja aparte. Cuando el contrato suba a
// `shared/domain/watch-plan/`, `MetaSesion` se pliega dentro del plan.
//
// QUÉ NO HACER: no poner aquí valores por defecto. Un plan que sale del
// servidor lleva TODO lo que el reloj muestra o decide; si falta algo, el
// codificador lo rechaza (`vocabulario-incompleto`) en vez de dejar que el
// reloj invente.

import type { Clase, Entorno } from '../../kit-reloj/paso';
import type { MetodoResumen } from '../../kit-reloj/despues';
import type { PlanSesion } from '../../kit-reloj/secuencia';
import type { FormatoNombrado, Procedencia, UnidadRitmo } from './formato';

/** El nombre de una clase de paso y su género («Serie 2 cerrada» / «Tramo 3 cerrado»): dato del coach. */
export interface NombreClase {
  nombre: string;
  femenino: boolean;
}

export interface Vocabulario {
  /** Solo las clases que usa la sesión (el servidor recorta): el reloj no conoce ningún defecto. */
  clases: Partial<Record<Clase, NombreClase>>;
  /** Los siete formatos con nombre (`NOMBRE_FORMATO_DEFECTO`), siempre completos. */
  formatos: Record<FormatoNombrado, string>;
  /** Las 11 palabras del RPE de fin de sesión, de 0 a 10. */
  rpe: string[];
}

/** Hasta dónde llega la corona al anotar una serie (método del coach). */
export interface RangoAnotar {
  repsDeMas: number;
  rpe: { min: number; max: number; paso: number };
  rir: { min: number; max: number; paso: number };
  kgMax: number;
}

/** Lo que el reloj decide al terminar y al anotar: método del coach, con defecto. */
export interface MetodoReloj {
  resumen: MetodoResumen;
  anotar: RangoAnotar;
}

/** Una zona de ritmo en segundos por unidad: la cota rápida y la lenta (`null` = abierta, la Z1). */
export interface BandaRitmo {
  rapidoS: number;
  lentoS: number | null;
}

/** El juego de bandas de ritmo de una modalidad, del más fácil al más duro, con de dónde sale. */
export interface BandasRitmo {
  unidad: UnidadRitmo;
  procedencia: Procedencia;
  zonas: BandaRitmo[];
}

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
  /** La estructura en una línea (brief y glance). Texto derivado de los pasos: ver «Huecos» del doc. */
  estructura: string;
  /** De dónde salen las zonas de pulso de `plan.zonas`; `null` solo si `plan.zonas` es `null`. */
  procedenciaPpm: Procedencia | null;
  /** Bandas de ritmo del atleta en s/km y/o s/500 m. */
  bandasRitmo: BandasRitmo[];
  vocabulario: Vocabulario;
  metodo: MetodoReloj;
}

/** Lo que sale de decodificar: la cabecera y el plan tal como los entiende el motor. */
export interface SesionCompacta {
  meta: MetaSesion;
  plan: PlanSesion;
}
