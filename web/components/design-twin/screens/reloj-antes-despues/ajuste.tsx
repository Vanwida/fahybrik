'use client';

// EL AJUSTE DE LAS LÍNEAS DE LISTA — que ninguna se salga del reloj, con
// cualquier nombre de catálogo y con cualquier fuente.
//
// Dos cinturones, como en el kit: el estimador de SF (`anchoTexto`) decide de
// antemano en cuántas líneas va un texto (así cada fila sabe su alto y la
// página no se desborda), y `useCabe` escala en el navegador la línea que aun
// así no quepa (sin SF, en Linux o en capturas). Una línea nunca se parte a
// mitad de un dato: se parte entre partes («r 2′ trote Z2 · 5′ Z1 entre
// tandas») o entre palabras (un nombre largo).

import type { CSSProperties } from 'react';
import { T, anchoTexto, useCabe, type Peso } from '../../kit-reloj';

/**
 * Reparte `piezas` en líneas de `ancho` pt (greedy), unidas con `sep`. Una
 * pieza que sola no cabe va en su línea (y la escalará `useCabe`).
 */
export function partir(piezas: string[], sep: string, ancho: number, cuerpo: number, peso: Peso): string[] {
  const lineas: string[] = [];
  let actual = '';
  piezas.forEach((p) => {
    const junta = actual ? `${actual}${sep}${p}` : p;
    if (!actual || anchoTexto(junta, cuerpo, peso) <= ancho) actual = junta;
    else {
      lineas.push(actual);
      actual = p;
    }
  });
  if (actual) lineas.push(actual);
  return lineas;
}

/** Un texto en líneas: por palabras si es un nombre, por partes si es una dosis. */
export function enLineas(texto: string, ancho: number, cuerpo: number, peso: Peso, porPartes = false): string[] {
  if (anchoTexto(texto, cuerpo, peso) <= ancho) return [texto];
  return porPartes ? partir(texto.split(' · '), ' · ', ancho, cuerpo, peso) : partir(texto.split(' '), ' ', ancho, cuerpo, peso);
}

/** Una línea sin salto que, si aun así no cabe en su columna, se escala lo justo (desde la izquierda). */
export function LineaAjustada({ texto, estilo, prefijo }: { texto: string; estilo: CSSProperties; prefijo?: { texto: string; color: string } }) {
  const ref = useCabe<HTMLSpanElement>();
  return (
    // Flex: sin la caja de línea del contenedor, la fila mide exactamente su `lineHeight`.
    <div style={{ display: 'flex', width: '100%', minWidth: 0 }}>
      <span ref={ref} style={{ display: 'block', flex: '0 0 auto', whiteSpace: 'nowrap', transformOrigin: 'left center', ...estilo }}>
        {prefijo ? <span style={{ color: prefijo.color }}>{prefijo.texto}</span> : null}
        {texto}
      </span>
    </div>
  );
}

/** El cuerpo de una línea de nombre: 16 si cabe, 15 si solo cabe así (el suelo); si ni así, 16 y en dos líneas. */
export function cuerpoNombre(texto: string, ancho: number, cuerpo: number = T.contexto.cuerpo): number {
  if (anchoTexto(texto, cuerpo, 600) <= ancho) return cuerpo;
  return anchoTexto(texto, T.suelo, 600) <= ancho ? T.suelo : cuerpo;
}
