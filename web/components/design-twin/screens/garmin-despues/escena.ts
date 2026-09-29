// LA ESCENA — cómo empieza cada escenario de «Garmin · al terminar». Tipos.
//
// Cada escenario entra por una fase del flujo y desde ahí se sigue con los
// cinco botones:
//
//   vivo ─(el motor cierra el último paso, o Terminar)─▶ fin ─Guardar─▶ rpe ─▶ resumen ─Listo─▶ salida
//    ▲                                                     │
//    └──────────────── Seguir (enfriamiento libre) ────────┘
//
// Lo asíncrono de verdad (los acuses del envío) va con tiempos de guion; lo
// demás es estado normal.

import type { BotonGarmin } from '../../kit-garmin';
import type { InicioSecuencia, MetodoResumen, Simulador } from '../../kit-reloj';
import type { Resultado } from '../reloj-antes-despues/calculo';
import type { Sesion } from '../reloj-antes-despues/sesiones';
import type { EstadoEnvio } from './envio';

export type FaseId = 'vivo' | 'fin' | 'rpe' | 'resumen';

export type Arranque =
  | { en: 'vivo'; inicio: InicioSecuencia; sim: Simulador }
  /** Ya en la pantalla de fin con este resultado. `recuperada`: la app murió y se recuperó (G07). */
  | { en: 'fin'; r: Resultado; natural?: boolean; recuperada?: boolean }
  | { en: 'rpe' | 'resumen'; r: Resultado }
  /** Ya en el enfriamiento libre tras «Seguir» (la sesión `r` ya cerrada), con su cuerpo. */
  | { en: 'seguir'; r: Resultado; sim: Simulador };

/** Un cambio del estado de envío a los `en` ms de abrirse el resumen. */
export interface AcuseEnvio {
  en: number;
  estado: EstadoEnvio;
}

export interface Escena {
  /** La sesión de hoy: su plan y su familia (decide qué resumen se pinta). */
  sesion: Sesion;
  arranque: Arranque;
  /** El resultado de la sesión entera cuando el escenario empieza con ella avanzada. */
  base?: Resultado | null;
  /** Botones guionizados por fase: pasan por el MISMO camino que la tecla. */
  guiones?: Partial<Record<FaseId, Array<{ en: number; boton: BotonGarmin }>>>;
  /** Del vivo: abrir en Controles. */
  inicialVivo?: { controles?: boolean };
  /** Cómo llega el envío al abrirse el resumen (por defecto, en el reloj) y qué le pasa después. */
  envio?: { inicial?: EstadoEnvio; acuses?: AcuseEnvio[] };
  inicialResumen?: { pagina?: number };
  metodo?: MetodoResumen;
  /**
   * SOLO en el doble: segundos de inactividad que cuenta cada segundo real,
   * para enseñar en un escenario los 10′ del guardado solo. Se dice en su descripción.
   */
  compresion?: number;
}
