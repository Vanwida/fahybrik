'use client';

// Los glifos de Plan que `kit-dia/iconos` no trae. Todos decorativos
// (`aria-hidden`): el nombre accesible lo lleva el botón que los contiene.
// Mismo trazo que el kit (24 px, 2 de grosor, redondeado) para que no se noten.

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

export const IcoPlay = ({ tam = 20 }: P) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flex: '0 0 auto' }}>
    <path d="M7.5 4.6v14.8a1 1 0 0 0 1.5.86l12-7.4a1 1 0 0 0 0-1.72l-12-7.4a1 1 0 0 0-1.5.86z" />
  </svg>
);

export const IcoCompartir = ({ tam = 20 }: P) => (
  <svg {...base(tam)}>
    <path d="M12 15V3m0 0L8 7m4-4 4 4M6 11H5.5A1.5 1.5 0 0 0 4 12.5v6A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5H18" />
  </svg>
);

/** El ciclo: tres capas apiladas, el mismo símbolo del bloque en iOS. */
export const IcoCiclo = ({ tam = 20 }: P) => (
  <svg {...base(tam)}>
    <path d="m12 3 9 4.5-9 4.5-9-4.5z" />
    <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
  </svg>
);

export const IcoHistorial = ({ tam = 20 }: P) => (
  <svg {...base(tam)}>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8 3v4m8-4v4M12 13v3l2 1" />
  </svg>
);

export const IcoPuntos = ({ tam = 22 }: P) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flex: '0 0 auto' }}>
    <circle cx="5.5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="18.5" cy="12" r="2" />
  </svg>
);

export const IcoCandado = ({ tam = 18 }: P) => (
  <svg {...base(tam)}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </svg>
);

export const IcoChevronIzq = ({ tam = 18 }: P) => (
  <svg {...base(tam)} strokeWidth={2.4}>
    <path d="m15 5-7 7 7 7" />
  </svg>
);

export const IcoChevronDer = ({ tam = 18 }: P) => (
  <svg {...base(tam)} strokeWidth={2.4}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const IcoLista = ({ tam = 22 }: P) => (
  <svg {...base(tam)}>
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth={2.6} />
  </svg>
);

export const IcoMover = ({ tam = 22 }: P) => (
  <svg {...base(tam)}>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8 3v4m8-4v4M9 15h6m-2.5-2.5L15 15l-2.5 2.5" />
  </svg>
);

export const IcoLapiz = ({ tam = 22 }: P) => (
  <svg {...base(tam)}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </svg>
);

export const IcoPapelera = ({ tam = 22 }: P) => (
  <svg {...base(tam)}>
    <path d="M4 7h16M10 3.5h4M6 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h7.4a1.5 1.5 0 0 0 1.5-1.4L18 7M10 11v6m4-6v6" />
  </svg>
);

export const IcoDeshacer = ({ tam = 22 }: P) => (
  <svg {...base(tam)}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
);

export const IcoCerrar = ({ tam = 20 }: P) => (
  <svg {...base(tam)} strokeWidth={2.4}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IcoAviso = ({ tam = 20 }: P) => (
  <svg {...base(tam)}>
    <path d="M12 4 3 19.5h18z" />
    <path d="M12 10v4.5m0 2.7h.01" />
  </svg>
);

export const IcoPersona = ({ tam = 22 }: P) => (
  <svg {...base(tam)}>
    <circle cx="12" cy="8.5" r="3.6" />
    <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
  </svg>
);
