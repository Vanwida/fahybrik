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

// ---------------------------------------------------------------------------
// Los tres arquetipos de vacío de MarksLibraryView.content: cargando, fallo de
// carga, catálogo vacío. Un guion no es un dato — se omite o se explica con
// palabras (CONTRATO-UI §6.2 bis / §7).
// ---------------------------------------------------------------------------

/** ProgressView().tint(accentText) — el indeterminado de iOS, sin título ni frase. */
export function Spinner({ size = 26 }: { size?: number }) {
  return (
    <>
      {/* Nombre propio (`marks-spin`) para no chocar con el keyframe de otra pantalla. */}
      <style>{'@keyframes marks-spin { to { transform: rotate(360deg); } }'}</style>
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          borderRadius: '50%',
          border: `${Math.max(2, size / 10)}px solid color-mix(in srgb, var(--twin-accent-text) 25%, transparent)`,
          borderTopColor: 'var(--twin-accent-text)',
          animation: 'marks-spin 780ms linear infinite',
        }}
      />
    </>
  );
}

function IconRetry({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 12a8 8 0 1 1-2.34-5.66"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M20 4v5h-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconStopwatch({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 13V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9.5 2h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 2v2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconClock({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** El símbolo del vacío: `arrow.clockwise` (fallo) o `stopwatch` (catálogo vacío). */
export function EmptySymbol({ tipo, size = 34 }: { tipo: 'reintentar' | 'cronometro'; size?: number }) {
  return (
    <span aria-hidden style={{ color: 'var(--twin-faint)', display: 'inline-flex' }}>
      {tipo === 'reintentar' ? <IconRetry size={size} /> : <IconStopwatch size={size} />}
    </span>
  );
}

/** La salida del vacío (`EmptyStateExit`): una acción de aquí mismo, o una nota de qué falta y quién lo llena. */
export type VacioSalida = { tipo: 'accion'; texto: string; onTap: () => void } | { tipo: 'explicado'; nota: string };

/**
 * RedesignEmptyState — símbolo mudo, título, frase y la salida, siempre. Nunca
 * un guion, nunca un callejón sin salida: `salida` es obligatoria porque cada
 * sitio de uso tiene que decidir cuál de las dos es.
 */
export function VacioHonesto({
  simbolo,
  titulo,
  mensaje,
  salida,
}: {
  simbolo: ReactNode;
  titulo: string;
  mensaje: string;
  salida: VacioSalida;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '0 24px',
        textAlign: 'center',
      }}
    >
      {simbolo}
      <span style={{ font: 'italic 800 17px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{titulo}</span>
      <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{mensaje}</span>
      {salida.tipo === 'accion' ? (
        <button
          type="button"
          className="tw-btn-primary"
          onClick={salida.onTap}
          style={{ height: 50, width: '100%', maxWidth: 280, letterSpacing: 1, marginTop: 4 }}
        >
          {salida.texto}
        </button>
      ) : (
        <NotaSalida nota={salida.nota} />
      )}
    </div>
  );
}

/** La caja de nota compartida (`noteBox`): lo que hace falta y de quién depende — nunca un botón falso. */
function NotaSalida({ nota }: { nota: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 12px',
        marginTop: 4,
        maxWidth: 280,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        borderRadius: 10,
      }}
    >
      <span style={{ color: 'var(--twin-faint)', display: 'inline-flex', paddingTop: 1 }}>
        <IconClock />
      </span>
      <span style={{ font: '500 12px/1.4 var(--twin-font-sans)', color: 'var(--twin-faint)', textAlign: 'left' }}>
        {nota}
      </span>
    </div>
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
