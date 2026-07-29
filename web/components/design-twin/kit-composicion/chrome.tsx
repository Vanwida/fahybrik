'use client';

// El armazón que hace aplicable el §6.1: una pantalla se construye DECLARANDO
// qué hace con su altura, no apilando desde arriba y dejando el resto negro.
//
// `Pantalla` son tres bandas: cabecera fija · cuerpo (con estrategia) · acción
// anclada. Es la traducción a React de `ScreenScaffold.swift` + `CenteredScreen`
// + `.anchoredAction {}`, que ya existen en Swift y que estas cuatro pantallas
// no usaban.

import type { CSSProperties, ReactNode } from 'react';
import { CROMO, R, S, type Estrategia } from './tokens';

// ---------------------------------------------------------------------------
// El armazón de tres bandas
// ---------------------------------------------------------------------------

export interface PantallaProps {
  /** Banda 1 — no scrollea nunca. */
  cabecera?: ReactNode;
  /** §6.1: la estrategia es obligatoria. No hay «apilar arriba». */
  estrategia: Estrategia;
  /** Banda 3 — anclada abajo, siempre visible (§6 regla 3). */
  accion?: ReactNode;
  /** Banda 3 alternativa — un pie que trae su propio marco (el compositor del chat). */
  pie?: ReactNode;
  /** Banda 3 bis — barra de pestañas del TabView, cuando la pantalla es raíz. */
  tabBar?: ReactNode;
  children: ReactNode;
}

export function Pantalla({ cabecera, estrategia, accion, pie, tabBar, children }: PantallaProps) {
  // `llena` scrollea solo cuando desborda; `centra` reparte el aire de forma
  // simétrica (no una cola); `previsualiza` deja que el sobrante SEA el sujeto.
  const cuerpo: CSSProperties =
    estrategia === 'centra'
      ? { flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }
      : estrategia === 'previsualiza'
        ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
        : estrategia === 'gobierna'
          ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'stretch' }
          : { flex: 1, minHeight: 0 };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }} data-estrategia={estrategia}>
      {cabecera ? <div style={{ flex: '0 0 auto' }}>{cabecera}</div> : null}
      <div className={estrategia === 'llena' ? 'twin-scroll' : undefined} style={cuerpo}>
        {children}
      </div>
      {accion ? (
        <div
          style={{
            flex: '0 0 auto',
            padding: `${S.m}px ${S.l}px ${S.l}px`,
            background: 'var(--twin-bg)',
            borderTop: '1px solid var(--twin-hairline)',
          }}
        >
          {accion}
        </div>
      ) : null}
      {pie ? <div style={{ flex: '0 0 auto' }}>{pie}</div> : null}
      {tabBar ? <div style={{ flex: '0 0 auto' }}>{tabBar}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cromo
// ---------------------------------------------------------------------------

export function NavBar({
  titulo,
  atras,
  cerrar,
  accionDerecha,
}: {
  titulo: string;
  atras?: boolean;
  cerrar?: boolean;
  accionDerecha?: ReactNode;
}) {
  return (
    <div
      style={{
        height: CROMO.navBar,
        display: 'flex',
        alignItems: 'center',
        padding: `0 ${S.s}px`,
        borderBottom: '1px solid var(--twin-hairline)',
      }}
    >
      <span style={{ width: 44, display: 'inline-flex', justifyContent: 'center', color: 'var(--twin-accent-text)' }}>
        {atras ? (
          <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
            <path d="m10 3.4-5 4.6 5 4.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : cerrar ? (
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
            <path d="M3.5 3.5l9 9m0-9-9 9" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        ) : null}
      </span>
      <span style={{ flex: 1, textAlign: 'center', font: '600 17px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        {titulo}
      </span>
      <span style={{ width: 44, display: 'inline-flex', justifyContent: 'center' }}>{accionDerecha}</span>
    </div>
  );
}

const TABS = ['Inicio', 'Plan', 'Analíticas', 'Carreras', 'Perfil'] as const;

/** La barra del TabView. Se pinta para que el alto muerto se mida DE VERDAD. */
export function TabBar({ activa }: { activa: (typeof TABS)[number] }) {
  return (
    <div
      style={{
        height: CROMO.tabBar,
        display: 'flex',
        alignItems: 'center',
        borderTop: '1px solid var(--twin-hairline)',
        background: 'var(--twin-bg)',
      }}
    >
      {TABS.map((t) => (
        <span
          key={t}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            font: '500 10px/1 var(--twin-font-sans)',
            color: t === activa ? 'var(--twin-accent-text)' : 'var(--twin-faint)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 17,
              height: 17,
              borderRadius: 4,
              border: `1.6px solid currentColor`,
              opacity: t === activa ? 1 : 0.55,
            }}
          />
          {t}
        </span>
      ))}
    </div>
  );
}

/** brandSurface(): superficie + hairline + radio continuo. */
export function Card({
  children,
  padding = S.l,
  elevada = false,
  style,
}: {
  children: ReactNode;
  padding?: number;
  elevada?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: elevada ? 'var(--twin-surface-elevated)' : 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        borderRadius: R.l,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** SectionHeader del Perfil: 10 pt semibold, tracking 1,6, mayúsculas. */
export function Seccion({ children, accesorio }: { children: ReactNode; accesorio?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: S.s }}>
      <span
        style={{
          font: '600 10px/1.2 var(--twin-font-sans)',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--twin-muted)',
        }}
      >
        {children}
      </span>
      {accesorio}
    </div>
  );
}

