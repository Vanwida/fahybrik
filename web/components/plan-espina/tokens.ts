// LOS DOS ESPACIOS DE TOKENS DEL REPO, dichos una vez.
//
// La espina se dibuja en dos sitios con paletas distintas —la app del atleta
// (`--twin-*`, negros más cálidos) y el dashboard del coach (`--v2-*`)— y va a
// dibujarse en más: periodización y la vista de un ciclo. El componente no
// conoce ni un color: recibe estas seis variables y las escribe tal cual.
//
// Tenerlas aquí y no dentro del componente es lo que impide la bifurcación de
// siempre: una copia del dibujo por superficie, que a los dos meses ya no son el
// mismo dibujo.

export interface TokensEspina {
  /** El raíl vertical que une los nodos. */
  rail: string;
  /** El fondo sobre el que se recorta un nodo hueco. */
  bg: string;
  fg: string;
  muted: string;
  fontSans: string;
  fontMono: string;
  /**
   * La clase de anillo de foco de la superficie, para cuando un nodo se puede
   * tocar. Va aquí y no dentro del componente porque el anillo es vocabulario de
   * la superficie igual que el color: el dashboard tiene el suyo (WCAG 2.4.7) y
   * el móvil simulado no tiene teclado. Ausente = el nodo confía en el anillo
   * del navegador.
   */
  claseFoco?: string;
}

/** La app del atleta y todo lo que se dibuja dentro de su móvil (la previa del
 *  compositor incluida: ahí se está enseñando SU pantalla, no la del coach). */
export const TOKENS_TWIN: TokensEspina = {
  rail: 'var(--twin-hairline-strong)',
  bg: 'var(--twin-bg)',
  fg: 'var(--twin-fg)',
  muted: 'var(--twin-muted)',
  fontSans: 'var(--twin-font-sans)',
  fontMono: 'var(--twin-font-mono)',
};

/** El dashboard del coach. */
export const TOKENS_V2: TokensEspina = {
  rail: 'var(--v2-border-strong)',
  bg: 'var(--v2-surface)',
  fg: 'var(--v2-fg)',
  muted: 'var(--v2-muted)',
  fontSans: 'inherit',
  fontMono: 'var(--font-mono)',
  claseFoco: 'v2-focus',
};

/**
 * Los cinco tonos, en cada espacio. El índice lo da `planPathTone` (por posición
 * del tramo en el plan), porque desde la migración 0064 no hay ninguna columna
 * que guarde un color — el porqué entero está en `shared/domain/plan-path.ts`.
 *
 * Son cinco slots y no cinco significados: aquí el color dice DÓNDE ACABA UN
 * TRAMO Y EMPIEZA EL SIGUIENTE, que en una lista de nombres parecidos
 * («Acumulación 1», «Acumulación 2») es justo lo que no se ve. El día que un
 * coach pueda colorear sus ciclos, el color llega del dato y esto se queda como
 * el defecto de quien no ha tocado nada.
 */
export const TONOS_TWIN: readonly string[] = [
  'var(--twin-accent)',
  'var(--twin-info)',
  'var(--twin-ok)',
  'var(--twin-warning)',
  'var(--twin-muted)',
];

export const TONOS_V2: readonly string[] = [
  'var(--v2-accent)',
  'var(--v2-info)',
  'var(--v2-ok)',
  'var(--v2-warn)',
  'var(--v2-muted)',
];

/** El color del tono `n` en la paleta que toque. Fuera de rango vuelve al
 *  principio: la paleta cicla, nunca se queda sin color. */
export function colorDelTono(paleta: readonly string[], tono: number): string {
  return paleta[((tono % paleta.length) + paleta.length) % paleta.length]!;
}
