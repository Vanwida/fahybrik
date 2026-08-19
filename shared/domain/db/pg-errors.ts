/** Postgres error helpers — tolerancia cuando faltan migraciones en dev. */

function pgCodeAndMessage(err: unknown): { code: string; message: string } {
  if (!err || typeof err !== 'object') return { code: '', message: '' };
  return {
    code: 'code' in err ? String((err as { code: string }).code) : '',
    message: 'message' in err ? String((err as { message: string }).message) : '',
  };
}

/** True when `err` is a Postgres "undefined_table" (42P01) for `relation`. */
export function isPgMissingRelation(err: unknown, relation: string): boolean {
  const { code, message } = pgCodeAndMessage(err);
  return code === '42P01' && message.includes(relation);
}

/** True when `err` is a Postgres "undefined_column" (42703) for `column`. */
export function isPgMissingColumn(err: unknown, column: string): boolean {
  const { code, message } = pgCodeAndMessage(err);
  return code === '42703' && message.includes(column);
}
