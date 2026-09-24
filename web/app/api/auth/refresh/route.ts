// POST /api/auth/refresh — el atleta sigue dentro mientras use la app.
//
// Hasta hoy la sesión caducaba 30 días después de entrar, hiciera lo que hiciera
// (auditoría de la app, E3), y con Apple Salud conectado eso acababa en el bucle
// de salidas (E2). Fase 1 del diseño Watch-first, firmada: «los atletas siguen
// dentro». Es el patrón de Whoop, Strava, TrainingPeaks o Runna.
//
// Cómo: con un token todavía válido, la app pide uno nuevo (a lo sumo una vez al
// día, al abrir). El nuevo dura `athleteSessionTtlSeconds` desde AHORA: quien abre
// la app al menos una vez en ese plazo no vuelve a ver el login. El viejo NO se
// revoca: caduca solo en su fecha. Revocarlo aquí convertiría cualquier petición
// en vuelo con el token viejo en un 401 — justo el bucle que esto cierra. Cerrar
// sesión (`/api/auth/logout`) sigue revocando el que se usa.

import { AUTH_CONFIG } from '@/lib/auth/config';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { audiences, issueSession } from '@/lib/auth/session';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const rl = await withRateLimit({
    scope: 'user',
    identifier: auth.user_id.toString(),
    ...RATE_LIMITS.authRefresh,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const session = await issueSession({
    user_id: auth.user_id,
    audience: audiences.athlete,
    ttl_seconds: AUTH_CONFIG.athleteSessionTtlSeconds,
    user_agent: req.headers.get('user-agent'),
    ip: getClientIp(req),
  });

  return jsonOk({
    session_token: session.token,
    expires_at: session.expires_at.toISOString(),
  });
}
