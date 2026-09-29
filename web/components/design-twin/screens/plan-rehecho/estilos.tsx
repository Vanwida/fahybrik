'use client';

// Lo que `kit-dia/estilos` no trae y esta pestaña necesita: el chip del carril,
// la hoja de acciones, el diálogo y el aviso. Vive en un <style> porque `:active`,
// `:focus-visible`, los keyframes y `prefers-reduced-motion` no se pueden escribir
// en `style={{}}`. Todo cuelga de `.pl-*` y todo color es un `var(--twin-*)`.

const CSS = `
.pl-chip {
  appearance: none; border: 0; background: none; padding: 0; margin: 0; font: inherit; color: inherit;
  cursor: pointer; display: flex; flex-direction: column; align-items: center; width: 100%;
  -webkit-tap-highlight-color: transparent; touch-action: pan-y;
  transition: background-color 200ms ease-out, box-shadow 200ms ease-out, transform 140ms cubic-bezier(.2,.7,.2,1);
}
.pl-chip:active { transform: scale(0.94); }
.pl-chip:focus-visible { outline: 3px solid var(--twin-accent-text); outline-offset: 2px; }

.pl-btn {
  appearance: none; border: 0; background: none; padding: 0; margin: 0; font: inherit; color: inherit;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  transition: transform 140ms cubic-bezier(.2,.7,.2,1), opacity 140ms ease-out;
}
.pl-btn:active { transform: scale(0.97); }
.pl-btn:focus-visible { outline: 3px solid var(--twin-accent-text); outline-offset: 3px; border-radius: 12px; }
.pl-btn[disabled] { cursor: default; opacity: 0.55; }
.pl-btn[disabled]:active { transform: none; }

@keyframes pl-sube-hoja { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes pl-vela { from { opacity: 0; } to { opacity: 1; } }
@keyframes pl-entra-alerta { from { transform: scale(0.96); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes pl-baja-aviso { from { transform: translateY(-14px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes pl-cambia { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

.pl-hoja { animation: pl-sube-hoja 300ms cubic-bezier(.2,.7,.2,1) both; }
.pl-vela { animation: pl-vela 220ms ease-out both; }
.pl-alerta { animation: pl-entra-alerta 220ms cubic-bezier(.2,.7,.2,1) both; }
.pl-aviso { animation: pl-baja-aviso 260ms cubic-bezier(.2,.7,.2,1) both; }
/* La card cambia de día: el contenido nuevo entra, no se reescribe. */
.pl-cambia { animation: pl-cambia 320ms cubic-bezier(.2,.7,.2,1) both; }

.pl-fila-accion { transition: background-color 120ms ease-out; }
.pl-fila-accion:active { background-color: var(--twin-hairline-strong); }
.pl-fila-accion:focus-visible { outline: 3px solid var(--twin-accent-text); outline-offset: -3px; }

.pl-desenfoque { filter: blur(4.5px); opacity: 0.6; user-select: none; }

@media (prefers-reduced-motion: reduce) {
  .pl-hoja, .pl-vela, .pl-alerta, .pl-aviso, .pl-cambia { animation: none !important; }
  .pl-chip, .pl-btn, .pl-fila-accion { transition: none !important; }
  .pl-chip:active, .pl-btn:active { transform: none !important; }
}
`;

export function EstilosPlan() {
  return <style>{CSS}</style>;
}
