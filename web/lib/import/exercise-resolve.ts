/** Import adapter for the same scoped, active, ambiguity-aware resolver as the editor. */
import { sql, type Sql, type TransactionClient } from '@/lib/db';
import { resolveExercises } from '@/lib/exercises/resolve';
import { aliasToSlug } from '@/lib/exercises/exercise-terms';

// Public compatibility exports; callers and learned synonym keys do not change.
export { GLOBAL_ALIASES, normalizeTerm } from '@/lib/exercises/exercise-terms';
import { normalizeTerm } from '@/lib/exercises/exercise-terms';

type Client = Sql | TransactionClient;
export type ResolveVia = 'synonym' | 'alias' | 'name_exact' | 'name_substring';
export type ResolveHit = { exercise_id: number; via: ResolveVia };
export type ResolveMiss = { exercise_id: null; normalized: string };
export type ResolveResult = ResolveHit | ResolveMiss;

export async function resolveExercise(
  coachId: number,
  term: string,
  client: Client = sql,
): Promise<ResolveResult> {
  const [resolution] = await resolveExercises({ coach_id: coachId, tokens: [term], client });
  if (!resolution?.best) return { exercise_id: null, normalized: normalizeTerm(term) };
  const id = Number(resolution.best.id);
  const winner = resolution.candidates.find((candidate) => candidate.id === resolution.best!.id)!;
  if (winner.via === 'synonym') return { exercise_id: id, via: 'synonym' };
  if (winner.via === 'alias') return { exercise_id: id, via: 'alias' };
  // Keep the importer's telemetry labels even when a full name is also an alias.
  // This query does not choose an identity: the shared resolver already chose it.
  const historicalSlug = aliasToSlug(term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    ?? aliasToSlug(normalizeTerm(term));
  // tenancy: verified-owner — the shared resolver checked ownership and active status for this id.
  const aliases = await client<{ present: boolean }[]>`
    select exists(select 1 from exercise_aliases a where a.exercise_id = ${id}
      and a.term_normalized in (fahybrid_normalize_term(${term}), ${normalizeTerm(term)}))
      or exists(select 1 from exercises e where e.id = ${id} and e.slug = ${historicalSlug}) as present
  `;
  return { exercise_id: id, via: aliases[0]?.present ? 'alias'
    : winner.via === 'name' ? 'name_exact' : 'name_substring' };
}

/**
 * Learn (or correct) a coach's mapping: upsert the NORMALIZED term → exercise for
 * this coach so it resolves via layer 1 next time. Re-learning the same term to a
 * new exercise overwrites the target (the coach changed his mind), never
 * duplicates. No-op on an empty/noise-only term (nothing learnable). The caller
 * must have verified the exercise exists (the FK would otherwise raise 23503).
 */
export async function learnSynonym(
  coachId: number,
  term: string,
  exerciseId: number,
  client: Client = sql,
): Promise<void> {
  const term_normalized = normalizeTerm(term);
  if (!term_normalized) return;
  await client`
    insert into coach_exercise_synonyms (coach_id, term_normalized, exercise_id)
    values (${coachId}, ${term_normalized}, ${exerciseId})
    on conflict (coach_id, term_normalized) do update set exercise_id = excluded.exercise_id
  `;
}
