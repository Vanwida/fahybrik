'use client';

// El lienzo teñido por la zona de pulso (§10.1) — el fondo de las dos caras.
//
// Vive aquí y no dentro de `hoy`/`propuesta` porque las dos lo necesitan igual:
// el diagnóstico y la propuesta tienen que verse sobre el MISMO fondo, o la
// comparación mide dos cosas a la vez.

import type { ReactNode } from 'react';
import type { TwinAppearance } from '../../types';
import { Ambiente, type Zona } from '../../kit-vivo';

export function Lienzo({
  zona,
  appearance,
  children,
}: {
  zona: Zona | null;
  appearance: TwinAppearance;
  children: ReactNode;
}) {
  return (
    <div style={{ position: 'relative', height: '100%', background: 'var(--twin-bg)' }}>
      <Ambiente zona={zona} appearance={appearance} />
      <div style={{ position: 'relative', height: '100%' }}>{children}</div>
    </div>
  );
}
