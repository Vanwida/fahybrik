'use client';

// LA PIEZA PROPIA DEL WOD — la cadencia del reloj de pared. Lo demás que esta
// pantalla usaba en local (Centro, ParDatos, Luego, la corona enfocada) ya es
// del kit.
//
//   RondasPared   una marca por ronda: hechas en tinta, la de ahora en
//                 tinta2 (sin color: el estado lo dice la palabra, P6), las que
//                 faltan en el carril. Va en la fila de una nota.

import { ANCHO_PIE, C, FILA } from '../../kit-reloj';

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
