'use client';

// La ficha de icono de una fila (44 × 44, radio 14): la misma de «Contigo» en
// hoy-dia, que no la exporta. Es genérica (cualquier fila con glifo la usa): el
// orquestador puede subirla a `kit-dia/piezas` sin tocar nada.

import type { ReactNode } from 'react';
import { tinte, velo } from '../../kit-dia/tokens';

export type TonoFicha = 'normal' | 'realce' | 'peligro' | 'aviso';

const FONDO: Record<TonoFicha, string> = {
  normal: 'var(--twin-surface-elevated)',
  realce: 'var(--twin-accent)',
  peligro: tinte('var(--twin-danger)', 16, 'var(--twin-surface-elevated)'),
  aviso: tinte('var(--twin-warning)', 18, 'var(--twin-surface-elevated)'),
};

const BORDE: Record<TonoFicha, string> = {
  normal: 'var(--twin-hairline-strong)',
  realce: 'transparent',
  peligro: velo('var(--twin-danger)', 40),
  aviso: velo('var(--twin-warning)', 45),
};

export function Ficha({ children, tono = 'normal' }: { children: ReactNode; tono?: TonoFicha }) {
  return (
    <span
      aria-hidden
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        flex: '0 0 auto',
        display: 'grid',
        placeItems: 'center',
        boxSizing: 'border-box',
        background: FONDO[tono],
        border: `1px solid ${BORDE[tono]}`,
        color: tono === 'realce' ? 'var(--twin-accent-on)' : 'var(--twin-fg)',
      }}
    >
      {children}
    </span>
  );
}
