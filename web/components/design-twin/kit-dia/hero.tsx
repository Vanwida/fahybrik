'use client';

// El cascarón del SUJETO: un bloque editorial a todo el ancho con el tinte de
// su momento. Es la superficie dominante de la pantalla (CONTRATO §10.4: o
// manda sobre todo lo demás, o no lleva caja), así que es la única que pasa de
// 40 px de tipo y la única con este radio.
//
// Altura (§6.1): el cascarón pide `flex: 1 0 auto` y reparte con
// `space-between`, de modo que el sobrante entra ENTRE el título y su acción, en
// la propia fila, y nunca en una cola muerta debajo.

import type { CSSProperties, ReactNode } from 'react';
import { IcoFlecha } from './iconos';
import { fuente, RADIO, TAM, tinte, velo } from './tokens';

export type TonoClave = 'accion' | 'info' | 'ok' | 'soporte' | 'acento' | 'neutro' | 'peligro';

export interface Tono {
  fondo: string;
  borde: string;
  /** Título y texto fuerte. */
  tinta: string;
  /**
   * Texto de apoyo: sólido y JAMÁS un gris. Sobre un tinte (y sobre las tiras oblicuas)
   * el gris de apoyo medía 3,6-4,4:1; la tinta del tema pasa de 10:1. La jerarquía la
   * da el peso y el tamaño frente al título, no un contraste más bajo.
   */
  apoyo: string;
  /** Color de las tiras oblicuas decorativas. */
  deco: string;
  /**
   * Tiras que ACLARAN lo que tienen debajo en vez de teñirlo (sobre el naranja, una tira
   * más oscura bajaba el texto marrón de 4,57 a 4,0:1; una más clara lo sube).
   */
  luz?: boolean;
  /** Color del anillo de foco. */
  foco: string;
}

/**
 * Cada momento tiene su tinte. `accion` (el naranja de marca, sólido) es la
 * familia de «haz esto ahora»: sesión, retomar, montar. El resto son tintes
 * suaves de un token de estado sobre la superficie: el color dice el momento
 * y jamás lleva el texto (el texto es siempre la tinta del tema).
 */
export const TONOS: Record<TonoClave, Tono> = {
  accion: {
    fondo: 'var(--twin-accent)',
    borde: 'transparent',
    tinta: 'var(--twin-accent-on)',
    apoyo: 'var(--twin-accent-on)',
    deco: 'transparent',
    luz: true,
    foco: 'var(--twin-accent-on)',
  },
  info: {
    fondo: tinte('var(--twin-info)', 16),
    borde: velo('var(--twin-info)', 30),
    tinta: 'var(--twin-fg)',
    apoyo: 'var(--twin-fg)',
    deco: velo('var(--twin-info)', 12),
    foco: 'var(--twin-fg)',
  },
  ok: {
    fondo: tinte('var(--twin-ok)', 15),
    borde: velo('var(--twin-ok)', 30),
    tinta: 'var(--twin-fg)',
    apoyo: 'var(--twin-fg)',
    deco: velo('var(--twin-ok)', 12),
    foco: 'var(--twin-fg)',
  },
  soporte: {
    fondo: tinte('var(--twin-modality-support)', 15),
    borde: velo('var(--twin-modality-support)', 30),
    tinta: 'var(--twin-fg)',
    apoyo: 'var(--twin-fg)',
    deco: velo('var(--twin-modality-support)', 12),
    foco: 'var(--twin-fg)',
  },
  acento: {
    fondo: tinte('var(--twin-accent)', 15),
    borde: velo('var(--twin-accent)', 40),
    tinta: 'var(--twin-fg)',
    apoyo: 'var(--twin-fg)',
    deco: velo('var(--twin-accent)', 14),
    foco: 'var(--twin-fg)',
  },
  neutro: {
    fondo: 'var(--twin-surface)',
    borde: 'var(--twin-hairline-strong)',
    tinta: 'var(--twin-fg)',
    apoyo: 'var(--twin-fg)',
    deco: velo('var(--twin-faint)', 12),
    foco: 'var(--twin-fg)',
  },
  peligro: {
    fondo: tinte('var(--twin-danger)', 11),
    borde: velo('var(--twin-danger)', 34),
    tinta: 'var(--twin-fg)',
    apoyo: 'var(--twin-fg)',
    deco: velo('var(--twin-danger)', 10),
    foco: 'var(--twin-fg)',
  },
};

