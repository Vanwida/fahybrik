// Búsqueda de la biblioteca en el cliente: sin tildes, sin mayúsculas, en
// singular, por palabras (todas tienen que aparecer). «sentadillas» encuentra
// «Sentadilla frontal»; «wall balls», «Wall ball». Los nombres en inglés viajan en
// el texto de búsqueda de cada fila (lo arma el servidor), así que «squat»
// encuentra lo que el coach llama «sentadilla».
//
// Misma regla de plural que la resolución de ejercicios (lib/exercises/resolve.ts,
// `singularWord`), escrita aquí porque aquel módulo es de servidor.

const DIACRITICS = /[̀-ͯ]/g;
const KEEP_S = new Set(['abs', 'bus', 'gas']);

function singular(w: string): string {
  if (w.length <= 2 || KEEP_S.has(w)) return w;
  if (/(ones|iones)$/.test(w)) return w.slice(0, -2);
  if (/(ches|shes|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

export function searchWords(raw: string): string[] {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(singular);
}

/** Prepara el texto de una fila una vez. */
export function searchIndex(text: string): string {
  return ` ${searchWords(text).join(' ')} `;
}

/** ¿La fila (ya indexada) contiene todas las palabras de la consulta (como prefijo)? */
export function matchesQuery(index: string, query: string): boolean {
  const words = searchWords(query);
  return words.every((w) => index.includes(` ${w}`));
}
