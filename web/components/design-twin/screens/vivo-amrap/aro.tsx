'use client';

// El aro perimetral: la ventana del AMRAP convertida en ambiente.
//
// Vive en su propio fichero porque es la única pieza de la familia con
// geometría de verdad (un rectángulo redondeado recorrido en el sentido del
// reloj y consumido por `stroke-dashoffset`), y porque es lo primero que hay
// que poder cambiar sin abrir el resto de átomos.

import { useEffect, useRef, useState } from 'react';
import { RAD } from '../../kit';

const ARO_GROSOR = 6;

/** El hueco que hay que dejar para que el aro no pise el contenido. */
export const ARO_MARGEN = ARO_GROSOR + 6;

function pathAro(w: number, h: number, r: number): string {
  // Arranca a las 12 y va en el sentido del reloj, para que lo que se apaga
  // sea la cola y lo que queda se lea desde arriba.
  return [
    `M ${w / 2} 0`,
    `H ${w - r}`,
    `A ${r} ${r} 0 0 1 ${w} ${r}`,
    `V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${h - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z',
  ].join(' ');
}

export interface AroVentanaProps {
  /** 1 = ventana entera; 0 = se acabó. */
  fraccion: number;
  /** 0 en faena; 1 al llegar a cero. Sube el ambiente a naranja. */
  tension: number;
}

/**
 * El ambiente. No es un adorno: es el único elemento que dice cuánto queda sin
 * que tengas que leer un número, y por eso rodea el lienzo entero en vez de
 * vivir en una esquina. Se mide a sí mismo (el lienzo cambia de alto entre
 * retrato enmarcado y pantalla completa) y drena con transición de un segundo,
 * que es su propio latido.
 *
 * `pathLength={1000}` normaliza el recorrido: el trazo visible es
 * exactamente `fraccion` del perímetro sin tener que calcularlo, y con el
 * `dasharray` de 1000/1000 lo que se dibuja es el tramo que va desde las 12 en
 * adelante — el que aún tienes por delante.
 */
export function AroVentana({ fraccion, tension }: AroVentanaProps) {
  const caja = useRef<HTMLDivElement>(null);
  const [medida, setMedida] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMedida({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 42 % y no menos: por debajo el aro se confunde con la costura de las
  // tarjetas y deja de contar el tiempo de un vistazo, que es su único trabajo.
  const calma = 'color-mix(in srgb, var(--twin-fg) 42%, transparent)';
  const trazo = `color-mix(in srgb, var(--twin-accent) ${Math.round(tension * 100)}%, ${calma})`;
  const w = Math.max(0, medida.w - ARO_GROSOR);
  const h = Math.max(0, medida.h - ARO_GROSOR);

  return (
    <div ref={caja} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* El resplandor de los últimos 60 s: la pantalla se calienta por los bordes. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: RAD.xl,
          background:
            'radial-gradient(125% 78% at 50% 50%, transparent 42%, color-mix(in srgb, var(--twin-accent) 30%, transparent) 100%)',
          opacity: tension,
          transition: 'opacity 900ms linear',
        }}
      />
      {w > 0 && h > 0 && (
        <svg width={medida.w} height={medida.h} style={{ position: 'absolute', inset: 0 }}>
          <g transform={`translate(${ARO_GROSOR / 2} ${ARO_GROSOR / 2})`}>
            <path d={pathAro(w, h, RAD.xl)} fill="none" stroke="var(--twin-hairline)" strokeWidth={ARO_GROSOR} />
            <path
              d={pathAro(w, h, RAD.xl)}
              fill="none"
              stroke={trazo}
              strokeWidth={ARO_GROSOR + 3 * tension}
              strokeLinecap="round"
              pathLength={1000}
              strokeDasharray="1000 1000"
              strokeDashoffset={Math.round(1000 * (1 - Math.min(1, Math.max(0, fraccion))))}
              style={{ transition: 'stroke-dashoffset 1000ms linear, stroke 900ms linear, stroke-width 900ms linear' }}
            />
          </g>
        </svg>
      )}
    </div>
  );
}
