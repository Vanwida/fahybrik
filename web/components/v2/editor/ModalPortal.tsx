'use client';

// La pieza de modal del editor: dónde se pinta, quién se come el Escape, dónde
// puede llegar el foco y si el fondo scrollea. Todo junto a propósito — las cuatro
// cosas dependen de LO MISMO (quién está arriba del todo), así que separarlas
// obliga a mantener dos censos de overlays que se desincronizan.
//
// POR QUÉ EL PORTAL: el editor de día vive dentro de `<section class="vt-day-editor">`,
// que lleva `view-transition-name` (v2-theme.css) para el morph día↔día. Eso crea
// un stacking context, así que un `fixed inset-0 z-50` declarado ahí dentro queda
// ATRAPADO: la sección es `position:static; z-index:auto`, o sea que pinta en la
// capa de flujo normal, POR DEBAJO de la cabecera sticky de la app (z-10 pero
// posicionada en la RAÍZ). Sin el portal, la cabecera tapaba el título y la X del
// drawer y la X no se podía clicar.
//
// Descartado: quitar el view-transition-name (mataría el morph, que es una
// feature) y subir el z-index de la sección (pondría el editor sobre la cabecera).

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Censo de overlays montados, en orden de montaje: el ÚLTIMO es el de arriba.
// Hace falta porque se apilan de verdad — el ExercisePicker se abre ENCIMA del
// drawer (desde "añadir componente" Y desde el ExercisePickerField de dentro).
const overlayStack: string[] = [];
const isTopmost = (id: string) => overlayStack[overlayStack.length - 1] === id;

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Los tabulables VISIBLES de dentro, en orden de DOM. `getClientRects()` filtra
 *  lo que cuelga de una rama `display:none` (p. ej. el modo del picker que no toca). */
function tabbablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.getClientRects().length > 0,
  );
}

// Bloqueo de scroll del fondo, contado: con dos overlays apilados, cerrar el de
// arriba NO debe devolverle el scroll a la página mientras el de abajo sigue.
let scrollLocks = 0;
let savedOverflow = '';
let savedPaddingRight = '';

function lockBodyScroll() {
  if (scrollLocks++ > 0) return;
  const body = document.body;
  savedOverflow = body.style.overflow;
  savedPaddingRight = body.style.paddingRight;
  // Al quitar la barra de scroll el contenido se ensancha y da un salto lateral:
  // se compensa con el hueco que ocupaba.
  const gap = window.innerWidth - document.documentElement.clientWidth;
  body.style.overflow = 'hidden';
  if (gap > 0) body.style.paddingRight = `${gap}px`;
}

function unlockBodyScroll() {
  if (--scrollLocks > 0) return;
  document.body.style.overflow = savedOverflow;
  document.body.style.paddingRight = savedPaddingRight;
}

/**
 * Monta un overlay como es debido: fuera del stacking context del editor, con
 * Escape / Tab / scroll resueltos según quién esté arriba.
 *
 * El destino es el `.v2-root` MÁS CERCANO y NO `document.body`: los tokens
 * `--v2-*` (incluido --v2-scrim) se definen sobre `.v2-root`, así que portalar a
 * body los dejaría sin resolver y el overlay perdería fondo, borde y color. Y el
 * más cercano, no el primero del documento, porque se anidan: la guía monta un
 * `.v2-root[data-theme="light"]` dentro del `[dark]` del shell. `closest()` respeta
 * el tema del contenedor real; un `querySelector` global cogería el equivocado.
 */
export function ModalPortal({
  onEscape,
  /** `false` = el overlay está ocupado (IA redactando, copia en vuelo): sigue
   *  siendo el de arriba y se COME el Escape, en vez de dejar que cierre lo de
   *  debajo. */
  escapeEnabled = true,
  children,
}: {
  onEscape: () => void;
  escapeEnabled?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  // El ancla se monta EN SITIO (dentro de la sección) sólo para localizar su
  // `.v2-root`; el contenido real ya se pinta en el portal.
  useEffect(() => {
    setTarget(anchorRef.current?.closest<HTMLElement>('.v2-root') ?? document.body);
  }, []);

  // Censo + bloqueo de scroll, atados al ciclo de vida del overlay. En su propio
  // efecto para que un cambio de `escapeEnabled` no lo desapile y lo vuelva a
  // apilar arriba, saltándose la cola.
  useEffect(() => {
    overlayStack.push(id);
    lockBodyScroll();
    return () => {
      const i = overlayStack.indexOf(id);
      if (i >= 0) overlayStack.splice(i, 1);
      unlockBodyScroll();
    };
  }, [id]);

  // Foco inicial + devolución. Lo dueña el portal porque los modales NO pueden:
  // su `dialogRef.current?.focus()` con deps [] corre en SU mount, cuando el
  // portal aún no ha montado los hijos → ref null → no-op silencioso. Este efecto
  // depende de `target`, así que corre ya con los hijos montados.
  useEffect(() => {
    if (!target) return;
    const previous = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    if (box && !box.contains(document.activeElement)) {
      // El contenedor del diálogo si es enfocable (tabIndex=-1 → el lector de
      // pantalla anuncia su aria-label); si no, el primer control.
      const dialog = box.querySelector<HTMLElement>('[role="dialog"][tabindex]');
      // preventScroll OBLIGATORIO: enfocar arrastra el fondo para "revelar" el
      // elemento y la página de detrás se iba hasta abajo sola al abrir. Medido.
      (dialog ?? tabbablesIn(box)[0])?.focus({ preventScroll: true });
    }
    return () => {
      // Al cerrar, el foco vuelve a quien abrió (si sigue en el documento); si no,
      // se perdería en <body> y el teclado empezaría desde el principio.
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [target]);

  // Escape + trampa de Tab. En captura y sobre `document` porque si el foco ya se
  // ha escapado al fondo, un listener del contenedor no llegaría a enterarse.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTopmost(id)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (escapeEnabled) onEscape();
        return;
      }
      if (e.key !== 'Tab') return;

      const box = boxRef.current;
      if (!box) return;
      const tabbables = tabbablesIn(box);
      if (tabbables.length === 0) {
        e.preventDefault(); // nada que tabular: aun así el foco no sale
        return;
      }

      const first = tabbables[0];
      const last = tabbables[tabbables.length - 1];
      const at = tabbables.indexOf(document.activeElement as HTMLElement);
      // at === -1 → el foco está en el contenedor (tabIndex=-1) o se ha escapado
      // fuera: en ambos casos toca reengancharlo al extremo que corresponda.
      if (e.shiftKey ? at <= 0 : at === -1 || at === tabbables.length - 1) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [id, onEscape, escapeEnabled]);

  return (
    <>
      <span ref={anchorRef} className="hidden" aria-hidden />
      {target
        ? createPortal(
            // `contents` = el envoltorio no genera caja, así que da un nodo donde
            // colgar la trampa de foco sin tocar el layout del overlay.
            <div ref={boxRef} className="contents">
              {children}
            </div>,
            target,
          )
        : null}
    </>
  );
}
