// DELETE /api/perfil/foto
//
// «Quítame la foto»: se vacía la columna de quien pide y se borra la imagen en
// Cloudflare. Las dos cosas, porque dejarla allí sería ir acumulando fotos que ya nadie
// puede ver ni encontrar, y encima seguirían existiendo para quien conservara el enlace.
//
// Va en la raíz del recurso —y no en un `/borrar`— porque quitar la foto es DELETE
// sobre la foto. `subida` y `confirmar` cuelgan como pasos de ponerla.
//
// Sin foto se vuelve a las iniciales, que es un vacío honesto: nunca un muñeco gris de
// relleno que parece una foto que no cargó.
//
// Respuesta: { avatar_url: null } — el estado en el que queda, para que quien llamó
// pinte sin volver a preguntar.

import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { CloudflareMediaError } from '@/lib/cloudflare/api';
import { removeProfilePhoto } from '@/lib/profile/photo';
import { resolvePhotoPrincipal } from '@/lib/profile/photo-principal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request): Promise<NextResponse> {
  const principal = await resolvePhotoPrincipal(request);
  if (!principal) return jsonError('unauthorized', 'Sesión requerida', 401);

  try {
    await removeProfilePhoto(principal);
    return jsonOk({ avatar_url: null });
  } catch (err) {
    if (err instanceof CloudflareMediaError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}
