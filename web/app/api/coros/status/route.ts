// COROS "Service Status Check URL" — el endpoint que COROS consulta para saber si
// nuestro servicio está en pie. Declarado en la solicitud de API (25-jul-2026).
//
// POR QUÉ NO SE GATEA A 503 COMO EL RESTO DE /api/coros/*
// ------------------------------------------------------
// Los demás endpoints de COROS devuelven 503 mientras faltan las credenciales, y
// está bien: sin client id no hay OAuth que hacer. Pero este NO, y la diferencia
// es la pregunta que responde cada uno.
//
// COROS aquí pregunta "¿estáis en pie?", no "¿tenéis ya mis credenciales?".
// Devolver 503 mientras esperamos su aprobación les diría que el servicio está
// caído — justo durante la revisión de nuestra solicitud, y por una condición que
// depende de ELLOS. Un monitor que reintenta y siempre ve 503 acaba marcando la
// integración como muerta; Polar, por ejemplo, desactiva un webhook tras 7 días
// consecutivos sin un 200.
//
// Así que: 200 siempre que el proceso responda, y el DETALLE del estado va en el
// cuerpo. Informativo sin ser destructivo.
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
      // `configured` false = seguimos esperando las credenciales de COROS. No es un
      // fallo nuestro y por eso no baja el código HTTP.
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
