'use client';

// Lo que `kit-dia/estilos` no trae y esta pestaña necesita: la entrada de las
// hojas, las barras que se dibujan, el campo de texto con su foco y la pulsación
// de un póster que es un solo botón. Todo cuelga de `.cr-*`, todo color es un
// `var(--twin-*)` y `prefers-reduced-motion` se respeta.

const CSS = `
@keyframes cr-sube { from { transform: translateY(28px); opacity: 0; } to { transform: none; opacity: 1; } }
.cr-hoja { animation: cr-sube 280ms cubic-bezier(.2,.7,.2,1) both; }
@keyframes cr-vela { from { opacity: 0; } to { opacity: 1; } }
.cr-velo { animation: cr-vela 220ms ease-out both; }

/* Una barra crece desde su origen; la altura o el ancho final los pone el dato. */
@keyframes cr-crece-x { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes cr-crece-y { from { transform: scaleY(0); } to { transform: scaleY(1); } }
.cr-barra-x { transform-origin: left center; animation: cr-crece-x 700ms cubic-bezier(.2,.7,.2,1) both; animation-delay: calc(var(--i, 0) * 60ms + 180ms); }
.cr-barra-y { transform-origin: center bottom; animation: cr-crece-y 700ms cubic-bezier(.2,.7,.2,1) both; animation-delay: calc(var(--i, 0) * 60ms + 180ms); }

.cr-campo { transition: border-color 140ms ease-out, box-shadow 140ms ease-out; }
.cr-campo:focus-within { border-color: var(--twin-accent-text); box-shadow: 0 0 0 3px color-mix(in srgb, var(--twin-accent-text) 28%, transparent); }
.cr-campo input { appearance: none; border: 0; outline: 0; background: transparent; color: var(--twin-fg); font: inherit; width: 100%; min-width: 0; }
.cr-campo input::placeholder { color: var(--twin-muted); opacity: 1; }

/* El póster entero es un botón: la pulsación se nota en TODO el póster, no en el botón invisible que lo cubre. */
.cr-poster .cr-cuerpo { transition: transform 140ms cubic-bezier(.2,.7,.2,1); }
.cr-poster:has(.cr-abre:active) .cr-cuerpo { transform: scale(0.985); }
.cr-poster:has(.cr-abre:active) .hd-pill { transform: scale(0.96); }
.cr-abre:active { transform: none !important; }

.cr-gira { animation: hd-gira 780ms linear infinite; }

.cr-fila-abre { transition: transform 200ms cubic-bezier(.2,.7,.2,1); }

@media (prefers-reduced-motion: reduce) {
  .cr-hoja, .cr-velo, .cr-barra-x, .cr-barra-y, .cr-gira { animation: none !important; }
  .cr-campo, .cr-fila-abre, .cr-poster .cr-cuerpo { transition: none !important; }
  .cr-poster:has(.cr-abre:active) .cr-cuerpo, .cr-poster:has(.cr-abre:active) .hd-pill { transform: none !important; }
}
`;

export function EstilosCarreras() {
  return <style>{CSS}</style>;
}
