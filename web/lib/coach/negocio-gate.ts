import 'server-only';

// El portón de Negocio para las RUTAS DE API. Las páginas de Negocio ya mandan a
// Hoy a quien no tiene el add-on (`app/[locale]/(v2)/negocio/gate.ts`); sin esto,
// la API detrás de esas páginas seguía abierta a cualquier coach autenticado. Una
// sola función, usada por cada ruta de Negocio: leads, llamadas (citas con un
// lead), cobros y el resumen post-llamada a un lead.
//
// Lo que NO es Negocio y por eso no pasa por aquí: la agenda y el cupo (Ajustes ›
// Agenda, también sirven a las revisiones 1:1 con atletas), la conexión de Google
// (el Meet de las revisiones) y los partes de sesión sobre un atleta.

import type { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api/responses';
import { hasEntitlement } from '@/lib/coach/entitlements';

/**
 * `null` si el coach tiene Negocio; si no, la respuesta 403 que la ruta devuelve
 * tal cual. Falla CERRADO: un error al leer el permiso cuenta como «no lo tiene».
 */
export async function negocioForbidden(coach_id: bigint | number): Promise<NextResponse | null> {
  const ok = await hasEntitlement({ coach_id, feature: 'negocio' }).catch(() => false);
  if (ok) return null;
  return jsonError('negocio_required', 'Tu cuenta no tiene Negocio.', 403);
}
