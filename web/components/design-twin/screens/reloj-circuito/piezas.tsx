'use client';

// PIEZAS DEL CIRCUITO — lo poco que el kit aún no trae, compuesto con sus
// tokens (T, C, FILA, anchoTexto). Todas son genéricas: van a «Para el kit».
//
//   Centro        el hueco elástico del héroe (en el kit es privado de pasos.tsx).
//   Titulo        el nombre de la estación a 22 pt, con un prefijo en tinta2
//                 («entras a Wall Balls»); si no cabe, cae el prefijo antes que el suelo.
//   lineaTotal    el crono total (la puntuación) como línea del kit: «total 24:13 · cap 90′».
//   FilaReps      las reps que declaras con la corona: «43 reps · con la corona».
//   pistaDeclarar «lo dices tú · doble toque» según el reloj (sin gesto: solo «lo dices tú»).

import { useEffect, useState, type ReactNode } from 'react';
import {
  ANCHO_CABEZA,
  C,
  FILA,
  T,
  anchoTexto,
  cuerpoQueCabe,
  fmtDuracion,
  fmtReloj,
  useCabe,
  type LineaVista,
  type ModeloReloj,
} from '../../kit-reloj';

export function Centro({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  );
}

const PREFIJO = 16;

/**
 * El nombre de lo que haces (o a lo que vas). 22 pt, en tinta; el prefijo, en
 * tinta2. Va a la altura de los puntos de página: cabe en `ANCHO_CABEZA`.
 */
export function Titulo({ texto, prefijo }: { texto: string; prefijo?: string }) {
  const ref = useCabe<HTMLSpanElement>();
  const anchoPrefijo = prefijo ? anchoTexto(`${prefijo} `, PREFIJO, 500) : 0;
  let conPrefijo = !!prefijo;
  let cuerpo = cuerpoQueCabe(texto, T.tercero.cuerpo, ANCHO_CABEZA - anchoPrefijo);
  if (conPrefijo && anchoTexto(texto, cuerpo) + anchoPrefijo > ANCHO_CABEZA) {
    conPrefijo = false;
    cuerpo = cuerpoQueCabe(texto, T.tercero.cuerpo, ANCHO_CABEZA);
  }
  return (
    <div style={{ width: '100%', height: FILA.instruccion, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
      <div style={{ maxWidth: ANCHO_CABEZA, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <span ref={ref} style={{ display: 'inline-flex', alignItems: 'baseline', whiteSpace: 'nowrap', lineHeight: 1, transformOrigin: 'center' }}>
          {conPrefijo ? (
            <span style={{ fontSize: PREFIJO, fontWeight: 500, color: C.tinta2, marginRight: '0.3em' }}>{prefijo}</span>
          ) : null}
          <span style={{ fontSize: cuerpo, fontWeight: 600, color: C.tinta }}>{texto}</span>
        </span>
      </div>
    </div>
  );
}

/** El crono total del circuito, que es la puntuación: siempre en el mismo sitio, bajo el contexto. */
export function lineaTotal(total: number, cap: number | null): LineaVista {
  return { etiqueta: 'total', valor: fmtReloj(total), unidad: cap != null ? `· cap ${fmtDuracion(cap)}` : undefined };
}

/** «doble toque · empiezo»: la acción del momento, como la pista del kit. Sin gesto, la dice el botón. */
export function pistaCerrar(modelo: ModeloReloj, accion: string): string | undefined {
  if (modelo === 'sin-gesto') return undefined;
  return `${modelo === 'boton-accion' ? 'botón Acción' : 'doble toque'} · ${accion}`;
}

/** «lo dices tú · doble toque»: quién lo mide y cómo se cierra, en una línea. Sin gesto, el botón lo dice. */
export function pistaDeclarar(modelo: ModeloReloj, accion = 'lo dices tú'): string {
  if (modelo === 'sin-gesto') return accion;
  return `${accion} · ${modelo === 'boton-accion' ? 'botón Acción' : 'doble toque'}`;
}

/**
 * LAS REPS DEL AMRAP — nadie las cuenta: las dices tú con la corona. El número
 * crece un instante al cambiar (el clic de la corona lo pone el sistema, no un
 * háptico nuestro).
 */
export function FilaReps({ reps }: { reps: number }) {
  const [visto, setVisto] = useState(reps);
  const [brilla, setBrilla] = useState(false);
  if (reps !== visto) {
    setVisto(reps);
    setBrilla(true);
  }
  useEffect(() => {
    if (!brilla) return;
    const h = setTimeout(() => setBrilla(false), 450);
    return () => clearTimeout(h);
  }, [brilla]);
  return (
    <div style={{ width: '100%', height: FILA.tercero, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        <span
          style={{
            fontSize: T.tercero.cuerpo,
            fontWeight: 600,
            color: C.tinta,
            transform: brilla ? 'scale(1.12)' : 'none',
            transition: 'transform 180ms ease-out',
            display: 'inline-block',
          }}
        >
          {reps}
        </span>
        <span style={{ fontSize: T.nota.cuerpo, fontWeight: 500, color: C.tinta2 }}>reps · con la corona</span>
      </span>
    </div>
  );
}
