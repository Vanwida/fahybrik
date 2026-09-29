'use client';

// EL AVISO — un mensaje que sale sobre la barra de pestañas, donde el pulgar no lo
// tapa. Dos temperamentos:
//  · `ok`     una buena noticia o la confirmación de lo que acabas de hacer: se va sola.
//  · `fallo`  algo que no salió y hay que leer: se queda hasta descartarlo con
//             «Entendido» (como la alerta de COROS de hoy), en tinta de peligro.
// El color del fallo va en la marca (el icono y el borde), nunca en el texto.

import { IcoCheck } from '../../kit-dia/iconos';
import { CROMO } from '../../kit-composicion/tokens';
import { fuente, MARGEN, RADIO, TAM, TOQUE, velo } from '../../kit-dia/tokens';

export interface AvisoActivo {
  tono: 'ok' | 'fallo';
  texto: string;
}

export function Aviso({ aviso, onCierra }: { aviso: AvisoActivo; onCierra: () => void }) {
  const fallo = aviso.tono === 'fallo';
  return (
    <div
      role={fallo ? 'alert' : 'status'}
      className="hd-aviso"
      style={{
        position: 'absolute',
        left: MARGEN,
        right: MARGEN,
        bottom: `calc(var(--twin-safe-bottom) + ${CROMO.tabBar}px + 12px)`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 52,
        padding: '10px 10px 10px 18px',
        boxSizing: 'border-box',
        borderRadius: RADIO.tarjeta,
        background: 'var(--twin-fg)',
        color: 'var(--twin-bg)',
        border: fallo ? `2px solid ${velo('var(--twin-danger)', 80)}` : 'none',
        ...fuente(700, TAM.suelo, 1.3),
        boxShadow: 'var(--twin-shadow-hero)',
        zIndex: 6,
      }}
    >
      {fallo ? (
        <span
          aria-hidden
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            flex: '0 0 auto',
            display: 'grid',
            placeItems: 'center',
            background: 'var(--twin-danger)',
            color: 'var(--twin-bg)',
            ...fuente(800, TAM.suelo, 1),
          }}
        >
          !
        </span>
      ) : (
        <IcoCheck tam={20} />
      )}
      <span style={{ flex: 1, minWidth: 0 }}>{aviso.texto}</span>
      {fallo ? (
        <button
          type="button"
          onClick={onCierra}
          style={{
            appearance: 'none',
            border: 0,
            cursor: 'pointer',
            minHeight: TOQUE,
            padding: '0 14px',
            borderRadius: RADIO.pastilla,
            background: velo('var(--twin-bg)', 16),
            color: 'var(--twin-bg)',
            ...fuente(800, TAM.suelo, 1),
          }}
        >
          Entendido
        </button>
      ) : null}
    </div>
  );
}
