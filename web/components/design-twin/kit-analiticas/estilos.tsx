'use client';

// La hoja de estilos de las analíticas del iPhone: la de «El día» (`.hd-*`,
// que trae `kit-dia/estilos`) más lo que esta pestaña necesita y `kit-dia` no
// tiene: las variables de la paleta de dato por apariencia (`--an-*`), la
// entrada de la hoja del glosario y el selector de ventana que se pega arriba.
// Todo cuelga de `.an-*` y todo color es un `var(--twin-*)` o una variable de
// la paleta; `prefers-reduced-motion` se respeta.

import { Estilos } from '../kit-dia/estilos';
import { cssPaleta } from './tokens';

const CSS = `
${cssPaleta()}

@keyframes an-sube { from { transform: translateY(28px); opacity: 0; } to { transform: none; opacity: 1; } }
.an-hoja { animation: an-sube 280ms cubic-bezier(.2,.7,.2,1) both; }
@keyframes an-vela { from { opacity: 0; } to { opacity: 1; } }
.an-velo { animation: an-vela 220ms ease-out both; }

/* Un conmutador que no cabe se desliza sin barra; el foco va hacia dentro para que la tira no lo recorte. */
.an-cinta { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.an-cinta::-webkit-scrollbar { display: none; }
.an-radio:focus-visible { outline-offset: -4px; border-radius: 12px; }

/* El selector de ventana se queda arriba al bajar: una sola ventana rige toda la pestaña (A4) y siempre se ve cuál. */
.an-pega { position: sticky; top: 0; z-index: 3; transition: box-shadow 160ms ease-out; }
.an-pega[data-pegado='true'] { box-shadow: 0 1px 0 var(--twin-hairline-strong); }

@media (prefers-reduced-motion: reduce) {
  .an-hoja, .an-velo { animation: none !important; }
  .an-pega { transition: none !important; }
}
`;

export function EstilosAnaliticas() {
  return (
    <>
      <Estilos />
      <style>{CSS}</style>
    </>
  );
}
