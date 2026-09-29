// EL PANEL — el sobre único de las analíticas del atleta (modelo §5).
//
// UN CÁLCULO, DOS PINTORES (A1). La ruta del atleta y la del coach devuelven
// EXACTAMENTE este objeto para el mismo atleta y ventana; el coach añade capas,
// nunca otra cifra. Cada bloque es una LISTA de lecturas (`./lectura`): el
// cliente dibuja las que conoce por `id` y forma del dato, e ignora las que no.
//
// LOS BLOQUES QUE AÚN NO SE SIRVEN VIAJAN COMO PENDIENTES, no como listas
// vacías mudas: una lista vacía es una respuesta legítima («no hay nada que
// decir»), y el cliente tiene que poder distinguirla de «este bloque todavía no
// está construido». Por eso `pendientes` nombra los bloques que hoy vienen
// vacíos por construcción y no por dato.
//
// Puro: tipos y ensamblado. El cargador que lo llena es `web/lib/analytics/panel.ts`.

import type { CoachAnalyticsMethod } from './metodo';
import type { Lectura } from './lectura';
import type { Hecho } from './hechos';
import type { Historia, VentanaResuelta } from './ventana';
import type { AnclasAtleta } from './anclas';

/** Los ocho bloques del panel (modelo §3), en el orden en que se enseñan. */
export const BLOQUES_PANEL = [
  'estado',
  'forma',
  'semanas',
  'intensidad',
  'progreso',
  'records',
  'carrera',
  'recuperacion',
] as const;

export type BloquePanel = (typeof BLOQUES_PANEL)[number];

export type BloquesPanel = Record<BloquePanel, Lectura[]>;

export interface PanelAnaliticas {
  athlete_id: string;
  generado_iso: string;
  ventana: VentanaResuelta;
  /** Cuánta historia hay DE VERDAD, y si la ventana la abarca entera. */
  historia: Historia;
  /**
   * El método del coach REALMENTE usado. Viaja para que el cliente pueda escribir
   * «avisa a partir de +5» o pintar las bandas de frescura sin volver a
   * resolverlo ni, mucho peor, cablearlo (HARD RULE Nº0).
   */
  metodo: CoachAnalyticsMethod;
  /**
   * Los umbrales del atleta tal como se han resuelto, con su peldaño. El cliente
   * los enseña («umbral de pulso: 168, medido») y ofrece el toque para declarar
   * el que falte.
   */
  anclas: AnclasAtleta;
  bloques: BloquesPanel;
  /** Bloques que hoy vienen vacíos POR CONSTRUCCIÓN (aún no servidos), no por dato. */
  pendientes: BloquePanel[];
  /** Lo que el panel puede AFIRMAR, en lenguaje de atleta, con las lecturas de las que sale. */
  hechos: Hecho[];
}

/** Los ocho bloques, vacíos. Quien ensambla rellena los que sirve. */
export function bloquesVacios(): BloquesPanel {
  return {
    estado: [],
    forma: [],
    semanas: [],
    intensidad: [],
    progreso: [],
    records: [],
    carrera: [],
    recuperacion: [],
  };
}

/** Todas las lecturas del panel en una lista plana (para los hechos y los tests). */
export function lecturasDelPanel(bloques: BloquesPanel): Lectura[] {
  return BLOQUES_PANEL.flatMap((b) => bloques[b]);
}

/**
 * Ningún id se repite en el panel entero: el cliente reconoce una lectura por
 * él, y dos lecturas con el mismo id son una que se pinta dos veces con datos
 * distintos. Devuelve los repetidos (vacío = bien).
 */
export function idsRepetidos(bloques: BloquesPanel): string[] {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const l of lecturasDelPanel(bloques)) {
    if (vistos.has(l.id)) repetidos.add(l.id);
    vistos.add(l.id);
  }
  return [...repetidos].sort();
}
