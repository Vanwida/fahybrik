// Una palabra tecleada → un ejercicio del catálogo del coach (PLAN §4.9).
//
// Lo usa la línea rápida del editor de programas: el coach escribe «4x8 press banca 80kg»
// y la línea tiene que quedar ENLAZADA a un ejercicio (id), no guardada como texto. Esto
// resuelve la parte del ejercicio: `{ best, confidence, candidates }`. Con `best` y una
// confianza alta la línea se enlaza sola; si no, el editor enseña `candidates` para que el
// coach elija — y su elección se aprende (`learnSynonym`, lib/import/exercise-resolve.ts),
// así que el mismo término no vuelve a dudar.
//
// DÓNDE BUSCA — solo lo que ESTE coach puede ver (`visibleToCoach`, 0132: la base + los
// suyos, nunca los de otro coach), sin archivados, y por TODOS los nombres que el ejercicio
// tiene para él:
//   • sus sinónimos aprendidos (`coach_exercise_synonyms`, 0109) — mandan sobre todo;
//   • el nombre que él le puso (override, 0132) y los de la base, en castellano e inglés;
//   • el vocabulario compartido (`exercise_aliases`, 0172/0178) y el mapa de alias del
//     importador (`GLOBAL_ALIASES`) — el mismo conocimiento, sin divergir.
//
// CÓMO COMPARA — sin tildes, sin mayúsculas, sin ruido de cantidad/implemento/carga
// («8r», «db», «24kg»: `normalizeTerm`) y en SINGULAR («wall balls» = «wall ball»,
// «sentadillas» = «sentadilla»). Puntuación 0–1:
//   1     igual a un nombre o alias (sinónimo del coach por delante en el desempate)
//   ~0.9  el nombre está dentro de lo tecleado o al revés, según cuánto cubre
//         («burpees broad jump» ⊃ «broad jump» puntúa MENOS que el alias entero)
//   ≤0.85 parecido de letras (trigramas) — una errata («sentadila») sigue encontrando
// `best` solo cuando la mejor puntuación es ≥ BEST_MIN y no hay un empate cercano con otro
// ejercicio: un ejercicio equivocado dado por bueno es peor que preguntar.
//
// Es MECANISMO (nuestro): los nombres, alias y sinónimos son dato; aquí no hay nombres de
// ningún método.

import { sql } from '@/lib/db';
import { GLOBAL_ALIASES, normalizeTerm } from '@/lib/import/exercise-resolve';
import { joinCoachOverride, visibleToCoach } from '@/lib/exercises/coach-override';

/** Por debajo de esto no se enlaza solo: se pregunta. */
export const BEST_MIN = 0.72;
/** Dos ejercicios a menos de esto de distancia = empate: se pregunta. */
export const TIE_MARGIN = 0.05;
/** Candidatos que se devuelven y puntuación mínima para aparecer. */
export const CANDIDATE_LIMIT = 5;
export const CANDIDATE_MIN = 0.3;

export type MatchVia = 'synonym' | 'name' | 'alias' | 'partial' | 'fuzzy';

export interface ExerciseCandidate {
  id: string;
  name: string;
  score: number;
  via: MatchVia;
  /** El nombre o alias concreto que casó (normalizado). */
  matched: string;
}

export interface ExerciseResolution {
  /** Lo tecleado, normalizado (la clave con la que se aprende un sinónimo). */
  normalized: string;
  best: { id: string; name: string } | null;
  /** Puntuación del mejor candidato (0–1); 0 sin candidatos. */
  confidence: number;
  candidates: ExerciseCandidate[];
}

// ── Normalización ──────────────────────────────────────────────────────────────
const DIACRITICS = /[\u0300-\u036f]/g;

