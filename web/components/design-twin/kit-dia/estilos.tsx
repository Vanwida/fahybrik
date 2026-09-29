'use client';

// La hoja de estilos de la portada. Vive en un <style> porque `:active`,
// `:focus-visible`, los keyframes y `prefers-reduced-motion` no se pueden
// escribir en `style={{}}`. Todo cuelga de `.hd-*` para no chocar con otra
// pantalla, y todo color es un `var(--twin-*)`.

const CSS = `
.hd-toque {
  appearance: none; border: 0; background: none; padding: 0; margin: 0;
  font: inherit; color: inherit; text-align: left; cursor: pointer;
  display: block; width: 100%;
  -webkit-tap-highlight-color: transparent;
  transition: transform 140ms cubic-bezier(.2,.7,.2,1), opacity 140ms ease-out;
}
.hd-toque:active { transform: scale(0.982); }
.hd-toque:focus-visible { outline: 3px solid var(--hd-foco, var(--twin-accent-text)); outline-offset: 3px; border-radius: 12px; }
.hd-toque[disabled] { cursor: default; }
.hd-toque[disabled]:active { transform: none; }
.hd-hero-btn:focus-visible { outline-offset: -6px; border-radius: 28px; }
.hd-pill { transition: transform 140ms cubic-bezier(.2,.7,.2,1); }
.hd-toque:active .hd-pill { transform: scale(0.96); }

.hd-circulo { transition: background-color 140ms ease-out, border-color 140ms ease-out, transform 140ms cubic-bezier(.2,.7,.2,1); }
.hd-toque:active .hd-circulo { transform: scale(0.9); }

@keyframes hd-sube { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.hd-sube { animation: hd-sube 460ms cubic-bezier(.2,.7,.2,1) both; animation-delay: calc(var(--i, 0) * 70ms); }

@keyframes hd-entra { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
.hd-aviso { animation: hd-entra 260ms cubic-bezier(.2,.7,.2,1) both; }

@keyframes hd-latido { 0% { box-shadow: 0 0 0 0 var(--hd-latido, var(--twin-accent)); } 70% { box-shadow: 0 0 0 9px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
.hd-vivo { animation: hd-latido 1.8s ease-out infinite; }

@keyframes hd-brillo { 0% { background-position: 120% 0; } 100% { background-position: -120% 0; } }
.hd-sk {
  display: block;
  background-color: var(--twin-hairline-strong);
  background-image: linear-gradient(100deg, transparent 30%, var(--twin-hairline-strong) 50%, transparent 70%);
  background-size: 240% 100%;
  animation: hd-brillo 1.6s ease-in-out infinite;
}

/* El arco de la cifra se dibuja al entrar. */
.hd-arco { transition: stroke-dashoffset 900ms cubic-bezier(.2,.7,.2,1) 200ms; }

@keyframes hd-gira { to { transform: rotate(360deg); } }
.hd-gira { animation: hd-gira 780ms linear infinite; }

@media (prefers-reduced-motion: reduce) {
  .hd-sube, .hd-aviso, .hd-vivo, .hd-sk, .hd-gira { animation: none !important; }
  .hd-toque, .hd-pill, .hd-circulo, .hd-arco { transition: none !important; }
  .hd-toque:active, .hd-toque:active .hd-pill, .hd-toque:active .hd-circulo { transform: none !important; }
}
`;

export function Estilos() {
  return <style>{CSS}</style>;
}
