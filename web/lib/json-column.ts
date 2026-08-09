import type postgres from 'postgres';

/**
 * Una columna JSON puede llegar como objeto (jsonb — el driver ya lo parsea) o
 * como string (columnas json/text, o un valor doble-encodeado guardado como
 * texto). Devuelve el valor crudo listo para `schema.parse(...)`: si es string
 * lo parsea a JSON; si ya es objeto lo pasa tal cual.
 *
 * Existe porque un proposal_json guardado como string tumbaba el inbox del
 * coach (vive en el layout). Usar en todo `Schema.parse(coerceJson(row.x_json))`.
 */
export function coerceJson(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

/**
 * Cara de ESCRITURA de `coerceJson`. Deja un valor listo para `sql.json(...)`,
 * que es la ÚNICA forma de escribir una columna jsonb con postgres.js.
 *
 * Nunca `${JSON.stringify(x)}::jsonb`: postgres.js aprende por el cast que el
 * parámetro es jsonb y vuelve a serializar la cadena, así que la columna acaba
 * guardando un jsonb de tipo *string* y `columna->>'clave'` devuelve NULL
 * siempre (docs/DECISIONS.md 2026-08-09).
 *
 * El viaje por `JSON.stringify` con reemplazo de BigInt no es decorativo: las
 * filas del driver traen los ids como BigInt y `sql.json(...)` revienta sobre
 * ellos. Se serializan como Number, que es como ya viajaban a jsonb.
 */
export function toJsonValue(value: unknown): postgres.JSONValue {
  if (value === undefined) return null;
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? Number(v) : v)),
  ) as postgres.JSONValue;
}