/** LabelText — etiqueta en mayúsculas dentro de una tarjeta. */
export function Etiqueta({ children, color = 'var(--twin-faint)' }: { children: ReactNode; color?: string }) {
  return (
    <span
      style={{
        font: '700 10.5px/1.1 var(--twin-font-sans)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color,
      }}
    >
      {children}
    </span>
  );
}

export function Hairline() {
  return <div style={{ height: 1, background: 'var(--twin-hairline)' }} />;
}

export function Chevron() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden style={{ color: 'var(--twin-faint)', flex: '0 0 auto' }}>
      <path d="m6 3.4 5 4.6-5 4.6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BotonPrimario({
  children,
  onClick,
  ancho = true,
}: {
  children: ReactNode;
  onClick?: () => void;
  ancho?: boolean;
}) {
  return (
    <button type="button" className="tw-btn-primary" onClick={onClick} style={ancho ? { width: '100%' } : undefined}>
      {children}
    </button>
  );
}

export function BotonSecundario({
  children,
  onClick,
  ancho = true,
}: {
  children: ReactNode;
  onClick?: () => void;
  ancho?: boolean;
}) {
  return (
    <button type="button" className="tw-btn-secondary" onClick={onClick} style={ancho ? { width: '100%' } : undefined}>
      {children}
    </button>
  );
}

/**
 * Los cubos canónicos de modalidad (Theme.swift, `Theme.Modality.Kind`). Un
 * punto no puede tener un color que no salga de aquí — correr es el naranja de
 * marca y los ergómetros el azul de máquina, y eso no se decide por pantalla.
 */
export type Modalidad = 'run' | 'ergo' | 'strength' | 'functional' | 'hyrox' | 'support' | 'other';

export const COLOR_MODALIDAD: Record<Modalidad, string> = {
  run: 'var(--twin-accent)',
  ergo: 'var(--twin-info)',
  strength: 'var(--twin-modality-strength)',
  functional: 'var(--twin-modality-functional)',
  hyrox: 'var(--twin-modality-hyrox)',
  support: 'var(--twin-modality-support)',
  other: 'var(--twin-neutral)',
};

export function PuntoModalidad({ modalidad, tam = 8 }: { modalidad: Modalidad; tam?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: tam,
        height: tam,
        borderRadius: '50%',
        background: COLOR_MODALIDAD[modalidad],
        flex: '0 0 auto',
      }}
    />
  );
}

/** Píldora de estado (en curso · calibrado · sin medir). */
export function Pastilla({ children, tono = 'neutro' }: { children: ReactNode; tono?: 'neutro' | 'acento' | 'ok' | 'aviso' }) {
  const color =
    tono === 'acento'
      ? 'var(--twin-accent-text)'
      : tono === 'ok'
        ? 'var(--twin-ok)'
        : tono === 'aviso'
          ? 'var(--twin-warning)'
          : 'var(--twin-faint)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: R.pill,
        font: '650 10.5px/1.2 var(--twin-font-sans)',
        letterSpacing: '0.02em',
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
