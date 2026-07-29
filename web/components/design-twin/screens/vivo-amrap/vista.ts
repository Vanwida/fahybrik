// El contrato entre el estado del AMRAP y sus dos caras.
//
// Existe para que «girar no reinicia nada» sea verdad por construcción y no
// por disciplina: el estado (la ventana, las rondas, el cursor, el monitor)
// vive UNA vez en `escena-viva.tsx`, y vertical y horizontal son dos maneras
// de pintarlo. Ninguna de las dos guarda estado propio ni puede desviarse.

import type { Cara, LecturaErg } from './data';

export interface ComparaVista {
  indice: number;
  texto: string;
  deltaS: number;
}

export interface VistaViva {
  /** Rondas cerradas: el marcador. */
  rondas: number;
  /** Reps marcadas de la ronda en curso. */
  repsMarcadas: number;
  /** Movimientos marcados (0 a 3): el cursor. */
  marcados: number;
  /** Qué manda en esta cara, según el tramo (`data.caraDe`). */
  cara: Cara;
  /** La ventana que queda, con ancho fijo. */
  ventanaTexto: string;
  /** La ventana entera: la prescripción. */
  ventanaTotalTexto: string;
  /** 0 en faena; 1 al llegar a cero. */
  tension: number;
  /** Los diez últimos segundos. */
  remate: boolean;
  /** Lo que dice la pantalla cuando aprieta. Nulo el resto del tiempo. */
  aliento: string | null;
  /** Fracción de ventana que queda, para el aro. */
  fraccion: number;
  /** Tu ronda anterior contra la primera de hoy. Nulo con una sola. */
  compara: ComparaVista | null;
  /** Del reloj. Nulo si no hay reloj: entonces no se pinta nada. */
  pulsoPpm: number | null;
  /** Lo que marca el monitor en este tramo. Nulo si no lo mide o no está. */
  erg: LecturaErg | null;
  pausado: boolean;
  onCerrarRonda: () => void;
  onMarcar: (indice: number) => void;
  onPausa: () => void;
  onSalir: () => void;
  onSeguir: () => void;
}
