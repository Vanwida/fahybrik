'use client';

// Las piezas pequeñas que comparten todos los bloques. Ninguna baja de 15 px.

import type { CSSProperties, ReactNode } from 'react';
import { fuente, RADIO, TABULAR, TAM } from './tokens';

/** Etiqueta en mayúsculas: 15 px, peso 700, nunca más pequeña (CONTRATO §4.1). */
export function Etiqueta({
  children,
  color = 'var(--twin-muted)',
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        ...fuente(700, TAM.suelo, 1.2),
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Rótulo en minúsculas de una tesela: el texto lo pone el dato («5 km · prueba»), así que no se fuerza a mayúsculas. */
export function Rotulo({ children }: { children: ReactNode }) {
  return <span style={{ ...fuente(700, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>{children}</span>;
}

/** Pastilla que ENSEÑA un dato (no un control). */
export function Pastilla({
  children,
  fondo,
  tinta,
  borde,
  icono,
}: {
  children: ReactNode;
  fondo: string;
  tinta: string;
  borde?: string;
  icono?: ReactNode;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 32,
        padding: '0 12px',
        borderRadius: RADIO.pastilla,
        background: fondo,
        color: tinta,
        border: borde ? `1px solid ${borde}` : undefined,
        boxSizing: 'border-box',
        ...fuente(700, TAM.suelo, 1),
        whiteSpace: 'nowrap',
      }}
    >
      {icono}
      {children}
    </span>
  );
}

/** Marcador de carga: la MISMA forma que tendrá lo que llegue. */
export function Esqueleto({
  ancho = '100%',
  alto,
  radio = 8,
  style,
}: {
  ancho?: number | string;
  alto: number;
  radio?: number;
  style?: CSSProperties;
}) {
  return <span aria-hidden className="hd-sk" style={{ width: ancho, height: alto, borderRadius: radio, ...style }} />;
}

/** Globito de recuento: el contador que reclama, no el que hay. */
export function Insignia({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: 2,
        right: 0,
        minWidth: 22,
        height: 22,
        padding: '0 5px',
        boxSizing: 'border-box',
        borderRadius: RADIO.pastilla,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--twin-accent)',
        color: 'var(--twin-accent-on)',
        boxShadow: '0 0 0 2px var(--twin-bg)',
        ...fuente(800, TAM.suelo, 1),
        ...TABULAR,
      }}
    >
      {n > 9 ? '9+' : n}
    </span>
  );
}

/** Título de sección: 24 px fuerte, cursiva de marca. */
export function TituloSeccion({ children, aparte }: { children: ReactNode; aparte?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <h2 style={{ margin: 0, ...fuente(800, TAM.seccion, 1.15, true), letterSpacing: '-0.01em', color: 'var(--twin-fg)' }}>
        {children}
      </h2>
      {aparte}
    </div>
  );
}

/** Primera letra en mayúscula (la fecha del contrato ya viene capitalizada; lo demás no). */
export function mayuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
