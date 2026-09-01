// POST /api/perfil/foto/confirmar
//
// «Ya la he subido»: se comprueba CONTRA CLOUDFLARE que esa foto existe de verdad y que
// la subió quien la reclama, y sólo entonces se escribe la URL de entrega en la fila que
// toca — `coaches.avatar_url` o `athletes.avatar_url` según quién pida.
//
// POR QUÉ NO SE GUARDA AL RESERVAR, que es la razón de que esta ruta exista: entre
// reservar y subir se puede cerrar la app, cortarse la red o cancelarse la subida.
// Guardar la URL antes dejaría la columna apuntando a una imagen que nadie llegó a
// subir, y una foto que no existe no se distingue después de una foto rota. El paso de
// más compra que lo que hay en la columna sea siempre verdad.
//
// El cliente NO manda la URL: manda el identificador, y el localizador se lee de la
// respuesta de Cloudflare. Si viajara desde fuera, la columna acabaría guardando lo que
// alguien quisiera escribir en ella.
//
// Respuesta: { avatar_url } — la BASE de entrega, sin variante. El tamaño lo pide quien
// pinta (ver lib/profile/photo-source.ts).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { CloudflareMediaError } from '@/lib/cloudflare/api';
import { confirmProfilePhoto } from '@/lib/profile/photo';
import { resolvePhotoPrincipal } from '@/lib/profile/photo-principal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** El identificador de una imagen en Cloudflare Images: un UUID. Se comprueba la forma
 *  ANTES de preguntar, para no reenviarle a Cloudflare lo que llegue. */
const confirmarSchema = z.object({ image_id: z.string().uuid() }).strict();

export async function POST(request: Request): Promise<NextResponse> {
  const principal = await resolvePhotoPrincipal(request);
  if (!principal) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = confirmarSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('bad_request', 'Se esperaba { image_id }', 400, parsed.error.flatten());
  }

  try {
    return jsonOk(await confirmProfilePhoto({ principal, image_id: parsed.data.image_id }));
  } catch (err) {
    if (err instanceof CloudflareMediaError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}
