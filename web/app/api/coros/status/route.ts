// COROS "Service Status Check URL" — el endpoint que un monitor consulta para
// saber si nuestro servicio está en pie.
//
// POR QUÉ NO SE GATEA A 503 COMO EL RESTO DE /api/coros/*
// ------------------------------------------------------
// Connect / callback pueden devolver 503 si Dynamic Client Registration falla
// en ese momento. Este endpoint NO: COROS (o nuestro propio monitor) pregunta
// "¿estáis en pie?", no "¿ya tenéis un client_id persistido?".
//
// `configured` es true cuando Pico PUEDE registrarse solo (DCR + callback),
// no cuando hay un Partner COROS_CLIENT_ID / SECRET. MCP es self-service.
//
// La comprobación de base de datos es deliberadamente barata (`select 1`) y va con
// tope de tiempo: este endpoint tiene que contestar rápido o deja de cumplir su
// función. Su resultado se REPORTA, no cambia el código HTTP, porque un hipo de
// nuestra base de datos no significa que la integración de COROS esté rota.

import { loadCorosConfig } from '@/lib/coros/config';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tope para el ping a la base de datos. Un status que tarda no sirve de status. */
const DB_PROBE_TIMEOUT_MS = 2_000;

async function databaseReachable(): Promise<boolean> {
  try {
    await Promise.race([
      sql`select 1 as ok`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('db_probe_timeout')), DB_PROBE_TIMEOUT_MS),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function GET(): Promise<Response> {
  const cfg = loadCorosConfig();
  const database = await databaseReachable();

  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'FAHYBRID',
      // `configured` true = DCR can register (no Partner COROS_* required).
      integration: {
        provider: 'coros',
        configured: cfg.ok,
        ingest_ready: cfg.ok && database,
      },
      checks: { database },
      checked_at: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Un monitor tiene que ver el estado de AHORA, nunca uno cacheado.
        'cache-control': 'no-store, max-age=0',
      },
    },
  );
}

/** Algunos monitores comprueban con HEAD antes que con GET. */
export async function HEAD(): Promise<Response> {
  return new Response(null, {
    status: 200,
    headers: { 'cache-control': 'no-store, max-age=0' },
  });
}
