/** Postgres error helpers — tolerancia cuando faltan migraciones en dev. */

/** True when `err` is a Postgres "undefined_table" (42P01) for `relation`. */
export function isPgMissingRelation(err: unknown, relation: string): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String((err as { code: string }).code) : '';
  const message = 'message' in err ? String((err as { message: string }).message) : '';
  return code === '42P01' && message.includes(relation);
}
