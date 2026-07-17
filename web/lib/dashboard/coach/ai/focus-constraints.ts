/**
 * Foco del coach (texto libre) → RESTRICCIONES ESTRUCTURADAS.
 *
 * Por qué existe este módulo: el foco es lo ÚNICO que el coach escribe en
 * «Generar con IA», y hasta ahora se tiraba en silencio — la semana salía de una
 * rotación de grupos que jamás lo leía. Pedirle un foco y luego ignorarlo es
 * mentirle a la cara.
 *
 * Reparto de trabajo (deliberado):
 *   · Lo ESTRUCTURAL (¿doble sesión?, ¿cuántos días?) se parsea aquí, DETERMINISTA.
 *     Son garantías, no intenciones: si pide doble sesión, salen dos sesiones —
 *     no "si el modelo se acuerda". Además el fallback heurístico las hereda gratis,
 *     que es justo lo que faltaba (el fallback ignoraba el foco por completo).
 *   · Lo SEMÁNTICO (qué bloque concreto va el martes) lo elige el modelo, que para
 *     eso es bueno. Elige IDs de la biblioteca del coach — nunca escribe contenido.
 *
 * Puro y sin I/O (ni `server-only`): se testea directo y corre en ambos caminos.
 *
 * AGNÓSTICO: mapeamos a SLUGS de `methodology_groups` (mig 0030), que son la
 * identidad estable de la taxonomía. Los ids numéricos y los nombres viven en la
 * DB — no se hardcodean aquí. El resolver de slug→id es del llamador.
 */

/** Slugs de `methodology_groups` (mig 0030). Identidad estable de la taxonomía. */
export const GROUP_SLUGS = {
  fuerzaBase: 'fuerza-base',
  fuerzaExplosiva: 'fuerza-explosiva-pliometrica',
  ergometros: 'series-ergometros',
  running: 'series-running',
  zona2: 'zona2-recuperacion',
  wods: 'wods-metcons',
  simulaciones: 'simulaciones-carrera',
  core: 'core-movilidad-preventivos',
  circuitos: 'circuitos-funcionales',
  tapering: 'tapering-activacion',
} as const;

export type GroupSlug = (typeof GROUP_SLUGS)[keyof typeof GROUP_SLUGS];

/** Nº de sesiones por día que el coach puede pedir. Doble = am + pm. */
export const SESSIONS_SINGLE = 1;
export const SESSIONS_DOUBLE = 2;

/** Límites del dominio para los días de entreno de una semana. */
export const MIN_DAYS_PER_WEEK = 3;
export const MAX_DAYS_PER_WEEK = 7;

export interface FocusConstraints {
  /** 2 = doble sesión (am+pm). Deriva de una petición EXPLÍCITA del coach. */
  sessions_per_day: typeof SESSIONS_SINGLE | typeof SESSIONS_DOUBLE;
  /** Días de entreno pedidos explícitamente. `null` = sin petición → default. */
  days_per_week: number | null;
  /** Grupos pedidos, en orden de aparición en el foco (prioridad). */
  group_slugs: GroupSlug[];
  /** Términos del foco que dispararon cada grupo — para poder ser honestos. */
  matched_terms: string[];
}

/**
 * Un término del foco → los grupos que implica.
 *
 * `term` se compara sobre el foco NORMALIZADO (minúsculas, sin tildes), así que
 * se escribe sin tildes. El orden importa: el primero que casa manda la prioridad.
 *
 * OJO con «carrera» a secas: en este dominio significa RACE (competición) tanto
 * como "correr", y aparece dentro de "Simulaciones de Carrera" y "pre-carrera".
 * Es ambiguo → NO se mapea. Sí se mapean sus formas inequívocas ("carrera a pie").
 */
