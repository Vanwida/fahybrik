'use client';

// Átomos transcritos de ios/FAHYBRIK/Theme/Atoms.swift para esta pantalla.
// Cada uno lleva al lado el atomo SwiftUI que espeja; si Atoms.swift cambia,
// esto cambia en el mismo lote.

import type { CSSProperties, ReactNode } from 'react';

/** Theme.Spacing. */
export const SP = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
/** Theme.Radius. */
export const RAD = { s: 6, m: 10, l: 14, xl: 20 } as const;

// ---------------------------------------------------------------------------
// CardSurface
// ---------------------------------------------------------------------------

export interface CardProps {
  children: ReactNode;
  padding?: number;
  radius?: number;
  /** Filo de acento de 2 px arriba (CardSurface.topAccent). */
  topAccent?: boolean;
  /** Filo de acento de 3 px a la izquierda (CardSurface.leftAccent). */
  leftAccent?: boolean;
  /** Sube la cara a la capa más clara + sombra hero. */
  elevated?: boolean;
  style?: CSSProperties;
}

export function Card({
  children,
  padding = SP.l,
  radius = RAD.l,
  topAccent = false,
  leftAccent = false,
  elevated = false,
  style,
}: CardProps) {
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: radius,
        overflow: 'hidden',
        // Relleno en capas: degradado casi vertical elevado → surface, para que
        // la cara tenga un brillo superior en vez de ser una losa plana.
        background: elevated
          ? 'linear-gradient(to bottom, var(--twin-surface-elevated), var(--twin-surface))'
          : 'linear-gradient(to bottom, var(--twin-surface), color-mix(in srgb, var(--twin-surface) 92%, transparent))',
        boxShadow: elevated ? 'var(--twin-shadow-hero)' : 'var(--twin-shadow-card)',
        ...style,
      }}
    >
      {topAccent && <div style={{ height: 2, background: 'var(--twin-accent)' }} />}
      <div style={{ padding }}>{children}</div>
      {leftAccent && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--twin-accent)' }} />
      )}
      {/* Costura hairline, algo más viva en el borde superior (el labio iluminado). */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          border: '1px solid transparent',
          background:
            'linear-gradient(to bottom, var(--twin-hairline-strong), var(--twin-hairline)) border-box',
          WebkitMask: 'linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** LabelText — micro-etiqueta en versales con tracking. */
export function Label({
  children,
  color = 'var(--twin-muted)',
  size = 11,
  style,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        font: `600 ${size}px/1.1 var(--twin-font-sans)`,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** MonoText — cifras tabulares de instrumento. */
export function Mono({
  children,
  size = 13,
  weight = 500,
  color = 'var(--twin-fg)',
  italic = false,
  style,
}: {
  children: ReactNode;
  size?: number;
  weight?: number;
  color?: string;
  italic?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        font: `${italic ? 'italic ' : ''}${weight} ${size}px/1.1 var(--twin-font-mono)`,
        fontVariantNumeric: 'tabular-nums',
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Título en la voz Fabrik: cursiva heavy. */
export function Display({
  children,
  size,
  color = 'var(--twin-fg)',
  tracking = '-0.01em',
  style,
}: {
  children: ReactNode;
  size: number;
  color?: string;
  tracking?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        font: `italic 800 ${size}px/1.1 var(--twin-font-sans)`,
        letterSpacing: tracking,
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Hairline({ style }: { style?: CSSProperties }) {
  return <div aria-hidden style={{ height: 1, background: 'var(--twin-hairline)', ...style }} />;
}

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

/** ExpertPrimaryButton — relleno naranja, glifo accentOn, cursiva heavy. */
export function CTA({
  title,
  onClick,
  height = 54,
  style,
}: {
  title: string;
  onClick: () => void;
  height?: number;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tw-btn-primary"
      style={{ width: '100%', height, fontSize: 16, letterSpacing: '0.06em', ...style }}
    >
      {title}
    </button>
  );
}

/** El botón contextual de abajo del HUD (TERMINAR / SALTAR). */
export function BottomButton({ title, onClick }: { title: string; onClick: () => void }) {
  return <CTA title={title} onClick={onClick} height={58} />;
}

/** Botón circular de chrome (salir / atrás), 34 pt. */
export function RoundButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        width: 34,
        height: 34,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--twin-surface-elevated)',
        border: '1px solid var(--twin-hairline)',
        color: 'var(--twin-fg)',
        cursor: 'pointer',
        padding: 0,
        flex: '0 0 auto',
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Avisos — el patrón de la app para aviso inline (fondo tinte + icono)
// ---------------------------------------------------------------------------

export function Notice({
  tone,
  children,
}: {
  tone: 'warning' | 'ok' | 'accent';
  children: ReactNode;
}) {
  const color = `var(--twin-${tone === 'accent' ? 'accent-text' : tone})`;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: SP.s,
        padding: SP.m,
        borderRadius: RAD.m,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color: 'var(--twin-fg)',
      }}
    >
      <span style={{ color, display: 'inline-flex', flex: '0 0 auto', paddingTop: 1 }}>
        <IconWarning />
      </span>
      <span style={{ font: '500 13px/1.35 var(--twin-font-sans)' }}>{children}</span>
    </div>
  );
}

/** PM5ProgramBanner — una línea honesta mientras se programa la pieza. */
export function ProgramLine({ text, tone }: { text: string; tone: 'accent' | 'ok' }) {
  const color = tone === 'accent' ? 'var(--twin-accent-text)' : 'var(--twin-ok)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SP.s,
        padding: 10,
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      }}
    >
      <span style={{ color, display: 'inline-flex' }}>
        {tone === 'accent' ? <Spinner size={14} /> : <IconCheckCircle />}
      </span>
      <span style={{ font: '600 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{text}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Iconos — SVG mínimos, equivalentes a los SF Symbols que usa la app
// ---------------------------------------------------------------------------

/** ProgressView: SMIL en vez de keyframes CSS (aquí no hay hoja de estilos). */
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="8" cy="8" r="6" opacity="0.2" />
        <path d="M8 2a6 6 0 0 1 6 6">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 8 8"
            to="360 8 8"
            dur="0.9s"
            repeatCount="indefinite"
          />
        </path>
      </g>
    </svg>
  );
}

export function IconWarning({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M8 1.6 15 14H1L8 1.6Z" fill="currentColor" />
      <path d="M8 6v3.6" stroke="var(--twin-bg)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r="0.85" fill="var(--twin-bg)" />
    </svg>
  );
}

export function IconCheckCircle({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="m4.9 8.2 2.1 2.1 4-4.3" fill="none" stroke="var(--twin-bg)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconRower({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.4" cy="3.9" r="1.6" fill="currentColor" stroke="none" />
      <path d="M4 15.4h12" />
      <path d="M11.8 7.2 8.4 9.6l2.6 2.4-.9 3.4" />
      <path d="M11.8 7.2 15 8.8" />
      <path d="M8.4 9.6 5.2 8.2" />
    </svg>
  );
}

export function IconAntenna({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4.4 11.6a5 5 0 0 1 0-7.2" />
      <path d="M11.6 4.4a5 5 0 0 1 0 7.2" />
      <path d="M2.1 13.9a8.3 8.3 0 0 1 0-11.8" />
      <path d="M13.9 2.1a8.3 8.3 0 0 1 0 11.8" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconChevron({ dir = 'right', size = 13 }: { dir?: 'left' | 'right'; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      style={{ transform: dir === 'left' ? 'scaleX(-1)' : undefined }}
    >
      <path d="m6 3.4 5 4.6-5 4.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconClose({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M3.6 3.6 12.4 12.4M12.4 3.6 3.6 12.4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function IconTrophy({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5.5H4.6v1.2A3.4 3.4 0 0 0 8 10.1" />
      <path d="M17 5.5h2.4v1.2A3.4 3.4 0 0 1 16 10.1" />
      <path d="M12 13v4M9 20h6M10 17h4" />
    </svg>
  );
}