/** Las tiras oblicuas: el corte inclinado del logotipo, como única decoración. */
function Tiras({ color, luz }: { color: string; luz?: boolean }) {
  const tira = (derecha: number, ancho: number): CSSProperties => ({
    position: 'absolute',
    top: -30,
    bottom: -30,
    right: derecha,
    width: ancho,
    background: color,
    backdropFilter: luz ? 'brightness(1.12)' : undefined,
    WebkitBackdropFilter: luz ? 'brightness(1.12)' : undefined,
    transform: 'skewX(-18deg)',
    pointerEvents: 'none',
  });
  return (
    <span aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <span style={tira(-24, 84)} />
      <span style={tira(76, 22)} />
    </span>
  );
}

export function Hero({
  tono,
  onClick,
  etiqueta,
  vivo,
  children,
}: {
  tono: TonoClave;
  /** Con `onClick` el bloque entero es UN botón; sin él, una sección (lleva controles dentro). */
  onClick?: () => void;
  /** Nombre accesible del botón entero (o de la sección). */
  etiqueta?: string;
  /** Cuando algo cambia dentro y hay que anunciarlo (error, recuento). */
  vivo?: 'alert' | 'status';
  children: ReactNode;
}) {
  const t = TONOS[tono];
  const estilo: CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    boxSizing: 'border-box',
    flex: '1 0 auto',
    minHeight: 244,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 22,
    padding: '22px 22px 20px',
    borderRadius: RADIO.grande,
    background: t.fondo,
    border: `1px solid ${t.borde}`,
    color: t.tinta,
    '--hd-foco': t.foco,
  } as CSSProperties;

  if (onClick) {
    return (
      <button type="button" className="hd-toque hd-hero-btn" onClick={onClick} aria-label={etiqueta} style={estilo}>
        <Tiras color={t.deco} luz={t.luz} />
        {children}
      </button>
    );
  }
  return (
    <section aria-label={etiqueta} role={vivo} style={estilo}>
      <Tiras color={t.deco} luz={t.luz} />
      {children}
    </section>
  );
}

/** Las dos mitades del cascarón: arriba lo que es, abajo lo que haces. */
export function Arriba({ children }: { children: ReactNode }) {
  return <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</span>;
}

export function Abajo({ children }: { children: ReactNode }) {
  return <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</span>;
}

export function Kicker({ tono, children, aparte }: { tono: TonoClave; children: ReactNode; aparte?: ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 32 }}>
      <span
        style={{
          ...fuente(800, TAM.suelo, 1.2),
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: TONOS[tono].tinta,
        }}
      >
        {children}
      </span>
      {aparte}
    </span>
  );
}

/** El título del sujeto: display de marca, pesado e inclinado (herencia del logotipo). */
export function Titulo({ tono, children }: { tono: TonoClave; children: ReactNode }) {
  return (
    <span
      style={{
        display: 'block',
        ...fuente(800, TAM.display, 1.02, true),
        letterSpacing: '-0.025em',
        color: TONOS[tono].tinta,
        textWrap: 'balance',
        overflowWrap: 'break-word',
      }}
    >
      {children}
    </span>
  );
}

export function Apoyo({ tono, children }: { tono: TonoClave; children: ReactNode }) {
  return (
    <span style={{ display: 'block', ...fuente(500, TAM.cuerpo, 1.35), color: TONOS[tono].apoyo, textWrap: 'pretty' }}>
      {children}
    </span>
  );
}

/** La acción: tinta invertida (fondo = texto del tema), 52 pt, sola. El sujeto es lo que miras; esto es lo que tocas. */
export function Accion({ children, icono = <IcoFlecha tam={20} /> }: { children: ReactNode; icono?: ReactNode }) {
  return (
    <span
      className="hd-pill"
      style={{
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        height: 52,
        padding: '0 22px',
        boxSizing: 'border-box',
        borderRadius: RADIO.pastilla,
        background: 'var(--twin-fg)',
        color: 'var(--twin-bg)',
        ...fuente(800, TAM.cuerpo, 1, true),
        letterSpacing: '0.01em',
      }}
    >
      {children}
      {icono}
    </span>
  );
}
