'use client';

// El aro del bisel — el progreso dibujado en el borde del lienzo.
//
// La idea que sostiene toda la familia: en un reloj el sitio más barato que
// existe son las esquinas redondeadas, porque ahí no cabe texto. Trazar el
// progreso SOBRE el borde de la pantalla cuesta cero altura de contenido, se ve
// de reojo sin enfocar la vista, y devuelve al sujeto los ~52 pt que hoy se
// come el botón grande del reloj.
//
// Regla de significado, constante en los cuatro escenarios:
//   · el ARO es la ESTRUCTURA (cuánto queda de esto), siempre naranja;
//   · el FONDO es el CUERPO (tu zona) o el ESTADO (recuperación).
//
// Naranja SUAVE y no el naranja de marca: sobre el fondo teñido de una zona
// ámbar el #F06A2A se queda en 2,3:1 y un elemento gráfico que hay que
// entender necesita 3:1. El #FF8A4C pasa contra las cinco zonas.

import type { ReactNode } from 'react';
import { W } from '../watch-live/theme';
import type { Tramo } from '../../tramos';

/** Métricas del lienzo del reloj — las mismas que fija DeviceFrame (WATCH). */
const LIENZO = { ancho: 208, alto: 248, radio: 56 } as const;

/** Cuánto se mete el trazo hacia dentro, y su grosor. */
const INSET = 4;
const GROSOR = 5;
const RADIO = LIENZO.radio - INSET;

/**
 * El perímetro, calculado a mano en vez de con `getTotalLength()`: sin medir el
 * DOM el resultado es idéntico en servidor y en cliente, que es la misma razón
 * por la que el reloj espejo estima anchos de texto en vez de medirlos.
 */
export const PERIMETRO =
  2 * (LIENZO.ancho - 2 * INSET - 2 * RADIO) +
  2 * (LIENZO.alto - 2 * INSET - 2 * RADIO) +
  2 * Math.PI * RADIO;

/** Arranca en las 12 y va en sentido horario, como cualquier reloj. */
const TRAZADO = [
  `M ${LIENZO.ancho / 2} ${INSET}`,
  `H ${LIENZO.ancho - INSET - RADIO}`,
  `A ${RADIO} ${RADIO} 0 0 1 ${LIENZO.ancho - INSET} ${INSET + RADIO}`,
  `V ${LIENZO.alto - INSET - RADIO}`,
  `A ${RADIO} ${RADIO} 0 0 1 ${LIENZO.ancho - INSET - RADIO} ${LIENZO.alto - INSET}`,
  `H ${INSET + RADIO}`,
  `A ${RADIO} ${RADIO} 0 0 1 ${INSET} ${LIENZO.alto - INSET - RADIO}`,
  `V ${INSET + RADIO}`,
  `A ${RADIO} ${RADIO} 0 0 1 ${INSET + RADIO} ${INSET}`,
  'Z',
].join(' ');

const COLOR_ARO = W.orangeSoft;
// El carril apagado del bisel: gris fijo sobre el negro OLED, derivado del
// blanco del tema en vez de un hex suelto.
const COLOR_VIA = 'color-mix(in srgb, var(--twin-fg) 12%, transparent)';

