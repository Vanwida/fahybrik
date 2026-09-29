'use client';

// Cabecera y saludo. La cabecera es la de InicioView (bandeja «Del coach» a la
// izquierda, el logotipo en el centro, chat y perfil a la derecha) con las
// áreas táctiles a 44 pt y los globitos a 15 pt. Sin coach no hay bandeja ni
// chat: ni siquiera vacíos.
//
// El saludo va en UNA línea (nombre grande a la izquierda, fecha a la derecha):
// el sujeto es el dial y cada punto de alto que come el saludo se lo quita a lo
// que toca hoy.

import type { CSSProperties, ReactNode } from 'react';
import type { LecturaHoy } from '../../kit-hoy/contrato';
import { IconBandeja, IconChat } from './iconos';
import { saludoDeLaHora } from './texto';
import { LOGO, T, TOQUE } from './tokens';

function Globito({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: -5,
        right: -3,
        minWidth: 22,
        height: 22,
        padding: '0 6px',
        boxSizing: 'border-box',
        borderRadius: 11,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--twin-accent)',
        color: 'var(--twin-accent-on)',
        font: `800 ${T.apoyo}px/1 var(--twin-font-sans)`,
        fontVariantNumeric: 'tabular-nums',
        boxShadow: '0 0 0 2px var(--twin-bg)',
      }}
    >
      {n > 9 ? '9+' : n}
    </span>
  );
}

function BotonCirculo({ etiqueta, badge = 0, onClick, children }: { etiqueta: string; badge?: number; onClick: () => void; children: ReactNode }) {
  const aria = badge > 0 ? `${etiqueta}, ${badge} ${badge === 1 ? 'pendiente' : 'pendientes'}` : etiqueta;
  return (
    <button type="button" className="pl-btn" aria-label={aria} onClick={onClick} style={{ position: 'relative', width: TOQUE, height: TOQUE, display: 'grid', placeItems: 'center' }}>
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--twin-surface-elevated)',
          border: '1px solid var(--twin-hairline-strong)',
          color: 'var(--twin-fg)',
        }}
      >
        {children}
      </span>
      <Globito n={badge} />
    </button>
  );
}

export function Cabecera({ l, appearance, onLog }: { l: LecturaHoy; appearance: 'light' | 'dark'; onLog: (linea: string) => void }) {
  const lado: CSSProperties = { width: TOQUE * 2, display: 'flex', alignItems: 'center' };
  return (
    <header className="pl-entra" style={{ '--i': 0, height: TOQUE, display: 'flex', alignItems: 'center', justifyContent: 'space-between' } as CSSProperties}>
      <div style={{ ...lado, marginLeft: -4 }}>
        {l.conCoach ? (
          <BotonCirculo etiqueta="Del coach" badge={l.comunicados} onClick={() => onLog('Del coach → abre la bandeja de comunicados')}>
            <IconBandeja tam={18} />
          </BotonCirculo>
        ) : null}
      </div>
      <span
        role="img"
        aria-label="FAHYBRID"
        style={{
          width: Math.round(LOGO.alto * LOGO.proporcion),
          height: LOGO.alto,
          backgroundImage: `url(${appearance === 'dark' ? LOGO.oscuro : LOGO.claro})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
        }}
      />
      <div style={{ ...lado, justifyContent: 'flex-end', marginRight: -4 }}>
        {l.conCoach ? (
          <BotonCirculo etiqueta="Chat con tu coach" badge={l.noLeidosChat} onClick={() => onLog('Chat → abre la conversación con tu coach')}>
            <IconChat tam={18} />
          </BotonCirculo>
        ) : null}
        <button type="button" className="pl-btn" aria-label="Tu perfil" onClick={() => onLog('Avatar → Perfil')} style={{ width: TOQUE, height: TOQUE, display: 'grid', placeItems: 'center' }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              background: 'var(--twin-surface-elevated)',
              border: '1px solid var(--twin-hairline-strong)',
              color: 'var(--twin-muted)',
              font: `700 ${T.apoyo}px/1 var(--twin-font-sans)`,
              letterSpacing: '0.02em',
            }}
          >
            {l.iniciales}
          </span>
        </button>
      </div>
    </header>
  );
}

export function Saludo({ l }: { l: LecturaHoy }) {
  const nombre = l.nombre ? `Hola, ${l.nombre}` : saludoDeLaHora(l.hora);
  return (
    <div
      className="pl-entra"
      style={{ '--i': 1, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '4px 0 6px' } as CSSProperties}
    >
      <h1
        style={{
          margin: 0,
          font: `italic 800 ${T.dato}px/34px var(--twin-font-sans)`,
          letterSpacing: '-0.01em',
          color: 'var(--twin-fg)',
          minWidth: 0,
        }}
      >
        {nombre}
      </h1>
      <span style={{ font: `500 ${T.cuerpo}px/22px var(--twin-font-sans)`, color: 'var(--twin-muted)', whiteSpace: 'nowrap' }}>{l.fecha}</span>
    </div>
  );
}

