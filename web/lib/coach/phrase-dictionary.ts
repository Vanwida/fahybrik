import 'server-only';

// Diccionario de frases de carga — lectura/escritura sobre
// `coach_load_phrases` (mig 0209).
//
// Vacío = no lo sé. El importador manda esas líneas a revisión. Nunca se
// inventa un mapeo. Guardar reemplaza el conjunto entero.

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import {
  dictionaryFromRows,
  phraseKeyFrom,
  type CoachPhraseMapping,
  type PhraseDictionary,
} from '@fahybrid/shared/domain/coach/phrase-dictionary';
import type {
  CoachPhraseDictionaryPutInput,
  CoachPhraseDictionaryResponse,
} from '@fahybrid/shared/schema/coach-phrase-dictionary';

const TABLE = 'coach_load_phrases';

interface StoredRow {
  phrase_key: string;
  phrase: string;
  as_kind: string;
  value: number | string;
  value_max: number | string | null;
  updated_at: string;
}

function toMapping(row: StoredRow): CoachPhraseMapping {
  return {
    phrase: row.phrase,
    phrase_key: row.phrase_key,
    as: row.as_kind as CoachPhraseMapping['as'],
    value: Number(row.value),
    ...(row.value_max != null ? { value_max: Number(row.value_max) } : {}),
  };
}

async function loadRows(
  coach_id: bigint | number,
  client: Sql | TransactionClient,
): Promise<{ rows: CoachPhraseMapping[]; updated_at: string | null }> {
  try {
    const rows = await client<StoredRow[]>`
      select
        phrase_key,
        phrase,
        as_kind,
        value::float8 as value,
        value_max::float8 as value_max,
        updated_at::text as updated_at
      from coach_load_phrases
      where coach_id = ${coach_id}
      order by phrase_key
    `;
    let updated_at: string | null = null;
    for (const row of rows) {
      if (row.updated_at && (!updated_at || row.updated_at > updated_at)) {
        updated_at = row.updated_at;
      }
    }
    return { rows: rows.map(toMapping), updated_at };
  } catch (err) {
    if (isPgMissingRelation(err, TABLE)) return { rows: [], updated_at: null };
    throw err;
  }
}

export async function getCoachPhraseDictionary(
  coach_id: bigint | number,
  client: Sql | TransactionClient = defaultSql,
): Promise<CoachPhraseDictionaryResponse> {
  const { rows, updated_at } = await loadRows(coach_id, client);
  return { entries: rows, updated_at };
}

export async function loadCoachPhraseDictionary(
  coach_id: bigint | number,
  client: Sql | TransactionClient = defaultSql,
): Promise<PhraseDictionary> {
  const { rows } = await loadRows(coach_id, client);
  return dictionaryFromRows(rows);
}

export async function upsertCoachPhraseDictionary(
  coach_id: bigint | number,
  values: CoachPhraseDictionaryPutInput,
  client: Sql = defaultSql,
): Promise<CoachPhraseDictionaryResponse> {
  await client.begin(async (tx) => {
    await tx`delete from coach_load_phrases where coach_id = ${coach_id}`;
    for (const entry of values.entries) {
      await tx`
        insert into coach_load_phrases (
          coach_id, phrase_key, phrase, as_kind, value, value_max, updated_at
        ) values (
          ${coach_id},
          ${phraseKeyFrom(entry.phrase)},
          ${entry.phrase.trim()},
          ${entry.as},
          ${entry.value},
          ${entry.value_max ?? null},
          now()
        )
      `;
    }
  });
  return getCoachPhraseDictionary(coach_id, client);
}
