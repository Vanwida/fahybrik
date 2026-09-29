'use client';

// Piezas pequeñas compartidas por las bandas de «El pulso». Cada una existe una
// sola vez: la etiqueta en mayúsculas, el chip de estado, la insignia, el bloque
// de esqueleto y la banda con su regla fina.

import type { CSSProperties, ReactNode } from 'react';
import type { EstadoSesion } from '../../kit-hoy/contrato';
import { R, S } from '../../kit-composicion/tokens';
import { IconCheck, IconEquis, IconMedio } from './iconos';
import { TEXTO_ESTADO } from './texto';
import { T } from './tokens';

/** Etiqueta de sección: 15 pt, mayúsculas con tracking (≥ 15 por el §4.1). */
export const ESTILO_ETIQUETA: CSSProperties = {
  font: `600 ${T.apoyo}px/20px var(--twin-font-sans)`,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--twin-muted)',
};

export function Etiqueta({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ ...ESTILO_ETIQUETA, ...style }}>{children}</span>;
}

/**
 * Una banda de la pantalla: sección con su regla fina arriba y su turno en la
 * entrada. `crece` es cuánto del sobrante de altura se lleva (§6.1: el sobrante
 * entra EN LAS FILAS, que centran su contenido, jamás en una cola debajo).
 */
export function Banda({
  etiqueta,
  orden,
  crece = 1,
  regla = true,
  relleno = S.m + 2,
  children,
  style,
}: {
  etiqueta: string;
  orden: number;
  crece?: number;
  regla?: boolean;
  relleno?: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      aria-label={etiqueta}
      className="pl-entra"
      style={
        {
          '--i': orden,
          flex: `${crece} 0 auto`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: `${relleno}px 0`,
          borderTop: regla ? '1px solid var(--twin-hairline)' : undefined,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </section>
  );
}

/** Bloque de esqueleto: la MISMA caja que tendrá el dato, con brillo que respeta el reduce-motion. */
export function Esq({ w, h, r = 8, style }: { w: number | string; h: number; r?: number; style?: CSSProperties }) {
  return <span aria-hidden className="pl-esq" style={{ display: 'block', width: w, height: h, borderRadius: r, flex: '0 0 auto', ...style }} />;
}

/** Chip de estado de la sesión, con el vocabulario de la app (`SessionMarkState`). */
export function ChipEstado({ estado }: { estado: EstadoSesion }) {
  const hecha = estado === 'hecha';
  const parcial = estado === 'parcial';
  const tono = hecha ? 'var(--twin-ok)' : parcial ? 'var(--twin-warning)' : 'var(--twin-muted)';
  const neutro = !hecha && !parcial;
  // El texto lleva el tono mezclado con la tinta (75/25): sobre su propio tinte, el
  // verde del claro solo daba 4,42:1 y el AA pide 4,5 (medido en la auditoría).
  const color = neutro ? tono : `color-mix(in srgb, ${tono} 75%, var(--twin-fg))`;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 28,
        padding: '0 10px',
        borderRadius: R.pill,
        font: `600 ${T.apoyo}px/1 var(--twin-font-sans)`,
        color,
        background: neutro ? 'transparent' : `color-mix(in srgb, ${tono} 14%, transparent)`,
        border: neutro ? '1px solid var(--twin-hairline-strong)' : '1px solid transparent',
        whiteSpace: 'nowrap',
        flex: '0 0 auto',
      }}
    >
      {hecha ? <IconCheck tam={15} /> : parcial ? <IconMedio tam={15} /> : estado === 'saltada' ? <IconEquis tam={14} /> : null}
      {TEXTO_ESTADO[estado]}
    </span>
  );
}

/** «AM» / «PM»: la franja, solo cuando el día trae dos sesiones (`SlotBadge`). */
export function Franja({ franja }: { franja: 'AM' | 'PM' }) {
  return (
    <span
      role="img"
      aria-label={franja === 'AM' ? 'Mañana' : 'Tarde'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 26,
        padding: '0 8px',
        borderRadius: R.s,
        border: '1px solid var(--twin-hairline-strong)',
        background: 'var(--twin-surface-sunken)',
        font: `800 ${T.apoyo}px/1 var(--twin-font-mono)`,
        letterSpacing: '0.04em',
        color: 'var(--twin-fg)',
      }}
    >
      {franja}
    </span>
  );
}

/** La insignia «Libre»: una sesión que montó el atleta, no el coach. */
export function InsigniaLibre() {
  return (
    <span
      role="img"
      aria-label="Entreno libre"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 26,
        padding: '0 10px',
        borderRadius: R.pill,
        font: `600 ${T.apoyo}px/1 var(--twin-font-sans)`,
        color: 'var(--twin-accent-text)',
        background: 'color-mix(in srgb, var(--twin-accent) 14%, transparent)',
      }}
    >
      Libre
    </span>
  );
}

