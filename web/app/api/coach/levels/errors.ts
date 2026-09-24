import { jsonError } from '@/lib/api/responses';
import type { LevelError } from '@/lib/coach/levels';

/** Un LevelError del servicio → la respuesta con su frase para el coach. */
export function levelErrorResponse(err: LevelError) {
  const status = err.code === 'not_found' ? 404 : err.code === 'bad_request' ? 400 : 409;
  return jsonError(err.code, err.message, status);
}
