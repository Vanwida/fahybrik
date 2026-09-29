'use client';

// Lo que `style={{}}` no sabe decir: estados `:active`, foco visible, keyframes y
// la respuesta a `prefers-reduced-motion`. Todas las clases llevan el prefijo
// `pl-` y cuelgan de `.twin-root` para no salir del lienzo del doble.

export function Estilos() {
  return (
    <style>{`
.twin-root .pl-btn {
  appearance: none;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 90ms ease-out, background-color 140ms ease-out, opacity 140ms ease-out;
}
.twin-root .pl-btn:active { transform: scale(0.985); }
.twin-root .pl-btn:focus-visible {
  outline: 2px solid var(--twin-accent-text);
  outline-offset: 2px;
  border-radius: 12px;
}
.twin-root .pl-fila:active { background: color-mix(in srgb, var(--twin-fg) 5%, transparent); }
.twin-root .pl-btn[disabled] { cursor: default; }

.twin-root .pl-sec {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 50px;
  padding: 0 20px;
  border-radius: 14px;
  border: 1px solid var(--twin-faint);
  background: var(--twin-surface);
  color: var(--twin-fg);
  font: 600 17px/1 var(--twin-font-sans);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 80ms ease-out, background-color 120ms ease-out;
}
.twin-root .pl-sec:active { background: var(--twin-surface-elevated); transform: scale(0.985); }
.twin-root .pl-sec:focus-visible { outline: 2px solid var(--twin-accent-text); outline-offset: 2px; }

.twin-root .pl-primario { transition: transform 80ms ease-out, background-color 120ms ease-out; }
.twin-root .pl-primario:active { background: var(--twin-accent-press); transform: scale(0.98); }

@keyframes pl-entra { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.twin-root .pl-entra { animation: pl-entra 340ms cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: calc(var(--i, 0) * 38ms); }

@keyframes pl-cifra { from { opacity: 0; transform: translateY(6px) scale(0.96); } to { opacity: 1; transform: none; } }
.twin-root .pl-cifra { animation: pl-cifra 420ms cubic-bezier(0.22, 1, 0.36, 1) 120ms both; }

.twin-root .pl-arco { transition: stroke-dashoffset 620ms cubic-bezier(0.22, 1, 0.36, 1) 60ms; }
.twin-root .pl-marca { transition: transform 620ms cubic-bezier(0.22, 1, 0.36, 1) 60ms; }

@keyframes pl-shimmer { 0% { background-position: 130% 0; } 100% { background-position: -130% 0; } }
.twin-root .pl-esq {
  background: linear-gradient(
    100deg,
    color-mix(in srgb, var(--twin-fg) 8%, var(--twin-bg)) 30%,
    color-mix(in srgb, var(--twin-fg) 15%, var(--twin-bg)) 50%,
    color-mix(in srgb, var(--twin-fg) 8%, var(--twin-bg)) 70%
  );
  background-size: 260% 100%;
  animation: pl-shimmer 1.5s linear infinite;
}
@keyframes pl-late { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.twin-root .pl-late { animation: pl-late 1.6s ease-in-out infinite; }
@keyframes pl-gira { to { transform: rotate(360deg); } }
.twin-root .pl-gira { animation: pl-gira 0.9s linear infinite; }

.twin-root .pl-resto {
  display: grid;
  grid-template-rows: 0fr;
  visibility: hidden;
  transition: grid-template-rows 260ms cubic-bezier(0.22, 1, 0.36, 1), visibility 0s linear 260ms;
}
.twin-root .pl-resto[data-abierto='true'] {
  grid-template-rows: 1fr;
  visibility: visible;
  transition: grid-template-rows 260ms cubic-bezier(0.22, 1, 0.36, 1), visibility 0s;
}
.twin-root .pl-resto > div { overflow: hidden; min-height: 0; }

@media (prefers-reduced-motion: reduce) {
  .twin-root .pl-entra, .twin-root .pl-cifra, .twin-root .pl-esq, .twin-root .pl-late, .twin-root .pl-gira { animation: none; }
  .twin-root .pl-arco, .twin-root .pl-marca, .twin-root .pl-resto, .twin-root .pl-btn { transition: none; }
}
`}</style>
  );
}
