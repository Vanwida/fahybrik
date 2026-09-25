'use client';

// EL DESCANSO Y LOS MOMENTOS DE CAMBIO del circuito.
//
//   DescansoCircuito  la fase común del kit (P8) — cuenta atrás, «Viene: …», +30 s,
//                     Empezar ya — con la ÚNICA diferencia de que el «Viene» dice
//                     la carga («Sled Pull · 25 m · 135 kg»): el `textoViene` del
//                     kit no la lleva (Para el kit). Nada lo pisa por accidente:
//                     tocar no hace nada; Empezar ya y el doble toque dejan 5 s
//                     para deshacer.
//   CapaCuenta        el 3-2-1 y el GO con la posición del circuito.
//   CapaEntras        «Entras a Sled Push» al llegar a una estación sin Roxzone.

import {
  BotonAccion,
  C,
  Columna,
  ContextoLinea,
  FILA,
  Heroe,
  Instruccion,
  Linea,
  Nota,
  ANCHO_UTIL,
  T,
  altoHeroe,
  contextoDe,
  cuerpoQueCabe,
  heroeDelPaso,
  lineaPulso,
  lineasDeNota,
  usePrimaria,
  type Lecturas,
  type Paso,
  type PasoBase,
} from '../../kit-reloj';
import type { Circuito } from './planes';
import { Centro } from './piezas';
import { cortoDe, dosisCompleta, posicionDe, vieneDe } from './texto';

type Fila = keyof typeof FILA;

export function DescansoCircuito({ paso, lecturas, c, onMas30 }: { paso: Paso; lecturas: Lecturas; c: Circuito; onMas30: () => void }) {
  const primaria = usePrimaria();
  const heroe = { ...heroeDelPaso(paso, lecturas, null), etiqueta: undefined };
  // Monocromo (P6): el pulso bajando, sin la marca de color de su zona.
  const pulso = lecturas.ppm != null ? { ...lineaPulso(paso, lecturas, null), zona: undefined } : null;
  const viene = paso.siguiente ? vieneDe(paso.siguiente, c) : null;
  const filas: Fila[] = ['contexto', 'boton'];
  if (viene) filas.push(lineasDeNota(`Viene: ${viene}`) === 2 ? 'nota2' : 'nota');
  if (pulso) filas.push('tercero');
  return (
    <Columna>
      <ContextoLinea partes={contextoDe(paso)} />
      <Centro>
        <Heroe heroe={heroe} altoMax={altoHeroe(filas)} />
      </Centro>
      {pulso ? <Linea linea={pulso} cuerpo={22} /> : null}
      {viene ? (
        <Nota tono={C.tinta} prefijo="Viene:">
          {viene}
        </Nota>
      ) : null}
      <div style={{ display: 'flex', gap: 6, width: '100%', height: FILA.boton, alignItems: 'center', padding: '0 4px', boxSizing: 'border-box' }}>
        <BotonAccion etiqueta="+30 s" variante="superficie" onPulsa={onMas30} ancho={60} />
        <BotonAccion etiqueta="Empezar ya" onPulsa={primaria ?? (() => undefined)} ancho={114} />
      </div>
    </Columna>
  );
}

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
