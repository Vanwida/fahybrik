'use client';

// LOS MOMENTOS DE CAMBIO del circuito (el descanso es el `Descanso` del kit,
// con el «Viene:» del circuito: `vieneDe`).
//
//   CapaCuenta        el 3-2-1 y el GO con la posición del circuito.
//   CapaEntras        «Entras a Sled Push» al llegar a una estación sin Roxzone.

import {
  ANCHO_UTIL,
  C,
  Centro,
  Columna,
  ContextoLinea,
  Heroe,
  Instruccion,
  T,
  altoHeroe,
  cuerpoQueCabe,
  type FILA,
  type PasoBase,
} from '../../kit-reloj';
import type { Circuito } from './planes';
import { cortoDe, dosisCompleta, posicionDe } from './texto';

type Fila = keyof typeof FILA;

/** El 3-2-1 (n > 0) y el GO (n = 0) antes de un paso de trabajo: a qué entras y contra qué. */
export function CapaCuenta({ n, paso, c }: { n: number; paso: PasoBase; c: Circuito }) {
  const filas: Fila[] = ['contexto', 'instruccion'];
  return (
    <Columna estilo={{ background: C.fondo }}>
      <ContextoLinea partes={posicionDe(paso, c)} />
      <Instruccion texto={cortoDe(paso)} tono={C.tinta2} />
      <Centro>
        <Heroe heroe={{ clase: 'crono', texto: n > 0 ? String(n) : 'GO' }} altoMax={altoHeroe(filas)} />
      </Centro>
    </Columna>
  );
}

/**
 * «ENTRAS A…» — la llegada a una estación cuando no hay Roxzone que la
 * anuncie: vibra `.start×2` y lo dice la voz; en pantalla, 3 s, el nombre en
 * grande con su dosis y su carga. El crono de la estación ya corre debajo.
 */
export function CapaEntras({ paso, c }: { paso: PasoBase; c: Circuito }) {
  const nombre = paso.nombre ?? '';
  // El nombre a 30 pt en dos líneas como mucho antes que encogerlo.
  const cuerpo = Math.max(T.tercero.cuerpo, cuerpoQueCabe(nombre, T.segundo.cuerpo, ANCHO_UTIL * 1.9));
  return (
    <Columna estilo={{ background: C.fondo, animation: 'reloj-entra 220ms ease-out' }}>
      <ContextoLinea partes={posicionDe(paso, c)} tono={C.tinta2} />
      <Centro>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
          <span style={{ fontSize: T.contexto.cuerpo, fontWeight: 600, color: C.tinta2 }}>Entras a</span>
          <span
            style={{
              fontSize: cuerpo,
              fontWeight: 700,
              color: C.tinta,
              lineHeight: 1.05,
              textAlign: 'center',
              textWrap: 'balance',
              maxWidth: ANCHO_UTIL,
            }}
          >
            {nombre}
          </span>
          <span style={{ fontSize: T.contexto.cuerpo, fontWeight: 600, color: C.tinta2, whiteSpace: 'nowrap' }}>{dosisCompleta(paso).join(' · ')}</span>
        </div>
      </Centro>
    </Columna>
  );
}
