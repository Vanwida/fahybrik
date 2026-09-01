// LA VENTANA — cuánto se mira hacia atrás, y cuánta historia hay de verdad.
//
// POR QUÉ EL TOPE DEJA DE SER 26 SEMANAS
// --------------------------------------
// «¿Cuánto he mejorado desde que empecé?» es una de las preguntas que el atleta
// hace de verdad. Con el tope en 26 semanas, a alguien con siete meses de
// historia se le contestaba con los últimos seis meses y se le llamaba «desde
// que empecé» — que es exactamente el tipo de imprecisión que no se comete.
//
// El coste de abrirlo se midió antes de tocarlo: la lectura entera tarda lo
// mismo con 4 semanas que con 520 (~230 ms), porque las consultas son barridos
// por rango acotados por las sesiones que el atleta tiene, no por lo ancha que
// sea la ventana. Pedir diez años no lee diez años de filas: lee las suyas.
//
// Diez años es el tope porque cubre una carrera deportiva entera. Más allá, una
// «ventana» deja de ser una ventana.
//
// LA OTRA MITAD, Y ES LA QUE EVITA MENTIR
// ---------------------------------------
// Abrir la ventana no basta. Si el atleta lleva diez semanas, pedir 520 no le da
// dos años de nada: le da sus diez semanas. La respuesta tiene que DECIRLO, para
// que el cliente pueda escribir «desde que empezaste, hace diez semanas» y no
// fingir un año que no existe. Eso es `Historia`.

/** Diez años: una carrera deportiva entera. Más allá no es una ventana. */
export const MAX_VENTANA_SEMANAS = 520;

/** Lo que se mira por defecto cuando nadie pide otra cosa. */
export const VENTANA_POR_DEFECTO_SEMANAS = 12;

export interface Historia {
  /**
   * Semanas desde la primera sesión ejecutada. Null cuando no ha ejecutado
   * ninguna: no hay desde cuándo contar, que es distinto de llevar cero.
   */
  semanas: number | null;
  /** ISO `YYYY-MM-DD` de la primera sesión. Null si no hay ninguna. */
  desde: string | null;
  /**
   * True cuando la ventana pedida alcanza (o rebasa) la primera sesión — o sea,
   * cuando lo que se está enseñando ES toda su historia.
   *
   * Es el permiso para escribir «desde que empezaste». Sin él, el cliente sólo
   * puede decir «en las últimas N semanas», que es lo único cierto.
   */
  cubre_todo: boolean;
}

const DIAS_POR_SEMANA = 7;

/**
 * Cuánta historia hay, y si la ventana pedida la abarca entera.
 *
 * `dias_de_historia` es el mismo número que el arranque en frío ya usa, para que
 * «lleva 40 días» y «empezó hace 6 semanas» no puedan contradecirse.
 */
export function historiaDe(args: {
  dias_de_historia: number | null;
  primera_sesion_iso: string | null;
  ventana_dias: number;
}): Historia {
  const dias = args.dias_de_historia;
  if (dias == null) {
    return { semanas: null, desde: null, cubre_todo: false };
  }
  return {
    semanas: Math.floor(dias / DIAS_POR_SEMANA),
    desde: args.primera_sesion_iso,
    cubre_todo: args.ventana_dias >= dias,
  };
}

/** Recorta lo pedido a lo admisible. Un número roto cae al defecto, no a cero. */
export function ventanaAdmisible(semanas: number | null | undefined): number {
  if (semanas == null || !Number.isFinite(semanas)) return VENTANA_POR_DEFECTO_SEMANAS;
  return Math.min(Math.max(1, Math.floor(semanas)), MAX_VENTANA_SEMANAS);
}
