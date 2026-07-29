'use client';

// Piezas comunes al «HOY» y a la propuesta del chat: si el compositor o el
// encabezado se dibujaran dos veces, la comparación mediría mi pulso en vez de
// medir la composición.

import { R, S } from '../../kit-composicion/tokens';
import { COACH, type Mensaje } from './data';

export function AvatarCoach({ tam = 36 }: { tam?: number }) {
  return (
    <span
      style={{
        width: tam,
        height: tam,
        flex: '0 0 auto',
        borderRadius: '50%',
        background: 'var(--twin-surface-elevated)',
        border: '1px solid var(--twin-hairline)',
        display: 'grid',
        placeItems: 'center',
        font: `italic 800 ${Math.round(tam * 0.4)}px/1 var(--twin-font-sans)`,
        color: 'var(--twin-accent-text)',
      }}
    >
      {COACH.inicial}
    </span>
  );
}

/** Banda 1: encabezado fijo. No afirma presencia («en línea») porque no la sabemos. */
export function CabeceraChat() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: S.m,
        padding: `14px ${S.l}px 12px`,
        borderBottom: '1px solid var(--twin-hairline)',
      }}
    >
      <AvatarCoach />
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ font: 'italic 700 15px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
          {COACH.nombre}
        </span>
        <span style={{ font: '400 11px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>Coach</span>
      </span>
      <span aria-hidden style={{ width: 32, textAlign: 'center', color: 'var(--twin-muted)', font: '600 15px/1' }}>
        ✕
      </span>
    </div>
  );
}

/** Banda 3: compositor. Ya vive anclado en la app; aquí no se toca. */
export function Compositor({ borrador }: { borrador?: string }) {
  const puedeEnviar = Boolean(borrador && borrador.trim().length > 0);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: `12px ${S.l}px 14px`,
        background: 'var(--twin-bg)',
        borderTop: '1px solid var(--twin-hairline)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--twin-muted)',
          font: '400 22px/1 var(--twin-font-sans)',
        }}
      >
        ＋
      </span>
      <span
        style={{
          flex: 1,
          minHeight: 36,
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${S.m}px`,
          borderRadius: R.pill,
          background: 'var(--twin-surface)',
          border: '1px solid var(--twin-hairline)',
          font: '400 15px/1.3 var(--twin-font-sans)',
          color: puedeEnviar ? 'var(--twin-fg)' : 'var(--twin-faint)',
        }}
      >
        {borrador || 'Escribe a Pablo…'}
      </span>
      <span
        aria-hidden
        style={{
          width: 34,
          height: 34,
          flex: '0 0 auto',
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: puedeEnviar ? 'var(--twin-accent)' : 'var(--twin-surface-sunken)',
          color: puedeEnviar ? 'var(--twin-accent-on)' : 'var(--twin-faint)',
          font: '700 15px/1 var(--twin-font-sans)',
        }}
      >
        ↑
      </span>
    </div>
  );
}

export function SeparadorDia({ children }: { children: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: `${S.s}px 0 ${S.xs}px` }}>
      <span
        style={{
          padding: '3px 10px',
          borderRadius: R.pill,
          background: 'var(--twin-surface)',
          font: '600 10.5px/1.2 var(--twin-font-sans)',
          letterSpacing: '0.04em',
          color: 'var(--twin-faint)',
        }}
      >
        {children}
      </span>
    </div>
  );
}

export function Burbuja({ m, onReintentar }: { m: Mensaje; onReintentar?: () => void }) {
  const mio = m.de === 'atleta';
  const fallido = m.envio === 'fallido';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: mio ? 'flex-end' : 'flex-start', gap: 3 }}>
      <div
        style={{
          maxWidth: '78%',
          padding: `${S.s + 1}px ${S.m}px`,
          borderRadius: 16,
          borderBottomRightRadius: mio ? 5 : 16,
          borderBottomLeftRadius: mio ? 16 : 5,
          background: mio ? 'var(--twin-accent)' : 'var(--twin-surface)',
          border: mio ? 'none' : '1px solid var(--twin-hairline)',
          color: mio ? 'var(--twin-accent-on)' : 'var(--twin-fg)',
          font: '400 15px/1.4 var(--twin-font-sans)',
          opacity: fallido ? 0.55 : 1,
        }}
      >
        {m.texto}
      </div>
      {fallido ? (
        // La rama de error de HOY se queda sin salida. Aquí el reintento vive
        // pegado al mensaje que falló, que es donde el atleta lo busca.
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: S.s }}>
          <span style={{ font: '500 11px/1.2 var(--twin-font-sans)', color: 'var(--twin-danger)' }}>No se envió</span>
          <button
            type="button"
            onClick={onReintentar}
            style={{
              all: 'unset',
              cursor: 'pointer',
              font: '650 11px/1.2 var(--twin-font-sans)',
              color: 'var(--twin-accent-text)',
            }}
          >
            Reintentar
          </button>
        </span>
      ) : (
        <span style={{ font: '500 10.5px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{m.hora}</span>
      )}
    </div>
  );
}
