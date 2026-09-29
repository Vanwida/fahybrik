// LAS PANTALLAS DE «ANTES» Y SU MÁQUINA — qué pantalla es, con qué teclas, y qué
// es un escenario. PURO (solo tipos y tablas).
//
//   glance ─START─▶ brief ─START─▶ (aviso previo) ─▶ (espera GPS) ─▶ 3-2-1 ─▶ vivo
//      │              ▲ BACK │ DOWN ▶ estructura completa (UP/DOWN, y en el borde BACK ▶ brief)
//      │                                                             └─BACK/START─▶ brief
//      ├─▶ lista (varias sesiones) ─START─▶ brief
//      ├─▶ hoy no toca / sin plan ─START─▶ entreno libre ─▶ … ─▶ vivo
//      └─▶ sin detalle (sin Empezar)
//   brief ─UP largo─▶ ajustes ─▶ desvincular ─▶ vincular (código) ─▶ vinculado ─▶ glance
//   arranque con la app muerta ─▶ sesión interrumpida ─▶ Seguir (3-2-1) | Guardar lo hecho
//
// LAS CINCO TECLAS. Las pantallas de una sesión usan la fila «Brief (una sesión)» de
// §5 (START Empezar · BACK Atrás · UP cambiar entorno, solo si el plan no lo fija ·
// DOWN Estructura completa · UP largo Ajustes); las listas de elegir (varias sesiones,
// entreno libre), la fila «Lista del día» (elegir · atrás · anterior · siguiente ·
// Ajustes); los MENÚS (Ajustes, sesión interrumpida), la de «Controles»; la 3-2-1, la
// de «Cancelar», y el final de una sesión rescatada, la de «Resumen». `ESTADO_DE_PANTALLA`
// lo dice y el examen lo comprueba contra la tabla del documento.
//
// UNA TECLA QUE NO HACE NADA NO SE ROTULA: un glance no «Empieza», una espera de GPS
// no «Cambia de entorno». `teclasDe` dice, pantalla a pantalla, qué celdas de la fila
// se rotulan distinto (con la palabra de lo que hacen ahí) o «sin efecto».
//
// Qué NO hacer: resolver una tecla con un `if` propio en una vista (la decide
// `flujo.tsx` según la pantalla, y solo hace lo que la fila de §5 dice); dar un
// estado de mandos que no esté en `EstadoMandos`.

import type { BotonGarmin, EstadoMandos, Mando } from '../../kit-garmin';
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
  | { p: 'estructura'; k: number }
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
  lista: 'lista-del-dia',
  brief: 'brief',
  estructura: 'brief',
  previo: 'brief',
  espera: 'brief',
  cuenta: 'cuenta',
  vivo: 'paso',
  'no-toca': 'brief',
  'sin-plan': 'brief',
  'sin-detalle': 'brief',
  ajustes: 'controles',
  libre: 'lista-del-dia',
  vincular: 'brief',
  interrumpida: 'controles',
  guardada: 'resumen',
};

/** Lo que una pantalla rotula distinto de la fila de §5 que la rige: el rótulo de lo que hace ahí, o `null` = sin efecto. Lo que no aparece, lo dice la tabla. */
export type Teclas = Partial<Record<BotonGarmin, string | null>>;

/**
 * Las celdas que esta pantalla afina. El estado (`ESTADO_DE_PANTALLA`) da la fila
 * de §5; aquí solo lo que no es literalmente esa fila: donde una tecla hace otra
 * cosa (el glance abre la app, la espera sale sin GPS) o no hace nada. `elegible` =
 * el plan deja elegir el entorno (UP del brief).
 */
export function teclasDe(p: Pantalla, elegible: boolean): Teclas {
  switch (p.p) {
    case 'glance':
      return { start: 'Abrir', back: 'Salir', up: null, down: null, upLargo: null };
    case 'brief':
      return elegible ? {} : { up: null };
    case 'estructura':
      return { up: 'Arriba', down: 'Abajo', upLargo: null };
    case 'previo':
      return { start: p.cola.length > 1 ? 'Seguir' : 'Empezar', up: null, down: null, upLargo: null };
    case 'espera':
      return { start: 'Sin GPS', up: null, down: null, upLargo: null };
    case 'no-toca':
    case 'sin-plan':
      return { start: 'Libre', back: 'Salir', up: null, down: null };
    case 'sin-detalle':
      return { start: null, back: 'Salir', up: null, down: null, upLargo: null };
    case 'vincular':
      return { start: p.estado.tipo === 'vinculado' ? null : 'Otro código', back: 'Salir', up: null, down: null, upLargo: null };
    case 'interrumpida':
      return { back: 'Salir' };
    case 'guardada':
      return { start: 'Hecho', back: 'Hecho', up: null, down: null };
    default:
      return {};
  }
}

/** La celda que ve la carcasa: la de la tabla con el rótulo de esta pantalla, o ninguna si aquí no hace nada. */
export function mandoDePantalla(p: Pantalla, elegible: boolean, boton: BotonGarmin, porTabla: Mando | null): Mando | null {
  const t = teclasDe(p, elegible)[boton];
  if (t === undefined || boton === 'light') return porTabla;
  if (t === null) return null;
  return { accion: porTabla?.accion ?? 'elegir', dice: porTabla?.dice ?? t, rotulo: t };
}

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
