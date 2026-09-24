// La CLAVE DE CAPTURA de un lead (migración 0253).
//
// El embudo público no tiene sesión: quien escribe un email en el formulario no
// demuestra que ese email sea suyo. Así que el navegador que CREA la fila recibe
// una clave aleatoria (cookie HttpOnly, solo para /api/leads) y la fila guarda su
// sha-256. Completar o retocar un lead que ya existe exige presentar esa clave;
// sin ella, la fila no se toca y el token de reserva no sale en la respuesta — el
// lead lo recibe por correo, en SU dirección. Pura salvo el aleatorio.

import { createHash, randomBytes } from 'node:crypto';

export const LEAD_CAPTURE_COOKIE = 'fh_lead_capture';
/** Lo que dura la clave en el navegador: de sobra para rellenar el formulario. */
const MAX_AGE_SECONDS = 60 * 60 * 24;

export function newCaptureKey(): { key: string; hash: string } {
  const key = randomBytes(24).toString('base64url');
  return { key, hash: hashCaptureKey(key) };
}

export function hashCaptureKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** La clave que trae la petición, o null. Solo acepta la forma que emitimos. */
export function captureKeyFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === LEAD_CAPTURE_COOKIE) {
      const value = rest.join('=');
      return /^[A-Za-z0-9_-]{32}$/.test(value) ? value : null;
    }
  }
  return null;
}

/** La cabecera Set-Cookie para dejar la clave en el navegador que creó el lead. */
export function captureKeySetCookie(key: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${LEAD_CAPTURE_COOKIE}=${key}; Path=/api/leads; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure}`;
}
