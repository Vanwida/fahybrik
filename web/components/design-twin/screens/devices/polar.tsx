'use client';

// Vincular Polar: el navegador dentro de la app (SafariView → SFSafariViewController).
//
// La app pide al backend la URL de autorización y la abre AQUÍ, con el botón de
// cierre en «Cerrar», la barra en surface y los controles en el naranja de texto
// (Shared/SafariView.swift). El callback NO vuelve a la app: aterriza en una
// página web nuestra, y por eso la fila de Polar solo se refresca al cerrar.

import { Glyph } from './glyphs';
import { Spinner } from './atoms';
import { APP_HOST, POLAR_AUTH_HOST, SP } from './tokens';

/** Dónde está el navegador: en la web de Polar o ya de vuelta en la nuestra. */
export type PasoNavegador = 'autorizando' | 'callback';

export function PolarSafari({ paso, onCerrar }: { paso: PasoNavegador; onCerrar: () => void }) {
  const host = paso === 'autorizando' ? POLAR_AUTH_HOST : APP_HOST;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <BarraSuperior host={host} cargando={paso === 'autorizando'} onCerrar={onCerrar} />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {paso === 'autorizando' ? <PaginaDeTerceros /> : <PaginaCallback />}
      </div>
      <BarraInferior />
    </div>
  );
}

function BarraSuperior({ host, cargando, onCerrar }: { host: string; cargando: boolean; onCerrar: () => void }) {
  return (
    <div style={{ position: 'relative', flex: 'none', background: 'var(--twin-surface)' }}>
      <div
        style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${SP.l}px`,
          gap: SP.m,
        }}
      >
        <button
          type="button"
          onClick={onCerrar}
          style={{
            all: 'unset',
            cursor: 'pointer',
            font: '400 17px/1 var(--twin-font-sans)',
            color: 'var(--twin-accent-text)',
            flex: 'none',
          }}
        >
          Cerrar
        </button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <Glyph name="lock.fill" size={11} color="var(--twin-muted)" />
          <span
            style={{
              font: '400 15px/1 var(--twin-font-sans)',
              color: 'var(--twin-fg)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {host}
          </span>
        </span>
        {/* Hueco simétrico al botón Cerrar para que el dominio quede centrado. */}
        <span style={{ width: 44, flex: 'none' }} />
      </div>
      {cargando && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            height: 2,
            background: 'var(--twin-accent-text)',
            animation: 'twin-progress 2s ease-out forwards',
          }}
        />
      )}
      <div style={{ height: 1, background: 'var(--twin-hairline)' }} />
    </div>
  );
}

function BarraInferior() {
  const icon = (name: 'chevron.left' | 'chevron.right' | 'square.and.arrow.up' | 'book', apagado = false) => (
    <span style={{ opacity: apagado ? 0.3 : 1, color: 'var(--twin-accent-text)' }}>
      <Glyph name={name} size={20} weight={2} />
    </span>
  );
  return (
    <div
      aria-hidden
      style={{
        flex: 'none',
        background: 'var(--twin-surface)',
        borderTop: '1px solid var(--twin-hairline)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        height: 49,
        paddingBottom: 'var(--twin-safe-bottom)',
        boxSizing: 'content-box',
      }}
    >
      {icon('chevron.left', true)}
      {icon('chevron.right', true)}
      {icon('square.and.arrow.up')}
      {icon('book')}
    </div>
  );
}

/**
 * La página de Polar es de Polar: aquí NO se transcribe nada suyo. Lo honesto es
 * lo que el atleta ve mientras carga — el navegador trabajando sobre su dominio.
 */
function PaginaDeTerceros() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--twin-surface-elevated)' }}>
      <Spinner size={26} color="var(--twin-faint)" />
    </div>
  );
}

/**
 * La página del callback (web/app/api/polar/callback/route.ts). Es HTML plano
 * con los colores escritos a mano, así que se ve igual en claro y en oscuro:
 * por eso aquí los hex son literales y no vars del tema. Cambiar uno sin tocar
 * la ruta sería mentir.
 */
const CALLBACK = { bg: '#0A0A0A', fg: '#F5F5F5', muted: '#A1A1A1', accent: '#F06A2A' } as const;

function PaginaCallback() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: CALLBACK.bg,
        color: CALLBACK.fg,
        fontFamily: 'var(--twin-font-sans)',
      }}
    >
      <div style={{ maxWidth: 340, width: '100%', textAlign: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 24px',
            background: 'rgba(240,106,42,0.12)',
            border: `1px solid ${CALLBACK.accent}`,
            color: CALLBACK.accent,
            fontSize: 28,
            lineHeight: 1,
          }}
        >
          ✓
        </div>
        <h1 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
          Cuenta Polar conectada
        </h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: CALLBACK.muted }}>Ya puedes volver a la app.</p>
      </div>
    </div>
  );
}
