'use client';

// Los glifos de la portada. Todos decorativos (`aria-hidden`): el nombre
// accesible lo lleva el botón que los contiene, nunca el dibujo.

import type { EstadoSesion } from '../kit-hoy/contrato';

interface P {
  tam?: number;
}

const base = (tam: number) => ({
  width: tam,
  height: tam,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  style: { flex: '0 0 auto' },
});

export const IcoChevron = ({ tam = 18 }: P) => (
  <svg {...base(tam)}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const IcoFlecha = ({ tam = 20 }: P) => (
  <svg {...base(tam)} strokeWidth={2.4}>
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </svg>
);

export const IcoBandeja = ({ tam = 22 }: P) => (
  <svg {...base(tam)}>
    <path d="M3.5 13.5h4.2l1.4 2.6h5.8l1.4-2.6h4.2M3.5 13.5 6 6.5h12l2.5 7v4a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
  </svg>
);

export const IcoChat = ({ tam = 22 }: P) => (
  <svg {...base(tam)}>
    <path d="M5.5 5h13A2.5 2.5 0 0 1 21 7.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V17h-1A2.5 2.5 0 0 1 3 14.5v-7A2.5 2.5 0 0 1 5.5 5z" />
  </svg>
);

export const IcoMas = ({ tam = 22 }: P) => (
  <svg {...base(tam)} strokeWidth={2.6}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IcoLupa = ({ tam = 20 }: P) => (
  <svg {...base(tam)} strokeWidth={2.4}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </svg>
);

export const IcoCalendario = ({ tam = 20 }: P) => (
  <svg {...base(tam)}>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8 3v4m8-4v4" />
  </svg>
);

export const IcoDiana = ({ tam = 20 }: P) => (
  <svg {...base(tam)}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.4" />
  </svg>
);

export const IcoPausa = ({ tam = 22 }: P) => (
  <svg {...base(tam)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 9v6m4-6v6" strokeWidth={2.6} />
  </svg>
);

export const IcoCronometro = ({ tam = 22 }: P) => (
  <svg {...base(tam)}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4l2.5 1.5M9.5 3h5" />
  </svg>
);

export const IcoVideo = ({ tam = 22 }: P) => (
  <svg {...base(tam)}>
    <rect x="3" y="6.5" width="12.5" height="11" rx="3" />
    <path d="m15.5 11 5.5-3v8l-5.5-3z" />
  </svg>
);

export const IcoHuellas = ({ tam = 22 }: P) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flex: '0 0 auto' }}>
    <ellipse cx="8" cy="15.5" rx="3.2" ry="4.6" />
    <ellipse cx="8" cy="8.6" rx="1.9" ry="2.1" />
    <ellipse cx="16.5" cy="11.5" rx="3.2" ry="4.6" />
    <ellipse cx="16.5" cy="4.6" rx="1.9" ry="2.1" />
  </svg>
);

export const IcoCheck = ({ tam = 20 }: P) => (
  <svg {...base(tam)} strokeWidth={2.6}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const IcoSube = ({ tam = 16 }: P) => (
  <svg {...base(tam)} strokeWidth={2.6}>
    <path d="M7 17 17 7m0 0H9m8 0v8" />
  </svg>
);

export const IcoBaja = ({ tam = 16 }: P) => (
  <svg {...base(tam)} strokeWidth={2.6}>
    <path d="M7 7l10 10m0 0H9m8 0V9" />
  </svg>
);

export const IcoReintentar = ({ tam = 20 }: P) => (
  <svg {...base(tam)} strokeWidth={2.4}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5" />
  </svg>
);

/**
 * La marca de estado de una sesión: los mismos tres sellos que pinta el Plan
 * (hecha ✓ verde, a medias ½ ámbar, sin hacer ✕ neutra). `mono` los dibuja en el
 * color del texto para las superficies donde un verde o un ámbar no se leerían
 * (el bloque naranja); el estado va entonces por la forma y por la palabra.
 */
export function SelloEstado({ estado, tam = 22, mono = false }: { estado: EstadoSesion; tam?: number; mono?: boolean }) {
  const color = (c: string) => (mono ? 'currentColor' : c);
  if (estado === 'hecha') {
    return (
      <svg {...base(tam)} style={{ flex: '0 0 auto', color: color('var(--twin-ok)') }}>
        <circle cx="12" cy="12" r="9.5" fill={mono ? 'none' : 'currentColor'} />
        <path d="m7.8 12.4 2.9 2.9 5.5-5.8" strokeWidth={2.6} stroke={mono ? 'currentColor' : 'var(--twin-bg)'} />
      </svg>
    );
  }
  if (estado === 'parcial') {
    return (
      <svg {...base(tam)} style={{ flex: '0 0 auto', color: color('var(--twin-warning)') }}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (estado === 'saltada') {
    return (
      <svg {...base(tam)} style={{ flex: '0 0 auto', color: color('var(--twin-muted)') }}>
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6m0-6-6 6" />
      </svg>
    );
  }
  return (
    <svg {...base(tam)} style={{ flex: '0 0 auto', color: color('var(--twin-muted)') }}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
