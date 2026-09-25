'use client';

// LAS PIEZAS DE APOYO — lo que las caras de cada familia (estación, WOD,
// fuerza) necesitan además de la lámina de correr, UNA vez. Como en
// `piezas.tsx`: ningún tamaño ni color fuera de `T` y `C`, y ninguna decide
// QUÉ se pinta, solo CÓMO.
//
//   Centro         el hueco elástico donde se centra el héroe.
//   altoLibre      el alto que le queda al héroe con filas de alto conocido.
//   Titulo         el nombre de lo que haces a 22 pt, con un prefijo en tinta2
//                  («entras a Wall Balls»); si no cabe, cae el prefijo antes que el suelo.
//   lineaTotal     el crono total (la puntuación): «total 24:13 · cap 90′».
//   pistaCerrar / pistaDeclarar  la acción del momento en la etiqueta del héroe.
//   ParDatos       dos datos en una fila: «218 m · 2:12 /500».
//   Luego          «Luego · …» que, si no cabe, parte entre el qué y la carga.
//   VieneLinea     «Viene: B1 · Deadlift» / «4 × 8 · RIR 3», partida por qué y dosis.
//   Marca          ✓ declarada / aro sin confirmar.
//   BotonesDescanso  «+30 s» y la acción del momento, en la fila de abajo del descanso.

import type { CSSProperties, ReactNode } from 'react';
import { BotonAccion, Nota, lineasDeNota, useCabe, usePrimaria, type ModeloReloj } from './piezas';
import type { LineaVista } from './lamina';
import { fmtDuracion, fmtReloj } from './reglas';
import { ALTO_UTIL, ANCHO_CABEZA, ANCHO_UTIL, C, FILA, HUECO, T, anchoTexto, cuerpoQueCabe } from './tokens';

// ---------------------------------------------------------------------------
// El sitio del héroe
// ---------------------------------------------------------------------------

/** El hueco elástico donde se centra el héroe. */
export function Centro({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  );
}

/**
 * Lo que le queda de alto al héroe con estas filas (en pt, cada una con su
 * hueco). Una fila que no está se pasa como `-HUECO`. Es `altoHeroe` para
 * filas que no son de `FILA` (un nombre en dos líneas, una píldora).
 */
export function altoLibre(filas: number[]): number {
  return ALTO_UTIL - filas.reduce((a, h) => a + h + HUECO, 0) - HUECO;
}

// ---------------------------------------------------------------------------
// Títulos y líneas
// ---------------------------------------------------------------------------

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

/** El crono total de un circuito o un For Time, que es la puntuación: siempre en el mismo sitio. */
export function lineaTotal(total: number, cap: number | null): LineaVista {
  return { etiqueta: 'total', valor: fmtReloj(total), unidad: cap != null ? `· cap ${fmtDuracion(cap)}` : undefined };
}

const gesto = (modelo: ModeloReloj) => (modelo === 'boton-accion' ? 'botón Acción' : 'doble toque');

/** «doble toque · empiezo»: la acción del momento, como la pista del kit. Sin gesto, la dice el botón. */
export function pistaCerrar(modelo: ModeloReloj, accion: string): string | undefined {
  if (modelo === 'sin-gesto') return undefined;
  return `${gesto(modelo)} · ${accion}`;
}

/** «lo dices tú · doble toque»: quién lo mide y cómo se cierra, en una línea. Sin gesto, el botón lo dice. */
export function pistaDeclarar(modelo: ModeloReloj, accion = 'lo dices tú'): string {
  if (modelo === 'sin-gesto') return accion;
  return `${accion} · ${gesto(modelo)}`;
}

// ---------------------------------------------------------------------------
// Dos datos en una fila
// ---------------------------------------------------------------------------

export interface DatoPar {
  valor: string;
  unidad: string;
}

/**
 * DOS DATOS EN UNA FILA — el valor a 22 pt en tinta, la unidad a 15 pt en
 * tinta2. Si no caben, bajan los dos por igual (nunca de 15 pt).
 */
