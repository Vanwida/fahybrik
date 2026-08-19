// Plantilla de rejilla del roster — la cabecera y TODAS las filas leen la misma
// definición de columnas para que no se descuadren entre anchos.
//
// DOS CAMBIOS DE FONDO respecto a la primera versión, ambos del §9 del contrato:
//
// 1 · «Las columnas se dimensionan AL DATO, no a `1fr` por defecto» (§9.2). El
//     nombre era `1fr`, así que a 1440 se quedaba ~640 px para escribir «Alex» y
//     abría un vacío de ~470 px en medio de cada fila. Ahora tiene el ancho de un
//     nombre largo de verdad y lo que sobra se reparte entre las columnas que
//     llevan dato.
//
// 2 · «El responsive RECOMPONE, no esconde» (§9.3). La adherencia y el último
//     registro son los DOS datos de triaje del roster y sólo existían desde 1024
//     y 1280 px: en el móvil de Pablo el roster no servía para triar. Ya no se
//     esconde ninguno — por debajo de `lg` la fila se recompone a dos líneas
//     (identidad arriba, los datos abajo) en vez de perder columnas.
//
// La rejilla de columnas SOLO se usa de `lg` para arriba; por debajo la fila es
// un `flex` de dos líneas (ver AthleteTableRow). Por eso aquí ya no hay una
// escalera de cinco anchos: hay UNA definición, la de la tabla.
//
//   celdas, en orden: Atleta · Nivel · Estado · Semana · Fase · Adherencia · Últ.reg · ›
export const GRID_COLS =
  'lg:grid-cols-[minmax(10rem,18rem)_3rem_minmax(7rem,10rem)_minmax(6.5rem,9rem)_minmax(7rem,11rem)_8rem_7rem_auto]';

/** A partir de dónde la fila deja de ser dos líneas y pasa a ser una fila de
 *  tabla. Debe coincidir con el `lg:` de GRID_COLS. */
export const TABLA_DESDE = 'lg';