const FOCUS_TERMS: Array<{ term: RegExp; groups: GroupSlug[] }> = [
  // Específico de competición primero: "hyrox" es más informativo que "híbrido".
  { term: /\bhyrox\b/, groups: [GROUP_SLUGS.simulaciones, GROUP_SLUGS.wods] },
  { term: /\bdeka\b/, groups: [GROUP_SLUGS.simulaciones, GROUP_SLUGS.wods] },
  { term: /\bsimulaci(on|ones)\b/, groups: [GROUP_SLUGS.simulaciones] },
  { term: /\b(hibrido|hibrida)s?\b/, groups: [GROUP_SLUGS.wods, GROUP_SLUGS.circuitos] },
  { term: /\b(wod|wods|metcon|metcons)\b/, groups: [GROUP_SLUGS.wods] },
  { term: /\b(circuito|circuitos|funcional|funcionales)\b/, groups: [GROUP_SLUGS.circuitos] },
  // Correr.
  {
    term: /\b(running|correr|carrera a pie|rodaje|rodajes|pista|tempo run|fartlek|trote)\b/,
    groups: [GROUP_SLUGS.running, GROUP_SLUGS.zona2],
  },
  { term: /\b(series de running|intervalos)\b/, groups: [GROUP_SLUGS.running] },
  // Fuerza.
  {
    term: /\b(explosiv[ao]s?|pliometric[ao]s?|pliometria|potencia|saltos)\b/,
    groups: [GROUP_SLUGS.fuerzaExplosiva],
  },
  {
    term: /\b(fuerza|gimnasio|gym|squat|sentadilla|peso muerto)\b/,
    groups: [GROUP_SLUGS.fuerzaBase, GROUP_SLUGS.fuerzaExplosiva],
  },
  // Ergómetros.
  {
    term: /\b(ergo|ergos|ergometro|ergometros|remo|row|rower|ski|skierg|assault|bike|bici|bicicleta)\b/,
    groups: [GROUP_SLUGS.ergometros],
  },
  // Aeróbico suave / recuperación.
  {
    term: /\b(z2|zona 2|zona2|recuperacion|regenerativo|suave|aerobic[ao]s?|base aerobica|largo)\b/,
    groups: [GROUP_SLUGS.zona2],
  },
  // Core / preventivos.
  {
    term: /\b(core|movilidad|preventiv[ao]s?|prehab|estabilidad|abdominales)\b/,
    groups: [GROUP_SLUGS.core],
  },
  // Tapering.
  {
    term: /\b(taper|tapering|activacion|pre-carrera|precarrera|puesta a punto)\b/,
    groups: [GROUP_SLUGS.tapering],
  },
];

/** Doble sesión: formas naturales en que un coach lo escribe. */
const DOUBLE_SESSION_RE =
  /\b(dobles?\s+sesion(es)?|sesion(es)?\s+dobles?|dos\s+sesiones|2\s+sesiones|dos\s+veces\s+al\s+dia|2\s+veces\s+al\s+dia|doblar|doblando|two-a-day|twice\s+a\s+day)\b/;

/**
 * Días de entreno: "5 días", "4 dias/semana". Deliberadamente NO casa "1 semana"
 * ni "12 semanas" — la unidad tiene que ser DÍA, o "Créame 1 semana…" saldría
 * como una semana de un solo día de entreno.
 */
const DAYS_RE = /\b(\d{1,2})\s*d[ií]as?\b/;

/** Minúsculas + sin tildes/diacríticos, para comparar contra `FOCUS_TERMS`. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Extrae las restricciones estructuradas del foco en lenguaje natural.
 * Nunca lanza: un foco que no pide nada concreto devuelve los defaults
 * (1 sesión/día, sin días fijados, sin grupos preferidos) y la composición
 * decide con su criterio — que es exactamente lo correcto cuando el coach
 * escribe "semana normal".
 */
export function parseFocusConstraints(focus: string): FocusConstraints {
  const text = normalize(focus);

  const sessions_per_day = DOUBLE_SESSION_RE.test(text) ? SESSIONS_DOUBLE : SESSIONS_SINGLE;

  let days_per_week: number | null = null;
  const daysMatch = text.match(DAYS_RE);
  if (daysMatch) {
    const n = Number(daysMatch[1]);
    if (Number.isFinite(n) && n >= MIN_DAYS_PER_WEEK && n <= MAX_DAYS_PER_WEEK) {
      days_per_week = n;
    }
  }

  // Orden de aparición en el foco = prioridad. "running e híbrido enfocado en
  // hyrox" prioriza running sobre hyrox porque es lo que el coach dijo primero.
  const hits: Array<{ at: number; groups: GroupSlug[]; term: string }> = [];
  for (const entry of FOCUS_TERMS) {
    const m = text.match(entry.term);
    if (m && m.index != null) hits.push({ at: m.index, groups: entry.groups, term: m[0] });
  }
  hits.sort((a, b) => a.at - b.at);

  const group_slugs: GroupSlug[] = [];
  const matched_terms: string[] = [];
  for (const hit of hits) {
    if (!matched_terms.includes(hit.term)) matched_terms.push(hit.term);
    for (const g of hit.groups) {
      if (!group_slugs.includes(g)) group_slugs.push(g);
    }
  }

  return { sessions_per_day, days_per_week, group_slugs, matched_terms };
}