function basic(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palabras cortas cuya «s» final no es plural (y que, sin ella, chocarían con un alias:
 *  «ab» es la assault bike). */
const KEEP_S = new Set(['abs', 'bus', 'gas']);

/** Singular de UNA palabra, ES + EN, conservador: «flexiones»→«flexion», «balls»→«ball»,
 *  «ups»→«up», «sentadillas»→«sentadilla»; «press» y «abs» se quedan. Se aplica a los dos
 *  lados de la comparación, así que lo que importa es que sea igual, no que sea gramática. */
export function singularWord(w: string): string {
  if (w.length <= 2 || KEEP_S.has(w)) return w;
  if (/(ones|iones)$/.test(w)) return w.slice(0, -2);
  if (/[^aeiou]es$/.test(w) && /(ches|shes|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

/** La forma con la que se compara: básica + cada palabra en singular. */
export function matchKey(raw: string): string {
  return basic(raw)
    .split(' ')
    .filter(Boolean)
    .map(singularWord)
    .join(' ');
}

// ── Puntuación ─────────────────────────────────────────────────────────────────
function trigrams(s: string): Map<string, number> {
  const padded = `  ${s} `;
  const out = new Map<string, number>();
  for (let i = 0; i < padded.length - 2; i++) {
    const g = padded.slice(i, i + 3);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let inter = 0;
  let na = 0;
  let nb = 0;
  for (const v of ta.values()) na += v;
  for (const v of tb.values()) nb += v;
  for (const [g, v] of ta) inter += Math.min(v, tb.get(g) ?? 0);
  return (2 * inter) / (na + nb);
}

/** Puntuación 0–1 de lo tecleado (`q`, ya `matchKey`) contra un nombre (ya `matchKey`). */
export function scoreName(q: string, name: string): { score: number; kind: 'exact' | 'partial' | 'fuzzy' } {
  if (!q || !name) return { score: 0, kind: 'fuzzy' };
  if (q === name) return { score: 1, kind: 'exact' };
  const qw = q.split(' ');
  const nw = name.split(' ');
  const qs = new Set(qw);
  const ns = new Set(nw);
  const nameInQuery = nw.every((w) => qs.has(w));
  const queryInName = qw.every((w) => ns.has(w));
  let partial = 0;
  if (nameInQuery) partial = 0.5 + 0.4 * (nw.length / qw.length);
  else if (queryInName) partial = 0.5 + 0.4 * (qw.length / nw.length);
  const fuzzy = dice(q, name) * 0.85;
  return partial >= fuzzy ? { score: partial, kind: 'partial' } : { score: fuzzy, kind: 'fuzzy' };
}

// ── Catálogo visible ───────────────────────────────────────────────────────────
interface CatalogName {
  key: string;
  source: 'synonym' | 'name' | 'alias';
}
interface CatalogEntry {
  id: string;
  display: string;
  own: boolean;
  names: CatalogName[];
}

/** Todo lo que el coach puede enlazar, con todos sus nombres. Tres consultas en paralelo. */
async function loadCatalog(coach_id: bigint | number): Promise<CatalogEntry[]> {
  const coach = Number(coach_id);
  const [rows, aliases, synonyms] = await Promise.all([
    sql<
      {
        id: string;
        slug: string;
        own: boolean;
        display: string;
        names: (string | null)[];
      }[]
    >`
      select e.id::text as id, e.slug, (e.coach_id is not null) as own,
             coalesce(ceo.name_es, ceo.name, e.name_es, e.name, e.name_en) as display,
             array[e.name, e.name_es, e.name_en, ceo.name, ceo.name_es, ceo.name_en] as names
      from exercises e
      ${joinCoachOverride(sql, coach)}
      where ${visibleToCoach(sql, coach)} and e.archived_at is null
    `,
    sql<{ exercise_id: string; term: string }[]>`
      select a.exercise_id::text as exercise_id, a.term_normalized as term
      from exercise_aliases a join exercises e on e.id = a.exercise_id
      where ${visibleToCoach(sql, coach)} and e.archived_at is null
    `,
    sql<{ exercise_id: string; term: string }[]>`
      select s.exercise_id::text as exercise_id, s.term_normalized as term
      from coach_exercise_synonyms s join exercises e on e.id = s.exercise_id
      where s.coach_id = ${coach} and ${visibleToCoach(sql, coach)} and e.archived_at is null
    `,
  ]);

  const bySlug = new Map<string, string>();
  const entries = new Map<string, CatalogEntry>();
  for (const r of rows) {
    bySlug.set(r.slug, r.id);
    const names: CatalogName[] = [];
    for (const n of r.names) if (n && n.trim()) names.push({ key: matchKey(n), source: 'name' });
    entries.set(r.id, { id: r.id, display: r.display, own: r.own, names });
  }
  for (const a of aliases) entries.get(a.exercise_id)?.names.push({ key: matchKey(a.term), source: 'alias' });
  for (const [term, slug] of Object.entries(GLOBAL_ALIASES)) {
    const id = bySlug.get(slug);
    if (id) entries.get(id)?.names.push({ key: matchKey(term), source: 'alias' });
  }
  for (const s of synonyms) entries.get(s.exercise_id)?.names.push({ key: matchKey(s.term), source: 'synonym' });
  return [...entries.values()];
}

const SOURCE_RANK: Record<CatalogName['source'], number> = { synonym: 0, name: 1, alias: 2 };

function resolveAgainst(catalog: CatalogEntry[], token: string): ExerciseResolution {
  const normalized = normalizeTerm(token);
  // Dos lecturas de lo tecleado: la limpia de ruido («8r db snatch 24kg» → «snatch») y la
  // entera sin tildes (hay alias que llevan el implemento dentro: «db snatch»).
  const queries = [...new Set([matchKey(normalized), matchKey(token)].filter(Boolean))];
  if (queries.length === 0) return { normalized, best: null, confidence: 0, candidates: [] };

  const scored: (ExerciseCandidate & { rank: number; own: boolean })[] = [];
  for (const entry of catalog) {
    let top: (ExerciseCandidate & { rank: number }) | null = null;
    for (const n of entry.names) {
      for (const q of queries) {
        const { score, kind } = scoreName(q, n.key);
        if (score <= 0) continue;
        const via: MatchVia = kind === 'exact' ? (n.source === 'synonym' ? 'synonym' : n.source) : kind;
        const rank = kind === 'exact' ? SOURCE_RANK[n.source] : 3;
        if (!top || score > top.score || (score === top.score && rank < top.rank)) {
          top = { id: entry.id, name: entry.display, score, via, matched: n.key, rank };
        }
      }
    }
    if (top && top.score >= CANDIDATE_MIN) scored.push({ ...top, own: entry.own });
  }

  // Mejor puntuación; a igualdad, sinónimo del coach > nombre > alias; luego lo propio del
  // coach (es lo más específico que ha escrito él); luego el id más bajo (estable).
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.rank - b.rank ||
      Number(b.own) - Number(a.own) ||
      Number(a.id) - Number(b.id),
  );
  const candidates: ExerciseCandidate[] = scored.slice(0, CANDIDATE_LIMIT).map((c) => ({
    id: c.id,
    name: c.name,
    score: Math.round(c.score * 100) / 100,
    via: c.via,
    matched: c.matched,
  }));

  const first = scored[0];
  const second = scored[1];
  let best: ExerciseResolution['best'] = null;
  if (first && first.score >= BEST_MIN) {
    // Dos exactos: gana solo si hay un motivo (sinónimo/nombre sobre alias, o lo propio
    // del coach sobre la base). Dos exactos idénticos en todo = ambiguo → se pregunta.
    const clear =
      !second ||
      first.score - second.score >= TIE_MARGIN ||
      (first.score === 1 && (first.rank < second.rank || (first.own && !second.own)));
    if (clear) best = { id: first.id, name: first.name };
  }
  return { normalized, best, confidence: candidates[0]?.score ?? 0, candidates };
}

/** Resuelve UNA palabra tecleada contra el catálogo del coach. */
export async function resolveExercise(params: {
  coach_id: bigint | number;
  token: string;
}): Promise<ExerciseResolution> {
  const [res] = await resolveExercises({ coach_id: params.coach_id, tokens: [params.token] });
  return res!;
}

/** Varias palabras (un día entero pegado) con UNA carga del catálogo. Mismo orden. */
export async function resolveExercises(params: {
  coach_id: bigint | number;
  tokens: string[];
}): Promise<ExerciseResolution[]> {
  if (params.tokens.length === 0) return [];
  const catalog = await loadCatalog(params.coach_id);
  return params.tokens.map((t) => resolveAgainst(catalog, t));
}
