import type { Sql, TransactionClient } from '@/lib/db';
import { searchWords } from '@/lib/dashboard/programming/search-key';

type Client = Sql | TransactionClient;

/** Same word-prefix search as the two catalog screens; query order is irrelevant.
 * Ownership is applied by the caller. Learned terms always belong to this coach.
 */
export function catalogSearchFilter(client: Client, term: string | null, coachId: bigint | number | null) {
  const words = searchWords(term ?? '');
  if (!words.length) return client`true`;
  // tenancy: shared-catalog — base aliases are public; learned synonyms are scoped below.
  const vocabulary = client`regexp_replace(fahybrid_normalize_term(concat_ws(' ',
    e.name, ceo.name, e.name_es, ceo.name_es, e.name_en, ceo.name_en, e.slug,
    (select string_agg(a.term_normalized, ' ') from exercise_aliases a where a.exercise_id = e.id),
    (select string_agg(s.term_normalized, ' ') from coach_exercise_synonyms s
      where s.exercise_id = e.id and ${coachId === null ? client`false` : client`s.coach_id = ${coachId}`})
  )), '[^a-z0-9]+', ' ', 'g')`;
  return words.map((word) => client`${vocabulary} ~ ${`(^| )${word}`}`)
    .reduce((left, right) => client`(${left} and ${right})`);
}
