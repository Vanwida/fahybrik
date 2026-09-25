'use client';

// LOS GESTOS — lo que comparten las dos carcasas del kit: `Muneca` (el vivo) y
// `Pila` (antes y después). Un gesto se interpreta en un solo sitio, así que
// la corona, el guion y los destinos de los mandos se comportan igual en las
// dos.
//
//   useDestinos        dónde se montan la corona del bisel y los mandos simulados.
//   useGuion           gestos guionizados de un escenario, por el MISMO camino
//                      que los mandos y con el estado más reciente.
//   useRueda           la rueda del ratón sobre la esfera = la corona. Si una
//                      cara ENFOCA la corona en un valor, cada muesca es un paso
//                      de ese valor; si no, pasa página (con freno).
//   useArrastreValor   arrastrar en vertical sobre un valor enfocado lo gira,
//                      como la corona (arriba = más).
//
// Convención de dirección, la de la corona: `1` = hacia abajo (▼, la página
// siguiente), `-1` = hacia arriba (▲). Sobre un valor, arriba es «más», como
// el selector de watchOS: una cara que captura suma `-dir`.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
export type Direccion = 1 | -1;

/** Un gesto del atleta que un escenario puede guionizar. */
export type GestoGuion = 'doble-toque' | 'accion' | 'bajar' | 'subir' | 'corona-abajo' | 'corona-arriba' | 'controles' | 'vivo';

export interface Destinos {
  bisel: HTMLElement | null;
  escena: HTMLElement;
  suelto: boolean;
}

/** El lienzo del reloj dice dónde van la corona del bisel y los mandos (portal). */
export function useDestinos(): { raiz: (el: HTMLDivElement | null) => void; destinos: Destinos | null } {
  const [destinos, setDestinos] = useState<Destinos | null>(null);
  const raiz = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const escena = el.closest<HTMLElement>('.studio-stage');
    const lienzo = el.closest<HTMLElement>('.twin-root');
    setDestinos({ bisel: escena ? (lienzo?.parentElement ?? null) : null, escena: escena ?? document.body, suelto: !escena });
  }, []);
  return { raiz, destinos };
}

/**
 * El guion de un escenario: «a los 2 s baja la muñeca», «a los 3 s doble
 * toque». Llama siempre a la versión más reciente de los gestos (ref que se
 * actualiza tras cada render), así un gesto guionizado ve el estado vivo.
 */
export function useGuion(guion: Array<{ en: number; gesto: GestoGuion }> | undefined, ejecutar: (g: GestoGuion) => void) {
  const gestos = useRef(ejecutar);
  useEffect(() => {
    gestos.current = ejecutar;
  });
  useEffect(() => {
    if (!guion) return;
    const t = guion.map((x) => setTimeout(() => gestos.current(x.gesto), x.en));
    return () => t.forEach(clearTimeout);
    // El guion es fijo por montaje (cada escenario remonta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Píxeles de rueda por página y el freno entre dos páginas (una página por gesto, no diez). */
const RUEDA_PAGINA = { px: 40, ms: 220 } as const;
/** Píxeles de rueda por paso de un valor enfocado: una muesca del ratón, un clic de corona. */
const RUEDA_VALOR = { px: 36, ms: 90 } as const;

/**
 * La rueda sobre la esfera. `capturar(dir)` devuelve `true` si una cara tenía
 * la corona enfocada y ha girado su valor; si no, `pagina(dir)` pasa página.
 */
export function useRueda(pagina: (dir: Direccion) => void, capturar: (dir: Direccion) => boolean) {
  const rueda = useRef({ acumulado: 0, ultimo: 0 });
  return (e: ReactWheelEvent) => {
    const r = rueda.current;
    const ahora = Date.now();
    r.acumulado += e.deltaY;
    const dir: Direccion = r.acumulado > 0 ? 1 : -1;
    if (Math.abs(r.acumulado) >= RUEDA_VALOR.px && ahora - r.ultimo > RUEDA_VALOR.ms && capturar(dir)) {
      r.acumulado = 0;
      r.ultimo = ahora;
      return;
    }
    if (Math.abs(r.acumulado) >= RUEDA_PAGINA.px && ahora - r.ultimo > RUEDA_PAGINA.ms) {
      pagina(dir);
      r.acumulado = 0;
      r.ultimo = ahora;
    }
  };
}

/** Píxeles de arrastre por paso de un valor enfocado. */
const ARRASTRE_PASO = 14;

/**
 * Arrastrar en vertical sobre un valor enfocado lo gira paso a paso (arriba =
 * más). `arrastrado()` dice si el último toque fue un arrastre de valor: ese
 * toque no pasa página ni cuenta como toque.
 */
export function useArrastreValor(capturar: (dir: Direccion) => boolean) {
  const origen = useRef<{ y: number; movido: boolean } | null>(null);
  const ultimoMovido = useRef(false);
  return {
    abajo: (e: ReactPointerEvent) => {
      origen.current = { y: e.clientY, movido: false };
      ultimoMovido.current = false;
    },
    mueve: (e: ReactPointerEvent) => {
      const o = origen.current;
      if (!o) return;
      const dy = e.clientY - o.y;
      if (Math.abs(dy) < ARRASTRE_PASO) return;
      // Arrastrar hacia arriba = la corona hacia arriba = más.
      if (capturar(dy < 0 ? -1 : 1)) origen.current = { y: e.clientY, movido: true };
    },
    suelta: () => {
      ultimoMovido.current = origen.current?.movido ?? false;
      origen.current = null;
    },
    arrastrado: () => ultimoMovido.current,
  };
}

/** Origen de la acción del momento. El doble toque en la pantalla existe en todo reloj; el de la mano, en S9 / Ultra 2+. */
export type OrigenPrimario = 'Doble toque' | 'Doble toque en pantalla' | 'Botón Acción' | 'Botón en pantalla';