/** `via` dibuja el carril completo; el aro segmentado trae el suyo, troceado. */
function Lienzo({ via = true, children }: { via?: boolean; children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`}
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      aria-hidden
      focusable="false"
    >
      {via ? <path d={TRAZADO} fill="none" stroke={COLOR_VIA} strokeWidth={GROSOR} /> : null}
      {children}
    </svg>
  );
}

/**
 * El aro que DRENA: una sola cosa en marcha (el minuto del EMOM, el descanso,
 * la ventana del AMRAP). `fraccion` es lo que QUEDA, de 1 a 0, y el trazo se
 * retrae hacia las 12.
 */
export function AroContinuo({ fraccion }: { fraccion: number }) {
  const queda = Math.min(1, Math.max(0, fraccion));
  return (
    <Lienzo>
      <path
        d={TRAZADO}
        fill="none"
        stroke={COLOR_ARO}
        strokeWidth={GROSOR}
        strokeLinecap="round"
        strokeDasharray={PERIMETRO}
        strokeDashoffset={PERIMETRO * (1 - queda)}
        style={{ transition: 'stroke-dashoffset 900ms linear' }}
      />
    </Lienzo>
  );
}

/**
 * EL ARO DE TRAMOS — la forma de la carrera, ya terminada, en el bisel.
 *
 * Es el mismo hallazgo que `AroSegmentado` llevado al resumen: en un reloj no
 * hay sitio para un gráfico, pero el borde no cuesta altura de contenido. Así
 * que la estructura de lo que acabas de correr —cuántos fuertes, cuánto duró
 * cada uno, dónde estaban los suaves— vive ahí, y se ve de reojo en TODAS las
 * páginas sin robarle una línea a ninguna.
 *
 * Cada tramo ocupa el arco que le toca por duración. Lo fuerte, encendido; lo
 * suave, el carril apagado; un parón, nada. El naranja es la estructura, igual
 * que en vivo — no un color de dato (§9.1).
 */
export function AroTramos({ tramos }: { tramos: Tramo[] }) {
  const total = tramos.reduce((a, t) => a + t.duracionS, 0);
  if (total <= 0) return null;
  const hueco = tramos.length > 1 ? Math.min(6, PERIMETRO / (tramos.length * 4)) : 0;
  // Los arranques se acumulan ANTES del render y no dentro del `map`: mutar una
  // variable mientras se pinta es lo que hace que el segundo render salga
  // distinto del primero.
  const arranques = tramos.reduce<number[]>(
    (acc, t) => [...acc, acc[acc.length - 1]! + (t.duracionS / total) * PERIMETRO],
    [0],
  );
  return (
    <Lienzo via={false}>
      {tramos.map((t, i) => {
        const inicio = arranques[i]!;
        const paso = (t.duracionS / total) * PERIMETRO;
        const largo = Math.max(1, paso - hueco);
        return (
          <path
            key={i}
            d={TRAZADO}
            fill="none"
            stroke={t.tipo === 'fuerte' ? COLOR_ARO : COLOR_VIA}
            strokeWidth={GROSOR}
            strokeLinecap="butt"
            strokeDasharray={`${t.tipo === 'parado' ? 0 : largo} ${PERIMETRO}`}
            strokeDashoffset={-(inicio + hueco / 2)}
          />
        );
      })}
    </Lienzo>
  );
}

/**
 * El aro SEGMENTADO: una porción por repetición. Lleva el «serie 3 de 8» y el
 * avance dentro de la serie en el mismo sitio y sin gastar una línea de texto.
 *
 * `hechas` son las cerradas; la que está en curso es la siguiente y se rellena
 * con `fraccion`.
 */
export function AroSegmentado({
  total,
  hechas,
  fraccion,
}: {
  total: number;
  hechas: number;
  fraccion: number;
}) {
  const hueco = 7;
  const paso = PERIMETRO / total;
  const largo = paso - hueco;
  const avance = Math.min(1, Math.max(0, fraccion));
  return (
    <Lienzo via={false}>
      {Array.from({ length: total }, (_, i) => {
        const inicio = i * paso + hueco / 2;
        const visible = i < hechas ? largo : i === hechas ? largo * avance : 0;
        return (
          <g key={i}>
            <path
              d={TRAZADO}
              fill="none"
              stroke={COLOR_VIA}
              strokeWidth={GROSOR}
              strokeDasharray={`${largo} ${PERIMETRO}`}
              strokeDashoffset={-inicio}
            />
            {visible > 0 ? (
              <path
                d={TRAZADO}
                fill="none"
                stroke={COLOR_ARO}
                strokeWidth={GROSOR}
                strokeLinecap="butt"
                strokeDasharray={`${visible} ${PERIMETRO}`}
                strokeDashoffset={-inicio}
                style={{ transition: 'stroke-dasharray 900ms linear' }}
              />
            ) : null}
          </g>
        );
      })}
    </Lienzo>
  );
}
