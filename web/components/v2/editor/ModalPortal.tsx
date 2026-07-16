'use client';

// Fontanería de los overlays del editor: dónde se pintan y quién se come el Escape.
//
// POR QUÉ EXISTE: el editor de día vive dentro de `<section class="vt-day-editor">`,
// que lleva `view-transition-name` (v2-theme.css) para el morph día↔día. Eso crea
// un stacking context, así que un `fixed inset-0 z-50` declarado ahí dentro queda
// ATRAPADO: la sección es `position:static; z-index:auto`, o sea que pinta en la
// capa de flujo normal, POR DEBAJO de la cabecera sticky de la app (z-10 pero
// posicionada en la RAÍZ). Resultado: la cabecera tapaba el título y la X del
// drawer y la X no se podía clicar.
//
// El portal es el arreglo correcto: quitar el view-transition-name mataría el
// morph (una feature), y subir el z-index de la sección pondría el editor entero
// por encima de la cabecera (peor).

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Saca un overlay del stacking context del editor y lo pinta en el `.v2-root` MÁS
 * CERCANO.
 *
 * El destino es `.v2-root` y NO `document.body` a propósito: los tokens `--v2-*`
 * (incluido --v2-scrim) están definidos sobre `.v2-root`, así que portalar a body
 * los dejaría sin resolver y el overlay perdería fondo, bordes y color de texto.
 * Y es el `.v2-root` MÁS CERCANO (no el primero del documento) porque se anidan:
 * la guía monta un `.v2-root[data-theme="light"]` dentro del `.v2-root` del shell,
 * y los mockups otro `[data-theme="dark"]` dentro. `closest()` respeta el tema del
 * contenedor real; un `querySelector` global cogería el primero, el equivocado.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  // El ancla se monta EN SITIO (dentro de la sección) sólo para localizar su
  // `.v2-root`; el contenido real se pinta ya en el portal.
  useEffect(() => {
    setTarget(anchorRef.current?.closest<HTMLElement>('.v2-root') ?? document.body);
  }, []);

  return (
    <>
      <span ref={anchorRef} className="hidden" aria-hidden />
      {target ? createPortal(children, target) : null}
    </>
  );
}

// Pila de overlays montados, en orden de montaje: el ÚLTIMO es el de arriba.
// Hace falta porque se apilan de verdad — el ExercisePicker se abre ENCIMA del
// drawer (desde "añadir componente" y desde el ExercisePickerField del propio
// drawer). Sin esto, cada overlay con su listener en `window` respondería al mismo
// Escape y una sola pulsación cerraría los dos a la vez.
const overlayStack: string[] = [];

/**
 * Cierra con Escape, pero SÓLO si este overlay es el de arriba.
 *
 * `enabled: false` (p. ej. la IA está redactando) no desapila: el overlay sigue
 * siendo el de arriba y se COME el Escape en vez de dejar que cierre lo de debajo.
 */
export function useEscapeToClose(onClose: () => void, enabled = true) {
  const id = useId();

  // Registro atado al ciclo de vida del overlay: el orden de la pila es el de
  // montaje. Va en su propio efecto para que un cambio de `enabled` NO lo
  // desapile y lo vuelva a apilar arriba del todo, saltándose la cola.
  useEffect(() => {
    overlayStack.push(id);
    return () => {
      const i = overlayStack.indexOf(id);
      if (i >= 0) overlayStack.splice(i, 1);
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (overlayStack[overlayStack.length - 1] !== id) return;
      if (!enabled) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose, enabled]);
}
