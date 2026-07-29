'use client';

// Átomos de esta pantalla. Los genéricos (Card, Label, Mono, Display, CTA,
// Notice, iconos…) VIVEN EN `design-twin/kit.tsx` y se re-exportan aquí para
// que los ficheros hermanos de la carpeta sigan importando de './ui' — lo que
// era una copia privada pasó al sitio compartido (CONTRATO-UI §0) el día que
// una segunda pantalla los necesitó.
//
// Lo que queda abajo es lo que SOLO tiene sentido en el remo.

import { CTA, IconCheckCircle, RAD, SP, Spinner } from '../../kit';

export * from '../../kit';

/** El botón contextual de abajo del HUD (TERMINAR / SALTAR). */
export function BottomButton({ title, onClick }: { title: string; onClick: () => void }) {
  return <CTA title={title} onClick={onClick} height={58} />;
}

/** PM5ProgramBanner — una línea honesta mientras se programa la pieza. */
export function ProgramLine({ text, tone }: { text: string; tone: 'accent' | 'ok' }) {
  const color = tone === 'accent' ? 'var(--twin-accent-text)' : 'var(--twin-ok)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SP.s,
        padding: 10,
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      }}
    >
      <span style={{ color, display: 'inline-flex' }}>
        {tone === 'accent' ? <Spinner size={14} /> : <IconCheckCircle />}
      </span>
      <span style={{ font: '600 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{text}</span>
    </div>
  );
}

export function IconRower({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.4" cy="3.9" r="1.6" fill="currentColor" stroke="none" />
      <path d="M4 15.4h12" />
      <path d="M11.8 7.2 8.4 9.6l2.6 2.4-.9 3.4" />
      <path d="M11.8 7.2 15 8.8" />
      <path d="M8.4 9.6 5.2 8.2" />
    </svg>
  );
}

export function IconAntenna({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4.4 11.6a5 5 0 0 1 0-7.2" />
      <path d="M11.6 4.4a5 5 0 0 1 0 7.2" />
      <path d="M2.1 13.9a8.3 8.3 0 0 1 0-11.8" />
      <path d="M13.9 2.1a8.3 8.3 0 0 1 0 11.8" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconTrophy({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5.5H4.6v1.2A3.4 3.4 0 0 0 8 10.1" />
      <path d="M17 5.5h2.4v1.2A3.4 3.4 0 0 1 16 10.1" />
      <path d="M12 13v4M9 20h6M10 17h4" />
    </svg>
  );
}
