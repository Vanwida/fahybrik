'use client';

// El cromo de arriba: «Del coach» a la izquierda, el logotipo en el centro, el
// chat y el avatar a la derecha (InicioView.header). Fijo: no scrollea nunca.
// Sin coach no hay bandeja ni chat: el hueco de la izquierda se guarda para que
// el logotipo siga centrado. Cada botón es de 48 pt y lleva su nombre accesible.

import type { ReactNode } from 'react';
import type { TwinAppearance } from '../../types';
import type { LecturaHoy } from '../../kit-hoy/contrato';
import { IcoBandeja, IcoChat } from '../../kit-dia/iconos';
import { Esqueleto, Insignia } from '../../kit-dia/piezas';
import { fuente, TAM, TOQUE } from '../../kit-dia/tokens';

export function BotonCromo({
  etiqueta,
  onClick,
  children,
  n = 0,
  apagado = false,
}: {
  etiqueta: string;
  onClick: () => void;
  children: ReactNode;
  n?: number;
  /** Sin acción y atenuado: se ve que está y que no lleva a ningún sitio (el «›» sin más semanas). */
  apagado?: boolean;
}) {
  return (
    <button
      type="button"
      className="hd-toque"
      aria-label={etiqueta}
      disabled={apagado}
      onClick={onClick}
      style={{
        width: TOQUE,
        height: TOQUE,
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        opacity: apagado ? 0.35 : 1,
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
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
      {n > 0 ? <Insignia n={n} /> : null}
    </button>
  );
}

export function Cromo({
  l,
  appearance,
  onLog,
}: {
  l: LecturaHoy;
  appearance: TwinAppearance;
  onLog: (linea: string) => void;
}) {
  const logo = appearance === 'dark' ? '/brand/fh-logo-white.png' : '/brand/fh-logo-black.png';
  // En frío los contadores y las iniciales son relleno: no se leen (contrato).
  const sinResolver = l.conCoach && !l.cargando ? l.comunicados : 0;
  const sinLeer = l.cargando ? 0 : l.noLeidosChat;
  return (
    <div
      style={{
        height: 56,
        display: 'grid',
        gridTemplateColumns: `1fr auto 1fr`,
        alignItems: 'center',
        padding: '0 8px',
      }}
    >
      <div style={{ justifySelf: 'start' }}>
        {l.conCoach ? (
          <BotonCromo
            etiqueta={sinResolver > 0 ? `Del coach, ${sinResolver} sin resolver` : 'Del coach'}
            n={sinResolver}
            onClick={() => onLog('Del coach → abriría la bandeja de comunicados')}
          >
            <IcoBandeja tam={20} />
          </BotonCromo>
        ) : (
          <span style={{ width: TOQUE, height: TOQUE }} />
        )}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt="FAHYBRID" style={{ height: 24, width: 'auto', display: 'block' }} />
      <div style={{ justifySelf: 'end', display: 'flex' }}>
        {l.conCoach ? (
          <BotonCromo
            etiqueta={sinLeer > 0 ? `Chat con tu coach, ${sinLeer} sin leer` : 'Chat con tu coach'}
            n={sinLeer}
            onClick={() => onLog('Chat → abriría el hilo con tu coach')}
          >
            <IcoChat tam={20} />
          </BotonCromo>
        ) : null}
        <button
          type="button"
          className="hd-toque"
          aria-label="Tu perfil"
          onClick={() => onLog('Avatar → Perfil')}
          style={{ width: TOQUE, height: TOQUE, display: 'grid', placeItems: 'center' }}
        >
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              background: 'var(--twin-surface-elevated)',
              border: '1px solid var(--twin-hairline-strong)',
              color: 'var(--twin-fg)',
              ...fuente(800, TAM.suelo, 1),
              letterSpacing: '0.02em',
            }}
          >
            {l.cargando ? <Esqueleto ancho={38} alto={38} radio={19} /> : l.iniciales}
          </span>
        </button>
      </div>
    </div>
  );
}
