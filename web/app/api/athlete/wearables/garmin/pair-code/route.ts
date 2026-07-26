// POST /api/athlete/wearables/garmin/pair-code   (bearer de atleta)
//
// Devuelve el email y un código de 6 dígitos para vincular la app del reloj, para
// enseñárselos al atleta EN PANTALLA.
//
// POR QUÉ EXISTE
// --------------
// Vincular un Garmin eran seis pasos, y el ida y vuelta era lo peor: escribir el
// email en Garmin Connect → ir al reloj a tocar «Pedir código» → esperar un correo
// → volver a Garmin Connect a escribirlo. Cuatro cambios de aplicación para
// vincular un reloj.
//
// Como el atleta YA está autenticado aquí, no hace falta nada de eso: le damos el
// código directamente. Quedan dos pasos — instalar la app, y copiar email y código
// en los ajustes.
//
// POR QUÉ ES SEGURO (y por qué NO es un atajo de login)
// ----------------------------------------------------
// Esto NO abre una vía nueva de autenticación: emite exactamente el mismo código
// que `/api/auth/email/request`, para el email de la sesión que ya presenta un
// bearer válido, y lo consume el mismo `/api/auth/email/verify` de siempre. Es
// MENOS expuesto que la vía por correo, porque el código no viaja por un canal de
// terceros: solo se ve en la pantalla de quien ya ha demostrado ser esa persona.
//
// El email NO se acepta como parámetro, se toma de la sesión. Si viniera del
// cliente, un bearer válido podría pedir un código para la cuenta de otro y eso
// SÍ sería un agujero.
//
// Es POST, no GET, porque muta: `createEmailLoginCode` invalida cualquier código
// anterior de ese email. Un GET cacheable que invalida estado es una trampa.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { createEmailLoginCode } from '@/lib/auth/email-code';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  // Mismo límite que el envío por correo: emitir códigos es la operación cara y
  // no debe abaratarse por venir de una sesión ya autenticada. Se acota por
  // ATLETA, no por IP, que es lo que de verdad identifica aquí.
  const rl = await withRateLimit({
    scope: 'athlete',
    identifier: String(auth.athlete_id),
    ...RATE_LIMITS.emailCodeRequest,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const { code_plaintext, expires_at } = await createEmailLoginCode(auth.email, {
    requested_ip: getClientIp(request),
  });

  return jsonOk({
    // El email va de vuelta a propósito: es lo que el atleta tiene que copiar en
    // los ajustes de Garmin Connect, y la app de iOS no lo tenía.
    email: auth.email,
    code: code_plaintext,
    expires_at: expires_at.toISOString(),
  });
}
