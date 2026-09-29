'use client';

// Glifos de trazo, todos `currentColor` y `aria-hidden` (el botón que los lleva
// pone la etiqueta). Ninguno es un adorno de «IA»: son los de una barra de
// herramientas de iPhone.

import type { CSSProperties } from 'react';

interface P {
  tam?: number;
  style?: CSSProperties;
}

const base = (tam: number, style?: CSSProperties) => ({
  width: tam,
  height: tam,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  style: { flex: '0 0 auto', ...style },
});

export const IconBandeja = ({ tam = 18, style }: P) => (
  <svg {...base(tam, style)}>
    <path d="M3 13.5 5.6 5.8A2 2 0 0 1 7.5 4.5h9a2 2 0 0 1 1.9 1.3L21 13.5" />
    <path d="M3 13.5v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4h-5.2a3.3 3.3 0 0 1-6.6 0Z" />
  </svg>
);

export const IconChat = ({ tam = 18, style }: P) => (
  <svg {...base(tam, style)}>
    <path d="M21 11.5a8.4 8.4 0 0 1-8.6 8.2 9 9 0 0 1-3.5-.7L4 20l1.3-4.2A7.9 7.9 0 0 1 3.7 11.5 8.4 8.4 0 0 1 12.4 3.3 8.4 8.4 0 0 1 21 11.5Z" />
  </svg>
);

export const IconChevron = ({ tam = 14, style, abajo = false }: P & { abajo?: boolean }) => (
  <svg {...base(tam, style)} strokeWidth={2.6}>
    {abajo ? <path d="m6 9 6 6 6-6" /> : <path d="m9 5 7 7-7 7" />}
  </svg>
);

export const IconCheck = ({ tam = 16, style }: P) => (
  <svg {...base(tam, style)} strokeWidth={2.8}>
    <path d="m5 12.5 4.6 4.6L19 7.5" />
  </svg>
);

export const IconMedio = ({ tam = 16, style }: P) => (
  <svg {...base(tam, style)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconEquis = ({ tam = 16, style }: P) => (
  <svg {...base(tam, style)} strokeWidth={2.6}>
    <path d="m6.5 6.5 11 11m0-11-11 11" />
  </svg>
);

export const IconPausa = ({ tam = 28, style }: P) => (
  <svg {...base(tam, style)}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M10 8.6v6.8m4-6.8v6.8" />
  </svg>
);

export const IconMas = ({ tam = 18, style }: P) => (
  <svg {...base(tam, style)} strokeWidth={2.8}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconLupa = ({ tam = 18, style }: P) => (
  <svg {...base(tam, style)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

export const IconCalendario = ({ tam = 18, style }: P) => (
  <svg {...base(tam, style)}>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8 3v4m8-4v4" />
  </svg>
);

export const IconRevision = ({ tam = 18, style }: P) => (
  <svg {...base(tam, style)}>
    <rect x="3" y="6" width="12.5" height="12" rx="3" />
    <path d="m15.5 10.5 5.5-3v9l-5.5-3Z" />
  </svg>
);

export const IconTests = ({ tam = 18, style }: P) => (
  <svg {...base(tam, style)}>
    <path d="M9 3.5h6M10 3.5v5.2L5.2 17a2.3 2.3 0 0 0 2 3.5h9.6a2.3 2.3 0 0 0 2-3.5L14 8.7V3.5" />
  </svg>
);

/** Triángulo de tendencia: sube (▲) o baja (▼). Relleno, sin trazo. */
export const IconTriangulo = ({ tam = 12, style, sube }: P & { sube: boolean }) => (
  <svg width={tam} height={tam} viewBox="0 0 12 12" aria-hidden style={{ flex: '0 0 auto', ...style }}>
    <path d={sube ? 'M6 2 11 10H1Z' : 'M6 10 1 2h10Z'} fill="currentColor" />
  </svg>
);

/** Igual (=): dos trazos, para «sin cambio» (nunca un guion largo de texto). */
export const IconIgual = ({ tam = 12, style }: P) => (
  <svg width={tam} height={tam} viewBox="0 0 12 12" aria-hidden style={{ flex: '0 0 auto', ...style }}>
    <path d="M2 4.5h8M2 7.5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
