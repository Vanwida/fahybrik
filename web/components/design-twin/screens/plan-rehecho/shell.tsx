'use client';

// EL CASCARÓN DEL SUJETO DE PLAN — el mismo bloque editorial de `kit-dia/hero`
// (radio 28, tiras oblicuas, minHeight 244, reparto `space-between`), con dos
// diferencias que ese kit no tiene:
//
//  1. Un tono más, `aviso` (el «a medias»: ni aplauso ni alarma). `TONOS_PLAN`
//     extiende `TONOS` sin tocarlo; se propone subirlo al kit.
//  2. La MUESCA: el hilo que ata el día elegido del carril con la card, para que
//     se lea «esto es ese día, visto de cerca». Vive fuera del bloque recortado.
//
// No es un botón: dentro lleva una lista de partes y una nota, y la puerta de
// entrada (Empezar) es la acción anclada de abajo, la misma en todos los días.

import type { CSSProperties, ReactNode } from 'react';
import { COLOR_MODALIDAD } from '../../kit-composicion/chrome';
import { TONOS, type Tono, type TonoClave } from '../../kit-dia/hero';
import { fuente, RADIO, TABULAR, TAM, tinte, velo } from '../../kit-dia/tokens';
import { NOMBRE_MODALIDAD, type TonoPlan } from '../../kit-plan/modelo';
import type { ModalidadHoy } from '../../kit-plan/contrato';

export { NOMBRE_MODALIDAD };

export const TONOS_PLAN: Record<TonoPlan, Tono> = {
  ...TONOS,
  aviso: {
    fondo: tinte('var(--twin-warning)', 13),
    borde: velo('var(--twin-warning)', 36),
    tinta: 'var(--twin-fg)',
    apoyo: 'var(--twin-fg)',
    deco: velo('var(--twin-warning)', 10),
    foco: 'var(--twin-fg)',
  },
};

/** Los componentes de texto del kit conocen `TonoClave`; `aviso` escribe con la misma tinta que `neutro`. */
export const claveDeTono = (t: TonoPlan): TonoClave => (t === 'aviso' ? 'neutro' : t);

/** Las tiras oblicuas: el corte inclinado del logotipo, como única decoración (copia de `kit-dia/hero`). */
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

/** Donde cae el centro del chip `i` del carril (siete columnas iguales con 4 px de hueco). */
export const centroDeChip = (i: number) => `calc(${i} * ((100% - 24px) / 7 + 4px) + (100% - 24px) / 14)`;

/** La muesca: un rombo del color de la card asomando por arriba hacia el chip elegido. */
function Muesca({ indice, tono }: { indice: number; tono: TonoPlan }) {
  const t = TONOS_PLAN[tono];
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: -8,
        left: `calc(${centroDeChip(indice)} - 8px)`,
        width: 16,
        height: 16,
        boxSizing: 'border-box',
        background: t.fondo,
        borderTop: `1px solid ${t.borde}`,
        borderLeft: `1px solid ${t.borde}`,
        borderTopLeftRadius: 4,
        transform: 'rotate(45deg)',
        transition: 'left 260ms cubic-bezier(.2,.7,.2,1), background-color 200ms ease-out',
        zIndex: 2,
        pointerEvents: 'none',
      }}
    />
  );
}

export function ShellSujeto({
  tono,
  etiqueta,
  vivo,
  indiceMuesca,
  crece = true,
  children,
}: {
  tono: TonoPlan;
  /** Nombre accesible de la sección. */
  etiqueta: string;
  vivo?: 'alert' | 'status';
  /** Índice (0-6) del día del carril al que apunta la muesca. Sin él, no hay muesca. */
  indiceMuesca?: number | null;
  /**
   * Un día con contenido crece y se queda el sobrante (§6.1 `llena`). Un estado
   * sin día que mostrar (pausa, vacío, error) NO: es una sola decisión y se
   * CENTRA (`centra`), con el aire simétrico, en vez de una card enorme y vacía.
   */
  crece?: boolean;
  children: ReactNode;
}) {
  const t = TONOS_PLAN[tono];
  const estilo: CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    boxSizing: 'border-box',
    flex: crece ? '1 0 auto' : '0 0 auto',
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
    transition: 'background-color 200ms ease-out',
  };
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: crece ? '1 0 auto' : '0 0 auto' }}>
      {typeof indiceMuesca === 'number' ? <Muesca indice={indiceMuesca} tono={tono} /> : null}
      <section aria-label={etiqueta} role={vivo} style={estilo}>
        <Tiras color={t.deco} luz={t.luz} />
        {children}
      </section>
    </div>
  );
}

/** El kicker de la card: la fecha a la izquierda y, si cabe, lo que se sabe del estado a la derecha; si no cabe, baja. */
export function KickerPlan({ tono, children, aparte }: { tono: TonoPlan; children: ReactNode; aparte?: ReactNode }) {
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '6px 12px', minHeight: 32 }}>
      <span
        style={{
          ...fuente(800, TAM.suelo, 1.2),
          ...TABULAR,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: TONOS_PLAN[tono].tinta,
        }}
      >
        {children}
      </span>
      {aparte}
    </span>
  );
}

/** El título del sujeto: display de marca. Baja de escalón cuando es largo, sin dejar de ser lo mayor de la pantalla. */
export function TituloPlan({ tono, px = 44, children }: { tono: TonoPlan; px?: number; children: ReactNode }) {
  return (
    <h2
      style={{
        margin: 0,
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 3,
        overflow: 'hidden',
        ...fuente(800, px, 1.04, true),
        letterSpacing: '-0.025em',
        color: TONOS_PLAN[tono].tinta,
        textWrap: 'balance',
        overflowWrap: 'break-word',
      }}
    >
      {children}
    </h2>
  );
}

export function ApoyoPlan({ tono, children }: { tono: TonoPlan; children: ReactNode }) {
  return (
    <p style={{ margin: 0, ...fuente(500, TAM.cuerpo, 1.35), color: TONOS_PLAN[tono].apoyo, textWrap: 'pretty' }}>{children}</p>
  );
}

export const Arriba = ({ children }: { children: ReactNode }) => (
  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
);

export const Abajo = ({ children }: { children: ReactNode }) => (
  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
);

/** El color de una hairline dentro de la card: sobre el naranja sólido, un velo de su tinta; en el resto, de la tinta del tema. */
export const lineaDe = (tono: TonoPlan) => (tono === 'accion' ? velo('var(--twin-accent-on)', 30) : velo('var(--twin-fg)', 14));

/** Estilo de una pastilla que ENSEÑA un dato dentro de la card (no un control). */
export function estiloPastilla(tono: TonoPlan): { fondo: string; tinta: string; borde: string } {
  return tono === 'accion'
    ? { fondo: 'transparent', tinta: 'var(--twin-accent-on)', borde: velo('var(--twin-accent-on)', 55) }
    : { fondo: velo('var(--twin-fg)', 7), tinta: 'var(--twin-fg)', borde: velo('var(--twin-fg)', 18) };
}

/** Punto de modalidad. Sobre el naranja sólido no puede llevar su color (el de correr ES ese naranja): va en la tinta. */
export function PuntoModalidad({ modalidad, tam = 10, mono = false }: { modalidad: ModalidadHoy; tam?: number; mono?: boolean }) {
  return (
    <span
      aria-hidden
      style={{ width: tam, height: tam, borderRadius: '50%', flex: '0 0 auto', background: mono ? 'currentColor' : COLOR_MODALIDAD[modalidad] }}
    />
  );
}
