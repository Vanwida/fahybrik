'use client';

// EL AVATAR — tres caras y una chapita.
//
//  · con foto        la de la persona. En el doble no hay fotos de atletas (todos
//                    son inventados), así que aquí es un MARCADOR dibujado con
//                    tokens: un fondo de luz y un busto. En la app es la URL.
//  · con nombre      el círculo naranja de la marca con sus iniciales (lo de siempre).
//  · sin nombre      la silueta, no unas iniciales vacías: un círculo con un guion
//                    no es un dato del atleta (§7). Mismo glifo y misma proporción
//                    que `CoachAvatar` (0,42 del diámetro).
//
// La chapita de cámara es lo que cuenta que el círculo se toca: sin ella el
// atleta no tiene forma de saber que ahí se pone su cara (ProfileView.identityAvatar).

import { IcoCamara, IcoSilueta } from '../../kit-perfil/iconos';
import { fuente, tinte, velo } from '../../kit-dia/tokens';

const FOTO_MARCADOR = [
  `radial-gradient(circle at 30% 22%, ${velo('var(--twin-fg)', 26)}, transparent 48%)`,
  `linear-gradient(160deg, ${tinte('var(--twin-info)', 46, 'var(--twin-surface-elevated)')}, ${tinte('var(--twin-modality-strength)', 40, 'var(--twin-surface-elevated)')})`,
].join(', ');

function Busto() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden style={{ position: 'absolute', inset: 0 }}>
      <circle cx="50" cy="41" r="15.5" fill="var(--twin-fg)" opacity="0.58" />
      <path d="M17 100c0-19.5 14.5-33 33-33s33 13.5 33 33z" fill="var(--twin-fg)" opacity="0.58" />
    </svg>
  );
}

export function Avatar({
  tam = 88,
  iniciales,
  foto,
  onClick,
}: {
  tam?: number;
  /** Vacías = todavía sin nombre: silueta. */
  iniciales: string;
  foto: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={onClick}
      aria-label={foto ? 'Cambiar tu foto de perfil' : 'Poner tu foto de perfil'}
      style={{ width: tam, height: tam, position: 'relative', flex: '0 0 auto', borderRadius: '50%' }}
    >
      <span
        style={{
          position: 'relative',
          overflow: 'hidden',
          width: tam,
          height: tam,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          boxSizing: 'border-box',
          background: foto ? FOTO_MARCADOR : 'var(--twin-accent)',
          color: 'var(--twin-accent-on)',
          border: foto ? '1px solid var(--twin-hairline-strong)' : 'none',
        }}
      >
        {foto ? (
          <Busto />
        ) : iniciales === '' ? (
          <IcoSilueta tam={Math.round(tam * 0.46)} />
        ) : (
          <span style={{ ...fuente(800, Math.round(tam * 0.38), 1, true), letterSpacing: '-0.01em' }}>{iniciales}</span>
        )}
      </span>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: -4,
          bottom: -4,
          width: 34,
          height: 34,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          boxSizing: 'border-box',
          background: 'var(--twin-surface-elevated)',
          border: '1px solid var(--twin-hairline-strong)',
          color: 'var(--twin-fg)',
          boxShadow: 'var(--twin-shadow-card-tight)',
        }}
      >
        <IcoCamara tam={17} />
      </span>
    </button>
  );
}
