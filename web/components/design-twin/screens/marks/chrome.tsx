'use client';

// Los átomos que ambas vistas de «Tus marcas» comparten, transcritos del Swift:
// la barra de navegación inline de iOS, CardSurface (Theme/Atoms.swift) y
// LabelText. El marco del doble ya pinta isla y barra de estado — aquí empieza
// justo debajo.

import type { CSSProperties, ReactNode } from 'react';

/** Alto de una navigationBar `.inline` en iOS. */
export const NAVBAR_H = 44;

export interface NavBack {
  /** Título de la pantalla anterior. Vacío = solo el galón (iOS lo hace cuando no cabe). */
  label?: string;
  /** Ausente = el destino queda fuera del doble; el galón se pinta pero no navega. */
  onTap?: () => void;
}

/**
 * Barra de navegación inline. En reposo es transparente (scrollEdgeAppearance);
 * en cuanto el contenido se mete por debajo aparece el material difuminado y la
 * costura — exactamente como decide iOS, no como decide la pantalla.
 */
export function NavBar({
  title,
  back,
  scrolled,
}: {
  title: string;
  /** Ausente = raíz de pestaña (sin botón atrás). */
  back?: NavBack;
  scrolled: boolean;
}) {
  const backStyle: CSSProperties = {
    position: 'absolute',
    left: 8,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 8px',
    border: 0,
    background: 'transparent',
    color: 'var(--twin-accent)',
    font: '400 17px/1 var(--twin-font-sans)',
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: NAVBAR_H,
        display: 'flex',
        alignItems: 'center',
        zIndex: 2,
        background: scrolled ? 'color-mix(in srgb, var(--twin-bg) 78%, transparent)' : 'transparent',
        backdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'none',
        borderBottom: `0.5px solid ${scrolled ? 'var(--twin-hairline-strong)' : 'transparent'}`,
        transition: 'background-color 180ms ease-out, border-color 180ms ease-out',
      }}
    >
      {back &&
        (back.onTap ? (
          <button
            type="button"
            onClick={back.onTap}
            aria-label={back.label ? `Volver a ${back.label}` : 'Volver'}
            style={{ ...backStyle, cursor: 'pointer' }}
          >
            <ChevronLeft />
            {back.label}
          </button>
        ) : (
          <span aria-hidden style={backStyle}>
            <ChevronLeft />
            {back.label}
          </span>
        ))}
      <span
        style={{
          position: 'absolute',
          left: 72,
          right: 72,
          textAlign: 'center',
          font: '600 17px/1.2 var(--twin-font-sans)',
          color: 'var(--twin-fg)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </span>
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg width="11" height="18" viewBox="0 0 11 18" aria-hidden>
      <path
        d="M9.4 1.6 2 9l7.4 7.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronRight() {
  return (
    <svg width="8" height="13" viewBox="0 0 8 13" aria-hidden style={{ flexShrink: 0 }}>
      <path
        d="M1.4 1.4 6.6 6.5l-5.2 5.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * CardSurface: relleno degradado (la cara con luz cenital), costura de hairline
 * más viva arriba y sombra blanda para que flote sobre el lienzo.
 */
export function Card({
  padding = 16,
  children,
  style,
}: {
  padding?: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className="tw-card"
      style={{
        padding,
        background:
          'linear-gradient(to bottom, var(--twin-surface), color-mix(in srgb, var(--twin-surface) 92%, transparent))',
        boxShadow: 'var(--twin-shadow-card), inset 0 1px 0 var(--twin-hairline-strong)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** LabelText: micro-etiqueta 11 pt semibold, mayúsculas, tracking 0.16em. */
export function Micro({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="t-data-label" style={{ color: 'var(--twin-muted)', ...style }}>
      {children}
    </div>
  );
}

/** Separador de fila dentro de una card (Divider + hairline, sangrado a la izquierda). */
export function Hairline({ inset }: { inset: number }) {
  return <div style={{ height: 1, background: 'var(--twin-hairline)', marginLeft: inset }} />;
}

/** Valor de instrumento: mono recto, tabular, como todos los números de la app. */
export function Mono({
  children,
  size,
  weight = 700,
  color = 'var(--twin-fg)',
}: {
  children: ReactNode;
  size: number;
  weight?: number;
  color?: string;
}) {
  return (
    <span
      style={{
        font: `${weight} ${size}px/1.1 var(--twin-font-mono)`,
        fontVariantNumeric: 'tabular-nums',
        color,
      }}
    >
      {children}
    </span>
  );
}
