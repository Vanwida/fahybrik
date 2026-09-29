// LAS PANTALLAS DE «ANTES» Y SU MÁQUINA — qué pantalla es, con qué teclas, y qué
// es un escenario. PURO (solo tipos y tablas).
//
//   glance ─START─▶ brief ─START─▶ (aviso previo) ─▶ (espera GPS) ─▶ 3-2-1 ─▶ vivo
//      │              ▲ BACK                                         └─BACK/START─▶ brief
//      ├─▶ lista (varias sesiones) ─START─▶ brief
//      ├─▶ hoy no toca / sin plan ─START─▶ entreno libre ─▶ … ─▶ vivo
//      └─▶ sin detalle (sin Empezar)
//   brief ─UP largo─▶ ajustes ─▶ desvincular ─▶ vincular (código) ─▶ vinculado ─▶ glance
//   arranque con la app muerta ─▶ sesión interrumpida ─▶ Seguir (3-2-1) | Guardar lo hecho
//
// LAS CINCO TECLAS. Todas las pantallas de antes de la sesión usan la fila «Brief»
// de §5 del modelo (START Empezar · BACK Atrás · UP/DOWN anterior y siguiente · UP
// largo Ajustes), salvo los MENÚS (Ajustes, sesión interrumpida), que usan la de
// «Controles» (elegir · cerrar · anterior · siguiente), la 3-2-1 (Cancelar) y el
// final de una sesión rescatada (la de «Resumen»). `ESTADO_DE_PANTALLA` lo dice, y el
// examen lo comprueba contra la tabla del documento.
//
// Qué NO hacer: resolver una tecla con un `if` propio en una vista (la decide
// `flujo.tsx` según la pantalla, y solo hace lo que la fila de §5 dice); dar un
// estado de mandos que no esté en `EstadoMandos`.

import type { EstadoMandos } from '../../kit-garmin';
import type { InicioSecuencia, PlanSesion, Simulador, Vuelta, Entorno } from '../../kit-reloj';
import type { Sesion } from '../reloj-antes-despues/sesiones';
import type { AvisoDeAntes } from './previo';
import type { Ajustes, Hoy, PuntoDeControl, Sistema } from './estado';
import type { EstadoVinculo } from './vinculo';

/** La capa de Ajustes que está abierta: el menú, el entorno por defecto, o la confirmación de desvincular. */
export type CapaAjustes = 'raiz' | 'entorno' | 'desvincular';

export type Pantalla =
  | { p: 'glance' }
  | { p: 'lista'; foco: number }
  | { p: 'brief'; k: number }
  | { p: 'previo'; k: number; cola: AvisoDeAntes[] }
  | { p: 'espera'; entorno: Entorno; plan: PlanSesion; inicio: InicioSecuencia; vuelve: Pantalla }
  | { p: 'cuenta'; n: number; plan: PlanSesion; inicio: InicioSecuencia; sinGps: boolean; vuelve: Pantalla }
  | { p: 'vivo'; plan: PlanSesion; inicio: InicioSecuencia; sim: Simulador }
  | { p: 'no-toca' }
  | { p: 'sin-plan' }
  | { p: 'sin-detalle' }
  | { p: 'ajustes'; capa: CapaAjustes; foco: number; vuelve: Pantalla }
  | { p: 'libre'; foco: number; vuelve: Pantalla }
  | { p: 'vincular'; estado: EstadoVinculo }
  | { p: 'interrumpida'; foco: number }
  | { p: 'guardada' };

export type IdPantalla = Pantalla['p'];

/** El estado de §5 que rige las cinco teclas en cada pantalla. */
export const ESTADO_DE_PANTALLA: Record<IdPantalla, EstadoMandos> = {
  glance: 'brief',
  lista: 'brief',
  brief: 'brief',
  previo: 'brief',
  espera: 'brief',
  cuenta: 'cuenta',
  vivo: 'paso',
  'no-toca': 'brief',
  'sin-plan': 'brief',
  'sin-detalle': 'brief',
  ajustes: 'controles',
  libre: 'brief',
  vincular: 'brief',
  interrumpida: 'controles',
  guardada: 'resumen',
};

/**
 * Los únicos avisos (§6) que emite esta familia: «GPS listo», el 3-2-1 y el GO. Las
 * tarjetas de antes de salir no suenan (§6 no tiene fila para un aviso previo). El
 * examen lee `flujo.tsx` y comprueba que no emite nada que no esté aquí.
 */
export const EVENTOS_DE_ANTES = ['gps', 'cuenta', 'go'] as const;

/** Un botón guionizado de un escenario: pasa por el mismo camino que la tecla. */
export interface Toque {
  en: number;
  boton: 'start' | 'back' | 'up' | 'down' | 'upLargo';
}

/** El vínculo de un escenario: el código que da el servidor y cuándo lo acepta el móvil. */
export interface EscenaVinculo {
  codigo: string;
  restanteS: number;
  /** ms hasta que el móvil acepta el código; `null` = nunca (caduca). */
  apruebaEn: number | null;
  /** El código nuevo que da el servidor si se pide otro. */
  siguiente: string;
}

/** La sesión que la app dejó a medias: la sesión y el último punto de control. */
export interface EscenaRescate {
  sesion: Sesion;
  control: PuntoDeControl;
  vueltas: Vuelta[];
  ppmMedio: number;
}

export interface Escena {
  hoy: Hoy;
  /** Lo que lee el reloj al abrir. */
  sistema: Sistema;
  ajustes: Ajustes;
  arranque: Pantalla;
  /** ms desde que se abre el brief hasta que fija el GPS (si empieza buscando); `null` = no fija en el escenario. */
  gpsEn: number | null;
  /** ms hasta que el óptico fija el pulso (si empieza «fijando»). */
  pulsoEn: number | null;
  ppmAlFijar: number;
  guion: Toque[];
  vinculo?: EscenaVinculo;
  rescate?: EscenaRescate;
  /** Los cuatro tamaños a la vez, con la pantalla de arranque quieta. */
  comparar?: boolean;
  /** Varios estados del glance a la vez, en un solo reloj. */
  estadosDeGlance?: Hoy[];
  /** Entorno con el que sale ya elegido (para el escenario del entorno). */
  entornoInicial?: Entorno | null;
}
