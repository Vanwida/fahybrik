'use client';

// EL NUMERAL A SANGRE, y el único apoyo que se le permite.
//
// Un solo numeral para toda la app (§10.2): la monoespaciada recta de cifra
// rachada que ya usan el EMOM y la fuerza del móvil. Recto y no cursivo — el
// reloj de hoy inclina sus cifras, pero a 100 pt sobre un lienzo de 208 la
// inclinación se come justo el ancho que el sujeto necesita y la diagonal pelea
// con la curva del bisel.
//
// El tamaño NO se escribe a mano en ninguna vista: sale de `altoSujeto`, que
// resta los apoyos que la página declara y aplica el límite del ancho. Nueve
// vistas con `fontSize` a ojo es literalmente cómo aparecieron los 631 tamaños
// escritos a mano del dashboard.

import { useEffect, useRef, type CSSProperties } from 'react';
import { ANCHO_UTIL, AVANCE_MONO, CAP_EM, UNIDAD_EM } from './modelo';
import { W } from '../screens/watch-live/theme';

/**
 * La regla de `prefers-reduced-motion` de twin.css apaga transiciones y
 * animaciones CSS, pero no llega a la API del navegador: aquí se comprueba a
 * mano para que quien la tenga puesta no reciba ni destellos ni latidos.
 */
export function sinMovimiento(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * EL SUJETO. `alto` es la altura ÓPTICA de las cifras; de ahí sale el cuerpo.
 *
 * Si aun así no cabe a lo ancho, encoge como el `minimumScaleFactor` del reloj,
 * así que el número CRECE solo al pasar de 3 cifras a 2 o al bajar la cuenta
 * atrás de un minuto. Eso no es un efecto de más: es urgencia dicha en tamaño,
 * y sale gratis del formato.
 */
export function Numeral({
  texto,
  unidad,
  alto,
  color = W.ink,
  latido = 0,
}: {
  texto: string;
  unidad?: string;
  alto: number;
  color?: string;
  /** Cambiar este número da un golpe de escala: el marcador «late» al sumar. */
  latido?: number;
}) {
  // Late al CAMBIAR, no al montar: el marcador arranca con una cifra ya puesta.
  // La animación va por la API del navegador y no por estado de React: es un
  // golpe visual de 340 ms, no información, y no tiene por qué costar renders.
  const cajaRef = useRef<HTMLDivElement>(null);
  const primeroRef = useRef(true);
  useEffect(() => {
    if (primeroRef.current) {
      primeroRef.current = false;
      return;
    }
    const el = cajaRef.current;
    if (!el || typeof el.animate !== 'function' || sinMovimiento()) return;
    const golpe = el.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
      { duration: 340, easing: 'ease-out' },
    );
    return () => golpe.cancel();
  }, [latido]);

  const cuerpo = alto / CAP_EM;
  const cuerpoUnidad = cuerpo * UNIDAD_EM;
  const ancho =
    [...texto].length * AVANCE_MONO * cuerpo +
    (unidad ? [...unidad].length * AVANCE_MONO * cuerpoUnidad : 0);
  // `altoSujeto` ya deja el texto dentro del lienzo; esto es el cinturón: si
  // una vista pasa un `alto` a mano, sigue sin comerse el bisel.
  const ajuste = ancho <= ANCHO_UTIL ? 1 : ANCHO_UTIL / ancho;

  return (
    <div ref={cajaRef} style={{ display: 'flex', alignItems: 'baseline', flex: '0 0 auto' }}>
      <span
        style={{
          fontFamily: 'var(--twin-font-mono)',
          fontSize: cuerpo * ajuste,
          // Caja de línea ceñida: lo que llena la pantalla es el GLIFO, no la caja.
          lineHeight: 0.8,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          color,
          transition: 'font-size 260ms ease-out, color 320ms ease',
        }}
      >
        {texto}
      </span>
      {unidad ? (
        <span
          style={{
            // La unidad va en la misma cara que la cifra: es la misma lectura, y
            // partirla en dos familias es justo lo que el §10.2 vino a quitar.
            fontFamily: 'var(--twin-font-mono)',
            fontSize: cuerpoUnidad * ajuste,
            lineHeight: 1,
            fontWeight: 800,
            color: W.dim,
          }}
        >
          {unidad}
        </span>
      ) : null}
    </div>
  );
}

/** Cuerpo del segundo nivel. El sujeto se mide contra esto para pesar más (§4). */
const SEGUNDO_BASE = 22;

/**
 * EL SEGUNDO NIVEL — y no hay tercero.
 *
 * Aquí va lo segundo más importante, que muchas veces es EL TRABAJO REAL
 * («10 de 12 cal», «5 × 100 kg»). El §10.6 es explícito: el trabajo no es
 * secundario y no va en gris de panel aparte.
 */
export function SegundoNivel({
  etiqueta,
  valor,
  color = W.ink,
}: {
  /** Marca de procedencia o de rol, en versales pequeñas: «GPS», «LUEGO». */
  etiqueta?: string;
  valor: string;
  color?: string;
}) {
  // Se ajusta como el sujeto, con un suelo alto: una línea de dosis larga
  // («3 de 4 · 5 × 100 kg») no puede partirse ni salirse del lienzo, pero
  // tampoco encogerse hasta dejar de leerse a distancia de brazo.
  const ancho = estimarSans(valor, SEGUNDO_BASE) + (etiqueta ? estimarSans(etiqueta, 10) + 6 : 0);
  const ajuste = ancho <= ANCHO_UTIL ? 1 : Math.max(0.7, ANCHO_UTIL / ancho);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: '0 0 auto' }}>
      {etiqueta ? <span style={versales}>{etiqueta}</span> : null}
      <span
        style={{
          fontSize: SEGUNDO_BASE * ajuste,
          lineHeight: 1.1,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          color,
          whiteSpace: 'nowrap',
        }}
      >
        {valor}
      </span>
    </div>
  );
}

/**
 * Ancho estimado en la SANS (SF Pro heavy), para lo que no es numeral. Sin
 * medición del DOM: mismo resultado en servidor y en cliente, y determinista.
 */
const AVANCE_SANS: Record<string, number> = {
  ':': 0.32,
  '.': 0.3,
  ',': 0.3,
  ' ': 0.28,
  '·': 0.34,
  '×': 0.6,
  '—': 0.62,
  '-': 0.35,
  '/': 0.4,
  '~': 0.6,
};

export function estimarSans(texto: string, cuerpo: number): number {
  let em = 0;
  for (const ch of texto) {
    em += AVANCE_SANS[ch] ?? (ch >= '0' && ch <= '9' ? 0.6 : 0.58);
  }
  return em * cuerpo;
}

/** Las versales del cromo: contexto arriba, acción y nota abajo. */
export const versales: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  color: W.dim,
  whiteSpace: 'nowrap',
};
