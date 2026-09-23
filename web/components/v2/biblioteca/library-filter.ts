// Con qué filtro se abre la biblioteca cuando la URL no dice ninguno.
//
// Por defecto, lo LISTO: es lo que se arrastra a un programa. Pero una
// biblioteca recién importada tiene 0 listos y todo «por revisar»; abrirla en
// «Todavía no hay bloques listos» la hace parecer vacía. Entonces se abre en la
// cola de revisión, que es el trabajo que hay.

export type LibFilter = 'listos' | 'sin_dosis' | 'revisar' | 'duplicados' | 'archivados';

export const LIB_FILTERS: LibFilter[] = ['listos', 'sin_dosis', 'revisar', 'duplicados', 'archivados'];

export function defaultLibFilter(counts: { listos: number; revisar: number }): LibFilter {
  return counts.listos === 0 && counts.revisar > 0 ? 'revisar' : 'listos';
}

/** El filtro pedido en la URL si es válido; si no, null (= el de por defecto). */
export function parseLibFilter(raw: string | null | undefined): LibFilter | null {
  return raw && (LIB_FILTERS as string[]).includes(raw) ? (raw as LibFilter) : null;
}
