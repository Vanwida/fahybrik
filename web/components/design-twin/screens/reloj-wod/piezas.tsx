'use client';

// PIEZAS QUE EL KIT NO TIENE TODAVÍA (Para el kit) — hechas con sus tokens y
// sus reglas: ningún tamaño ni color que no salga de `T` y `C`.
//
//   Centro          el hueco elástico del héroe (en el kit es privado de pasos.tsx).
//   ParDatos        dos datos en una fila: «218 m · 2:12 /500» (el PM5 en el EMOM).
//   CapturaCorona   la corona ENFOCADA en un valor (la puntuación del AMRAP): la
//                   rueda y el arrastre vertical sobre la esfera dejan de pasar
//                   página y mueven el número. En watchOS es `digitalCrownRotation`
//                   sobre la vista enfocada; el kit solo sabe pasar página.
//   RondasPared     la cadencia del reloj de pared: una marca por ronda.
//   Luego           «Luego · …» que, si no cabe, parte entre el movimiento y su
//                   carga («6 Bench Press» / «60 kg»), nunca a mitad de un nombre.

import { useRef, type ReactNode, type WheelEvent as ReactWheelEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ANCHO_PIE, ANCHO_UTIL, C, FILA, Nota, T, anchoTexto, cuerpoQueCabe, lineasDeNota } from '../../kit-reloj';

/** El hueco elástico donde se centra el héroe. */
export function Centro({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  );
}

export interface Dato {
  valor: string;
  unidad: string;
}

/**
 * DOS DATOS EN UNA FILA — el valor a 22 pt en tinta, la unidad a 15 pt en
 * tinta2. Si no caben, bajan los dos por igual (nunca de 15 pt).
 */
export function ParDatos({ a, b, ancho = ANCHO_UTIL }: { a: Dato; b: Dato; ancho?: number }) {
  // Lo fijo (unidades a 15 pt y huecos) no se encoge: el valor se ajusta al resto.
  const fijo = anchoTexto(a.unidad, T.nota.cuerpo, T.nota.peso) + anchoTexto(b.unidad, T.nota.cuerpo, T.nota.peso) + 2 * 3 + 16;
  const c = cuerpoQueCabe(`${a.valor}${b.valor}`, T.tercero.cuerpo, ancho - fijo);
  const uno = (d: Dato) => (
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

/** Cada cuántos px de arrastre o de rueda avanza un paso la corona. */
const PASO_ARRASTRE = 14;
const PASO_RUEDA = 36;

/**
 * LA CORONA SOBRE UN VALOR. Envuelve la cara de la puntuación: la rueda del
 * ratón y el arrastre vertical mueven el valor y NO llegan a la carcasa (no
 * pasan página). El deslizar en horizontal sí sigue: los controles están a la
 * izquierda como siempre.
 */
export function CapturaCorona({ onPaso, children }: { onPaso: (dir: 1 | -1) => void; children: ReactNode }) {
  const rueda = useRef(0);
  const arrastre = useRef<{ y: number; movido: boolean } | null>(null);
  const onWheel = (e: ReactWheelEvent) => {
    e.stopPropagation();
    rueda.current += e.deltaY;
    while (Math.abs(rueda.current) >= PASO_RUEDA) {
      // Rueda hacia arriba = corona hacia arriba = más, como un selector de watchOS.
      onPaso(rueda.current < 0 ? 1 : -1);
      rueda.current -= Math.sign(rueda.current) * PASO_RUEDA;
    }
  };
  const abajo = (e: ReactPointerEvent) => {
    arrastre.current = { y: e.clientY, movido: false };
  };
  const mueve = (e: ReactPointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    const dy = e.clientY - a.y;
    if (Math.abs(dy) >= PASO_ARRASTRE) {
      onPaso(dy < 0 ? 1 : -1);
      arrastre.current = { y: e.clientY, movido: true };
    }
  };
  const arriba = (e: ReactPointerEvent) => {
    if (arrastre.current?.movido) e.stopPropagation();
    arrastre.current = null;
  };
  return (
    <div onWheel={onWheel} onPointerDown={abajo} onPointerMove={mueve} onPointerUp={arriba} style={{ position: 'absolute', inset: 0, touchAction: 'none' }}>
      {children}
    </div>
  );
}

/**
 * LA CADENCIA DEL RELOJ DE PARED — una marca por ronda: hechas en tinta, la de
 * ahora en tinta2 (sin color: el estado lo dice la palabra, P6), las que faltan
 * en el carril. Va en la fila de una nota (18 pt de alto).
 */
export function RondasPared({ total, hechas, ahora }: { total: number; hechas: number; ahora: boolean }) {
  return (
    <div style={{ width: '100%', height: FILA.nota, flex: '0 0 auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: ANCHO_PIE - 24, display: 'flex', gap: 4 }} aria-label={`${hechas} de ${total} rondas`}>
        {Array.from({ length: total }, (_, k) => (
          <span
            key={k}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: k < hechas ? C.tinta : k === hechas && ahora ? C.tinta2 : C.carril,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Cuántas filas de nota ocupa «Luego · …» (para el presupuesto del héroe). */
export function filasLuego(que: string, carga: string | null): Array<'nota' | 'nota2'> {
  const entero = `Luego · ${[que, carga].filter(Boolean).join(' · ')}`;
  if (lineasDeNota(entero) === 1) return ['nota'];
  return carga ? ['nota', 'nota'] : ['nota2'];
}

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
