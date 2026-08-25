'use client';

// El cromo del bloque y su franja de contexto — lo que envuelve al sujeto y no
// se va nunca.
//
// EL CRONO. En un For Time el crono del bloque ES la puntuación, así que no
// puede desaparecer al abrir una hoja, ni al pausar, ni al sellar una estación.
// Pero tampoco puede COMPETIR: hasta el 29-jul vivía en una barra con
// superficie propia y a 34 px, y la pantalla acababa con dos numerales y
// ninguno mandando. Ahora vive en la fila `contexto` de `MarcoVivo` (§10.3), en
// la voz de instrumento pero un escalón por debajo: presencia por SITIO, no por
// tamaño.
//
// EL TINTE. Ya no sale de aquí. Lo pone la ZONA DE PULSO (`Ambiente` de
// `kit-vivo`, §10.1). Antes lo ponía la modalidad del tramo activo, y el
// resultado se veía de lejos: lienzo verde azulado (remo) mientras el pulso
// marcaba 164 ppm en Z4 — el fondo diciendo una cosa y el atleta otra. La
// modalidad sigue marcando el tramo donde le toca, que es el punto de color de
// cada fila de la ruta.
//
// DÓNDE VIVEN AHORA. El cromo y la franja SUBIERON a `kit-vivo` el 10-ago, la
// primera vez que una segunda familia (el contador de muchas rondas) los
// necesitó — la regla del kit. Aquí se reexportan para no reescribir las
// llamadas de las dos escenas, y el rótulo del formato lo pone `ForTime`, que
// es lo que este fichero sí sabe.

import type { ReactNode } from 'react';
import { CromoFormato as CromoVivo } from '../../kit-vivo';

export { ContextoFormato, type CapEstado } from '../../kit-vivo';

/** El cromo de esta familia: siempre For Time, y eso ya no lo decide el kit. */
export function CromoFormato(props: {
  posicion: string;
  pausado: boolean;
  onPausa: () => void;
  onDeshacer?: () => void;
  puedeDeshacer?: boolean;
}): ReactNode {
  return <CromoVivo formato="FOR TIME" {...props} />;
}
