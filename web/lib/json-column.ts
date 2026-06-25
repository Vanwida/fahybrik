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
