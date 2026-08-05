// near-match — ¿este nombre que trae una importación es un ejercicio que el coach
// YA tiene, escrito de otra manera?
//
// POR QUÉ EXISTE. El resolutor del importador (lib/import/exercise-resolve.ts) ya
// prueba sinónimo, alias, nombre exacto y subcadena bidireccional (los acentos
// del nombre de catálogo se pliegan con `unaccent()` en SQL desde la migración
// 0151 — antes de eso «Puente de glúteo» no podía casar jamás; ya no es el caso).
// Lo que se le sigue escapando es lo que no es ni igual ni contenido:
//   · el orden de las palabras — «Squat Cossack» contra «Cossack Squat»
//   · un matiz de más — «Puente de glúteo a una pierna» contra «Puente de glúteo»
//
// Y existe aquí, a mano, porque en el repo NO hay nada que reutilizar: ni
// `pg_trgm`, ni `fuzzystrmatch`, ni índice trigram, ni librería de distancia de
// edición. Comprobado.
//
// LO QUE NO ES. Esto NO resuelve solo: propone. Fusionar dos ejercicios es una
// decisión del coach, porque el parecido de dos nombres no prueba que sean el
// mismo movimiento — «Remo» (el ergómetro) se parece muchísimo a «Remo con barra»
// (fuerza) y fusionarlos manda al atleta por la ruta equivocada del entreno en
// vivo. Por eso cada candidato viaja con su modalidad, para que lo que se compare
// sea el movimiento y no la cadena.

/** Un candidato del catálogo del coach, con lo justo para decidir. */
export interface NearMatchCandidate {
  id: number;
  name: string;
  modality: string;
  category: string;
}

/** Un candidato con su parecido, ya ordenado. */
export interface ScoredCandidate extends NearMatchCandidate {
  /** 0..1. Cuánto se parecen los dos nombres por sus palabras. */
  score: number;
}

/**
 * Cuánto tiene que parecerse para siquiera enseñarlo. Por debajo de esto, la
 * sugerencia es ruido y el coach acaba ignorando la columna entera — que es peor
 * que no sugerir, porque entonces tampoco mira las buenas.
 */
export const NEAR_MATCH_FLOOR = 0.5;

/** Cuántos se le enseñan por token. Más de tres no se leen. */
export const NEAR_MATCH_LIMIT = 3;

/**
 * Palabras que no distinguen un ejercicio de otro: si dos nombres solo comparten
 * estas, no se parecen en nada. Sin esto, «Press de banca» y «Puente de glúteo»
 * comparten «de» y empiezan a puntuar.
 */
const STOP_WORDS = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'con',
  'en',
  'a',
  'al',
  'y',
  'para',
  'sin',
  'the',
  'of',
  'with',
  'to',
  'and',
]);

/**
 * El nombre partido en palabras comparables: sin acentos, en minúsculas, sin
 * puntuación ni paréntesis, y sin las palabras vacías.
 *
 * Los paréntesis se abren en vez de tirarse: «Dominada (lastrada)» aporta
 * «dominada» y «lastrada», y la primera es justo la que empareja.
 */
export function nameTokens(raw: string): string[] {
  const folded = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const meaningful = folded.filter((w) => !STOP_WORDS.has(w));
  // Un nombre que es TODO palabras vacías se queda con lo que tenga: mejor
  // comparar algo que no comparar nada.
  return meaningful.length > 0 ? meaningful : folded;
}

/** Lo más corto que puede ser una palabra para que su prefijo signifique algo.
 *  Por debajo, «cat» emparejaría con «catch» y la sugerencia sería ruido. */
const MIN_STEM = 4;

/** Cuántas letras de más se toleran al final. Cubre el plural en español y en
 *  inglés (dominada/dominadas, press/presses) sin llegar a «pull»/«pullover». */
const MAX_TAIL = 2;

/**
 * ¿Son la misma palabra? Igualdad, o una es prefijo de la otra con una cola
 * corta.
 *
 * Existe porque el singular y el plural son LA variación real: la medición de la
 * semana 12 trae «Dominada (lastrada)» contra un catálogo con «Dominada», y
 * comparando cadenas enteras eso puntúa CERO. Sin esto, la fusión no serviría
 * justo para el caso más común.
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < MIN_STEM) return false;
  if (long.length - short.length > MAX_TAIL) return false;
  return long.startsWith(short);
}

/**
 * Parecido entre dos nombres, 0..1: cuántas palabras comparten sobre el total de
 * palabras distintas (Jaccard, con la igualdad tolerante de `sameWord`).
 *
 * Jaccard y NO «cuántas del corto están en el largo» a propósito: esa segunda da
 * 1,0 a «Remo» dentro de «Remo con barra en punta», que es exactamente la fusión
 * equivocada que hay que evitar — un ergómetro tragado por un ejercicio de
 * fuerza. Jaccard castiga la diferencia de tamaño, así que un nombre mucho más
 * largo baja el parecido en vez de subirlo.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  // Cada palabra de `b` se puede emparejar UNA vez: sin esto, un nombre que
  // repite una raíz («press press banca») inflaría el parecido.
  const used = new Array<boolean>(tb.length).fill(false);
  let shared = 0;
  for (const wa of ta) {
    const hit = tb.findIndex((wb, i) => !used[i] && sameWord(wa, wb));
    if (hit >= 0) {
      used[hit] = true;
      shared += 1;
    }
  }
  const union = ta.length + tb.length - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Los ejercicios del catálogo que más se parecen a este nombre, de mayor a menor.
 * Vacío = ninguno se parece lo bastante, y entonces crear es lo correcto.
 *
 * El empate se rompe por nombre más corto: entre «Dominada» y «Dominada
 * australiana», para un token «Dominadas» el genérico es la mejor apuesta.
 */
export function findNearMatches(
  name: string,
  catalog: readonly NearMatchCandidate[],
  opts: { floor?: number; limit?: number } = {},
): ScoredCandidate[] {
  const floor = opts.floor ?? NEAR_MATCH_FLOOR;
  const limit = opts.limit ?? NEAR_MATCH_LIMIT;
  const scored: ScoredCandidate[] = [];
  for (const candidate of catalog) {
    const score = nameSimilarity(name, candidate.name);
    if (score >= floor) scored.push({ ...candidate, score });
  }
  scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
  return scored.slice(0, limit);
}