export function ParDatos({ a, b, ancho = ANCHO_UTIL }: { a: DatoPar; b: DatoPar; ancho?: number }) {
  // Lo fijo (unidades a 15 pt y huecos) no se encoge: el valor se ajusta al resto.
  const fijo = anchoTexto(a.unidad, T.nota.cuerpo, T.nota.peso) + anchoTexto(b.unidad, T.nota.cuerpo, T.nota.peso) + 2 * 3 + 16;
  const c = cuerpoQueCabe(`${a.valor}${b.valor}`, T.tercero.cuerpo, ancho - fijo);
  const uno = (d: DatoPar) => (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: c, fontWeight: T.tercero.peso, color: C.tinta, fontVariantNumeric: 'tabular-nums' }}>{d.valor}</span>
      <span style={{ fontSize: T.nota.cuerpo, fontWeight: T.nota.peso, color: C.tinta2 }}>{d.unidad}</span>
    </span>
  );
  return (
    <div style={{ width: '100%', height: FILA.tercero, flex: '0 0 auto', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, lineHeight: 1 }}>
      {uno(a)}
      {uno(b)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lo que viene
// ---------------------------------------------------------------------------

/** Cuántas filas de nota ocupa «Luego · …» (para el presupuesto del héroe). */
export function filasLuego(que: string, carga: string | null): Array<'nota' | 'nota2'> {
  const entero = `Luego · ${[que, carga].filter(Boolean).join(' · ')}`;
  if (lineasDeNota(entero) === 1) return ['nota'];
  return carga ? ['nota', 'nota'] : ['nota2'];
}

/** «Luego · 6 Bench Press · 60 kg»; si no cabe, en dos filas: el qué y su carga (nunca a mitad de un nombre). */
export function Luego({ que, carga }: { que: string; carga: string | null }) {
  const filas = filasLuego(que, carga);
  if (filas.length === 1) {
    return (
      <Nota tono={C.tinta} prefijo="Luego ·">
        {[que, carga].filter(Boolean).join(' · ')}
      </Nota>
    );
  }
  return (
    <>
      <Nota tono={C.tinta} prefijo="Luego ·">
        {que}
      </Nota>
      <Nota tono={C.tinta}>{carga!}</Nota>
    </>
  );
}

/** Lo que viene, en dos partes: qué («B1 · Deadlift», «Serie 3/4») y su dosis. */
export interface Viene {
  que: string;
  dosis: string | null;
}

const HOLGURA = 1.04;

/** ¿Va «Viene:» en una línea? Si no, en dos: qué arriba, la dosis debajo (nunca partida por la mitad). */
export function vieneEnUna(v: Viene): boolean {
  const t = `Viene: ${v.que}${v.dosis ? ` · ${v.dosis}` : ''}`;
  return anchoTexto(t, T.nota.cuerpo, T.nota.peso) <= ANCHO_UTIL * HOLGURA;
}

/** El alto de «Viene:» (una o dos filas), o `-HUECO` si no hay nada que venga. */
export function altoViene(v: Viene | null): number {
  return !v ? -HUECO : vieneEnUna(v) ? FILA.nota : FILA.nota2;
}

function LineaCabe({ estilo, children }: { estilo: CSSProperties; children: ReactNode }) {
  const ref = useCabe<HTMLSpanElement>();
  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <span ref={ref} style={{ ...estilo, transformOrigin: 'center' }}>
        {children}
      </span>
    </div>
  );
}

/** «Viene: B1 · Deadlift» / «4 × 8 · RIR 3» — lo que viene, con su dosis. */
export function VieneLinea({ v }: { v: Viene }) {
  const cabeza = <span style={{ color: C.tinta2, marginRight: '0.3em' }}>Viene:</span>;
  const estilo = { fontSize: T.nota.cuerpo, fontWeight: T.nota.peso, color: C.tinta, lineHeight: `${FILA.nota2 / 2}px`, whiteSpace: 'nowrap' as const };
  if (vieneEnUna(v)) {
    return (
      <div style={{ height: FILA.nota, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', flex: '0 0 auto' }}>
        <span style={estilo}>
          {cabeza}
          {v.que}
          {v.dosis ? ` · ${v.dosis}` : ''}
        </span>
      </div>
    );
  }
  return (
    <div style={{ height: FILA.nota2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', flex: '0 0 auto' }}>
      <LineaCabe estilo={estilo}>
        {cabeza}
        {v.que}
      </LineaCabe>
      {v.dosis ? <LineaCabe estilo={estilo}>{v.dosis}</LineaCabe> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marcas y botones
// ---------------------------------------------------------------------------

/** ✓ declarada (en tinta) o aro hueco sin confirmar (en tinta2). Monocromo: el verde es de una zona. */
export function Marca({ hecha, talla = 15 }: { hecha: boolean; talla?: number }) {
  return hecha ? (
    <svg width={talla} height={talla} viewBox="0 0 24 24" aria-label="anotada" style={{ flex: '0 0 auto' }}>
      <path d="M5 12.5 9.5 17 19 7.5" fill="none" stroke={C.tinta} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <span aria-label="sin confirmar" style={{ width: talla - 4, height: talla - 4, borderRadius: (talla - 4) / 2, boxShadow: `inset 0 0 0 1.6px ${C.tinta2}`, flex: '0 0 auto' }} />
  );
}

/**
 * La fila de abajo de todo descanso: «+30 s» y la acción del momento en
 * naranja («Empezar ya», «Confirmar»). Los extremos redondos caen en las
 * esquinas del aro: la fila se mete 4 pt por lado y «+30 s» es corto para que
 * la acción quepa entera a 17 pt. La acción es la de la carcasa (con su deshacer).
 */
export function BotonesDescanso({ etiqueta = 'Empezar ya', onMas30, onPulsa }: { etiqueta?: string; onMas30: () => void; onPulsa?: () => void }) {
  const primaria = usePrimaria();
  return (
    <div style={{ display: 'flex', gap: 6, width: '100%', height: FILA.boton, alignItems: 'center', padding: '0 4px', boxSizing: 'border-box', flex: '0 0 auto' }}>
      <BotonAccion etiqueta="+30 s" variante="superficie" onPulsa={onMas30} ancho={60} />
      <BotonAccion etiqueta={etiqueta} onPulsa={onPulsa ?? primaria ?? (() => undefined)} ancho={114} />
    </div>
  );
}
