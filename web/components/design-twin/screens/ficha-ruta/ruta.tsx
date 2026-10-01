'use client';

// LA RUTA — la sesión en orden, de un vistazo: un nodo por bloque, unidos por una
// línea, con su nombre y lo que lleva. Es el mapa Y el control: tocar un nodo
// cambia el bloque que se lee debajo. Se queda fijo arriba al hacer scroll, así
// que en un bloque largo (dieciséis estaciones) siempre sabes en qué parte estás
// y a un toque tienes las demás.
//
// No es una línea de tiempo proporcional a propósito: el servidor no estima
// duraciones (CONTRATO-UI §7), y unas barras de ancho proporcional prometerían
// una precisión que nadie ha escrito. Cada nodo dice lo que se SABE del bloque.

import { useEffect, useRef, useState } from 'react';
import { fuente, TAM } from '../../kit-dia/tokens';
import type { Bloque } from '../../kit-ficha/contrato';
import { resumenCorto } from '../../kit-ficha/modelo';
import { LATERAL } from '../../kit-ficha/piezas';

const NODO = 30;
const ANCHO_MINIMO = 108;

export function Ruta({ bloques, activo, onElegir }: { bloques: Bloque[]; activo: string; onElegir: (id: string) => void }) {
  const carril = useRef<HTMLDivElement>(null);
  // Con más nodos de los que caben, el borde derecho se desvanece para decir «hay más»; al llegar al final, se quita.
  const [hayMas, setHayMas] = useState(false);
  const medir = () => {
    const el = carril.current;
    if (el) setHayMas(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  };
  useEffect(medir, [bloques.length]);
  return (
    <nav
      aria-label="Bloques de la sesión"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 3,
        margin: `0 -${LATERAL}px`,
        padding: `10px ${LATERAL}px 12px`,
        background: 'var(--twin-bg)',
        borderBottom: '1px solid var(--twin-hairline)',
      }}
    >
      <div
        ref={carril}
        className="fi-pasos"
        onScroll={medir}
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x proximity',
          margin: `0 -${LATERAL}px`,
          padding: `0 ${LATERAL}px`,
          ...(hayMas ? { WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 36px), transparent)', maskImage: 'linear-gradient(to right, #000 calc(100% - 36px), transparent)' } : null),
        }}
      >
        {bloques.map((b, i) => {
          const seleccionado = b.id === activo;
          return (
            <button
              key={b.id}
              type="button"
              className="fi-btn"
              aria-current={seleccionado ? 'step' : undefined}
              onClick={() => onElegir(b.id)}
              style={{
                position: 'relative',
                flex: `1 0 ${ANCHO_MINIMO}px`,
                scrollSnapAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: 0,
                textAlign: 'center',
              }}
            >
              {i > 0 ? <Tramo lado="izq" lleno={seleccionado || bloques[i - 1].id === activo} /> : null}
              {i < bloques.length - 1 ? <Tramo lado="der" lleno={seleccionado || bloques[i + 1].id === activo} /> : null}
              <span
                style={{
                  position: 'relative',
                  width: NODO,
                  height: NODO,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: seleccionado ? 'var(--twin-accent)' : 'var(--twin-surface-elevated)',
                  border: `2px solid ${seleccionado ? 'var(--twin-accent)' : 'var(--twin-hairline-strong)'}`,
                  color: seleccionado ? 'var(--twin-accent-on)' : 'var(--twin-fg)',
                  ...fuente(800, TAM.suelo, 1),
                  fontVariantNumeric: 'tabular-nums',
                  transition: 'background-color 200ms ease-out, border-color 200ms ease-out',
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  ...fuente(seleccionado ? 800 : 600, TAM.suelo, 1.2),
                  color: seleccionado ? 'var(--twin-fg)' : 'var(--twin-muted)',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  padding: '0 4px',
                }}
              >
                {b.titulo}
              </span>
              <span style={{ ...fuente(500, TAM.suelo, 1.2), color: 'var(--twin-muted)', fontVariantNumeric: 'tabular-nums' }}>{resumenCorto(b)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** La línea entre dos nodos: media celda a cada lado. Se «enciende» junto al nodo elegido. */
function Tramo({ lado, lleno }: { lado: 'izq' | 'der'; lleno: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: NODO / 2 - 1,
        height: 2,
        ...(lado === 'izq' ? { left: 0, right: `calc(50% + ${NODO / 2}px)` } : { left: `calc(50% + ${NODO / 2}px)`, right: 0 }),
        background: lleno ? 'var(--twin-accent)' : 'var(--twin-hairline-strong)',
        transition: 'background-color 200ms ease-out',
      }}
    />
  );
}
