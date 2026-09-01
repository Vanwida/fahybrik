// BACKFILL HISTÓRICO DE GARMIN — pedir el pasado justo al conectar.
//
// Tras el OAuth, Garmin NO reenvía solo lo que ya pasó: hay que pedir un
// backfill por tipo de resumen. Garmin contesta 202 y empuja los datos por el
// MISMO webhook que ya tenemos (`/api/garmin/webhook` → ingest-garmin).
//
// LÍMITES (documentados por partners / portal; no inventados aquí):
//   · Ventana útil típica ~30 días (a veces hasta 90). Pedimos 90 y aceptamos
//     lo que devuelva; un 4xx de rango se registra y no tumba la conexión.
//   · Cada tipo se puede backfillear UNA vez por usuario en la práctica.
//   · El usuario debe haber concedido el scope de backfill en el consentimiento
//     (a veces viene desmarcado por defecto en la pantalla de Garmin).
//
// ESTO NO BLOQUEA EL CALLBACK. Se dispara en background tras guardar tokens:
// fallar el backfill no desconecta al atleta; solo deja el pasado vacío hasta
// que se reintente o entre el push en vivo.

import { loadGarminConfig } from '@/lib/garmin/config';
import { signOAuth1 } from '@/lib/garmin/oauth1';
import type { GarminTokenSet } from '@/lib/garmin/token-store';

/** Tipos que pedimos al conectar. Espejo de lo que ingest-garmin ya escribe. */
export const GARMIN_BACKFILL_TYPES = [
  'dailies',
  'sleeps',
  'hrv',
  'activities',
  'activityDetails',
  'stressDetails',
  'bodyComps',
  'userMetrics',
] as const;

export type GarminBackfillType = (typeof GARMIN_BACKFILL_TYPES)[number];

/**
 * Días hacia atrás que pedimos. Garmin suele devolver ~1 mes; pedimos 90 y
 * dejamos que el 4xx de rango recorte. No se sube de aquí sin evidencia nueva.
 */
export const GARMIN_BACKFILL_DAYS = 90;

/** Base del Wellness API (backfill vive aquí, no en connectapi). */
export const GARMIN_WELLNESS_BASE = 'https://apis.garmin.com/wellness-api/rest';

export type BackfillRequest = {
  type: GarminBackfillType;
  url: string;
  summaryStartTimeInSeconds: number;
  summaryEndTimeInSeconds: number;
};

export type BackfillTypeResult = {
  type: GarminBackfillType;
  ok: boolean;
  status: number | null;
  /** Mensaje corto si falló o Garmin rechazó. */
  detail?: string;
};

export type BackfillRunResult = {
  requested: BackfillTypeResult[];
  /** Cuántos tipos aceptó Garmin (2xx). */
  accepted: number;
  /** Cuántos fallaron de red o 4xx/5xx. */
  failed: number;
};

/** Construye las URLs de backfill para una ventana [end - days, end]. Puro. */
export function buildBackfillRequests(args: {
  now?: Date;
  days?: number;
  types?: readonly GarminBackfillType[];
}): BackfillRequest[] {
  const now = args.now ?? new Date();
  const days = args.days ?? GARMIN_BACKFILL_DAYS;
  const types = args.types ?? GARMIN_BACKFILL_TYPES;
  const endSec = Math.floor(now.getTime() / 1000);
  const startSec = endSec - days * 86_400;

  return types.map((type) => {
    const query = new URLSearchParams({
      summaryStartTimeInSeconds: String(startSec),
      summaryEndTimeInSeconds: String(endSec),
    });
    return {
      type,
      url: `${GARMIN_WELLNESS_BASE}/backfill/${type}?${query.toString()}`,
      summaryStartTimeInSeconds: startSec,
      summaryEndTimeInSeconds: endSec,
    };
  });
}

/**
 * Firma y lanza un GET de backfill. 202/200 = aceptado (los datos llegan por
 * push). 409 u otros 4xx se reportan sin reintentar en bucle.
 */
export async function requestGarminBackfillType(args: {
  type: GarminBackfillType;
  url: string;
  consumer_key: string;
  consumer_secret: string;
  tokens: GarminTokenSet;
  fetchFn?: typeof fetch;
}): Promise<BackfillTypeResult> {
  const fetchFn = args.fetchFn ?? fetch;
  const urlObj = new URL(args.url);
  const query: Record<string, string> = {};
  urlObj.searchParams.forEach((v, k) => {
    query[k] = v;
  });
  const baseUrl = `${urlObj.origin}${urlObj.pathname}`;

  const { authHeader } = signOAuth1({
    method: 'GET',
    url: baseUrl,
    query,
    consumer_secret: args.consumer_secret,
    token_secret: args.tokens.token_secret,
    oauth_params: {
      oauth_consumer_key: args.consumer_key,
      oauth_token: args.tokens.access_token,
    },
  });

  try {
    const res = await fetchFn(args.url, {
      method: 'GET',
      headers: { authorization: authHeader },
    });
    // 202 Accepted es la respuesta canónica; 200 también se ve en sandboxes.
    if (res.status === 200 || res.status === 202) {
      return { type: args.type, ok: true, status: res.status };
    }
    // 409 = ya se pidió backfill de este tipo (límite de una vez). No es fallo
    // de conexión: el pasado puede estar en camino o ya haberse entregado.
    if (res.status === 409) {
      return {
        type: args.type,
        ok: true,
        status: 409,
        detail: 'already_requested',
      };
    }
    const body = await res.text().catch(() => '');
    return {
      type: args.type,
      ok: false,
      status: res.status,
      detail: body.slice(0, 200) || `http_${res.status}`,
    };
  } catch (e) {
    return {
      type: args.type,
      ok: false,
      status: null,
      detail: (e as Error).message,
    };
  }
}

/**
 * Dispara el backfill de todos los tipos. No lanza: siempre devuelve el
 * recuento. El caller del callback OAuth lo lanza en background.
 */
export async function runGarminBackfill(args: {
  tokens: GarminTokenSet;
  now?: Date;
  days?: number;
  fetchFn?: typeof fetch;
}): Promise<BackfillRunResult> {
  const cfg = loadGarminConfig();
  if (!cfg.ok) {
    return {
      requested: GARMIN_BACKFILL_TYPES.map((type) => ({
        type,
        ok: false,
        status: null,
        detail: `missing_env:${cfg.missing.join(',')}`,
      })),
      accepted: 0,
      failed: GARMIN_BACKFILL_TYPES.length,
    };
  }

  const requests = buildBackfillRequests({ now: args.now, days: args.days });
  const results: BackfillTypeResult[] = [];
  for (const req of requests) {
    // Secuencial a propósito: Garmin rate-limita; un Promise.all de 8 GETs
    // en el mismo segundo es la forma fácil de ganar un 429 en el día 1.
    results.push(
      await requestGarminBackfillType({
        type: req.type,
        url: req.url,
        consumer_key: cfg.config.consumer_key,
        consumer_secret: cfg.config.consumer_secret,
        tokens: args.tokens,
        fetchFn: args.fetchFn,
      }),
    );
  }

  const accepted = results.filter((r) => r.ok).length;
  return {
    requested: results,
    accepted,
    failed: results.length - accepted,
  };
}

