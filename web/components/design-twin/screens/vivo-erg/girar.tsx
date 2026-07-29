'use client';

// En vertical, el escenario de la cara de monitor no es un callejón: enseña
// EXACTAMENTE lo que vas a ver al girar, a escala. Es la estrategia
// `previsualiza` del §6.1 aplicada a una postura en vez de a un formulario.

import { Label, SP } from '../../kit';
import { CaraMonitor } from './monitor';
import type { Guion } from './motor';

// ---------------------------------------------------------------------------
// En vertical, el escenario de la cara de monitor enseña lo que vas a ver
// ---------------------------------------------------------------------------

/** Lienzo lógico en horizontal (DeviceFrame: 874×402 con sus safe areas). */
const LIENZO_ANCHO = 874;
const LIENZO_ALTO = 402;
const PREVIA_ESCALA = 0.38;

export function InvitacionAGirar({ guion }: { guion: Guion }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SP.l,
        padding: SP.l,
        textAlign: 'center',
      }}
    >
      <Label size={10}>Apoya el móvil en el ergo</Label>
      <span className="t-headline-m" style={{ maxWidth: 300 }}>Gira el teléfono y tienes la cara de monitor</span>
      <div
        aria-hidden
        style={{
          width: LIENZO_ANCHO * PREVIA_ESCALA,
          height: LIENZO_ALTO * PREVIA_ESCALA,
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid var(--twin-hairline-strong)',
          boxShadow: 'var(--twin-shadow-card)',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: LIENZO_ANCHO,
            height: LIENZO_ALTO,
            transform: `scale(${PREVIA_ESCALA})`,
            transformOrigin: 'top left',
            background: 'var(--twin-bg)',
            padding: '0 59px 21px',
            boxSizing: 'border-box',
          }}
        >
          {/* La previa corre su propio guion, así que su cronología no se
              mezcla con la de la pantalla: `onLog` no sale de aquí. */}
          <CaraMonitor guion={guion} onLog={() => undefined} />
        </div>
      </div>
      <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)', maxWidth: 320 }}>
        En el panel de la derecha tienes el conmutador de orientación. En el móvil, entra en pantalla completa y
        gíralo: el doble gira contigo.
      </span>
    </div>
  );
}
