'use client';

// Los glifos que Perfil necesita y `kit-dia/iconos` aún no tiene. Mismo trazo
// (24 × 24, 2 px, redondeado) y mismo contrato: decorativos, `aria-hidden`; el
// nombre accesible lo lleva el botón que los contiene, nunca el dibujo.
//
// Son genéricos (cámara, lápiz, silueta…): el orquestador puede subirlos a
// `kit-dia/iconos` sin cambiar nada.

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

export const IcoCamara = ({ tam = 18 }: P) => (
  <svg {...base(tam)}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-2h5.6L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <circle cx="12" cy="12.5" r="3.2" />
  </svg>
);

export const IcoLapiz = ({ tam = 20 }: P) => (
  <svg {...base(tam)} strokeWidth={2.2}>
    <path d="m4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" />
    <path d="m14.5 6.5 3 3" />
  </svg>
);

/** La silueta de «todavía sin nombre»: la misma proporción que la de `CoachAvatar`. */
export const IcoSilueta = ({ tam = 40 }: P) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flex: '0 0 auto' }}>
    <circle cx="12" cy="8.4" r="4" />
    <path d="M4.6 20.4a7.4 7.4 0 0 1 14.8 0c0 .6-.4 1-1 1H5.6c-.6 0-1-.4-1-1z" />
  </svg>
);

export const IcoIdentidad = ({ tam = 24 }: P) => (
  <svg {...base(tam)}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="10" r="3" />
    <path d="M6.6 18.4a6 6 0 0 1 10.8 0" />
  </svg>
);

/** Una mancuerna: entrenar. */
export const IcoEntreno = ({ tam = 24 }: P) => (
  <svg {...base(tam)}>
    <path d="M6.5 7.5v9M17.5 7.5v9M3.5 10v4M20.5 10v4M6.5 12h11" />
  </svg>
);

export const IcoReloj = ({ tam = 24 }: P) => (
  <svg {...base(tam)}>
    <rect x="7" y="6" width="10" height="12" rx="3" />
    <path d="m9 6 .6-3h4.8L15 6M9 18l.6 3h4.8L15 18M12 10v2.4l1.5 1" />
  </svg>
);

/** Ajustes: tres controles deslizantes. */
export const IcoAjustes = ({ tam = 24 }: P) => (
  <svg {...base(tam)}>
    <path d="M4 7h8M18 7h2M4 12h2M12 12h8M4 17h9M19 17h1" />
    <circle cx="15" cy="7" r="2.2" />
    <circle cx="9" cy="12" r="2.2" />
    <circle cx="16" cy="17" r="2.2" />
  </svg>
);

/** Un escudo con cerradura: privacidad. */
export const IcoEscudo = ({ tam = 24 }: P) => (
  <svg {...base(tam)}>
    <path d="M12 3 19 6v5.5c0 4.3-2.9 7.6-7 9.5-4.1-1.9-7-5.2-7-9.5V6z" />
    <circle cx="12" cy="10.6" r="1.6" />
    <path d="M12 12.2V15" />
  </svg>
);

export const IcoAyuda = ({ tam = 24 }: P) => (
  <svg {...base(tam)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.3c-.8.5-1.2 1-1.2 1.9" />
    <path d="M12 17h.01" strokeWidth={2.6} />
  </svg>
);

export const IcoTarjeta = ({ tam = 24 }: P) => (
  <svg {...base(tam)}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M3 10h18M7 15h4" />
  </svg>
);

export const IcoPareja = ({ tam = 18 }: P) => (
  <svg {...base(tam)}>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <circle cx="17" cy="9.5" r="2.4" />
    <path d="M16 14.2a4.6 4.6 0 0 1 5 4.3" />
  </svg>
);

export const IcoCoach = ({ tam = 18 }: P) => (
  <svg {...base(tam)}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20a7 7 0 0 1 14 0" />
    <path d="m16.4 12.6 1.4 1.4 2.6-2.8" />
  </svg>
);

export const IcoInvitar = ({ tam = 24 }: P) => (
  <svg {...base(tam)}>
    <circle cx="10" cy="8.5" r="3.4" />
    <path d="M3.5 20a6.5 6.5 0 0 1 11.6-4" />
    <path d="M19 9v6M16 12h6" />
  </svg>
);

/** El pulso: una actividad nueva del reloj. */
export const IcoActividad = ({ tam = 24 }: P) => (
  <svg {...base(tam)}>
    <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
  </svg>
);
