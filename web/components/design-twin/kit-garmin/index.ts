// KIT-GARMIN — el reloj Garmin (29-09-2026). Modelo: docs/garmin-reloj/modelo.md.
//
// UN ESTADO, DOS PINTORES (G1): este kit NO tiene dominio propio; el paso, el
// motor y las reglas son de `kit-reloj`. Esta primera capa es la de DATOS del
// lienzo redondo y de la plataforma, toda pura y probada:
//
//   tokens.ts     los cuatro relojes, la escala en fracción de D, el color, aMip.
//   geometria.ts  la cuerda del círculo, el ancho útil por fila, la rejilla del vivo.
//   medir.ts      anchos sin DOM, el contexto por partes, dos líneas, la talla del héroe.
//   mandos.ts     §5 como dato: estado × botón → acción.
//   avisos.ts     §6 como dato: evento → pulsos + tono, y su emisor.
//
// Los pintores (caras, carcasa, vivo) van encima, en la capa siguiente.

export * from './tokens';
export * from './geometria';
export * from './medir';
export * from './mandos';
export * from './avisos';
