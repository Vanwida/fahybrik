// POST /api/perfil/foto/subida
//
// «Voy a subir mi foto»: se reserva un sitio en Cloudflare Images y se devuelve una
// dirección de subida DE UN SOLO USO contra la que el cliente hace `POST <fichero>`
// DIRECTO a Cloudflare. Los bytes no pasan por aquí: la plataforma corta el cuerpo de
// una función en ~4,5 MB, y aunque no lo hiciera, pagar cómputo por reenviar una foto
// es justo lo que no escala a muchos entrenadores.
//
// UNA RUTA, DOS PRINCIPALES. El entrenador entra con su sesión del panel y el atleta
// con su bearer desde el móvil, y cada uno sube LA SUYA: el principal se resuelve de la
// credencial, nunca del cuerpo, así que no hay forma de pedir la subida de otro. Es la
// misma ruta porque es el mismo acto — cambiar la foto de uno mismo.
//
// Respuesta: { upload_url, image_id, expires_at }. Y NO un localizador: aquí todavía no
// hay ningún fichero, así que no hay nada que guardar. Eso lo hace `../confirmar`.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { CloudflareMediaError } from '@/lib/cloudflare/api';
import { reserveProfilePhotoUpload } from '@/lib/profile/photo';
import { resolvePhotoPrincipal } from '@/lib/profile/photo-principal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sólo el nombre del fichero, que es lo único que aporta algo antes de subir nada: da
// el formato, y con él la negativa llega en el acto en vez de tras subir la foto
// entera. Ni el tamaño ni el tipo real se declaran: el tamaño no se puede comprobar
// desde aquí y el contenido lo mira Cloudflare, que es quien ve los bytes.
const subidaSchema = z.object({ filename: z.string().min(1).max(300) }).strict();

export async function POST(request: Request): Promise<NextResponse> {
  const principal = await resolvePhotoPrincipal(request);
  if (!principal) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = subidaSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('bad_request', 'Se esperaba { filename }', 400, parsed.error.flatten());
  }

  try {
    const target = await reserveProfilePhotoUpload({
      principal,
      filename: parsed.data.filename,
    });
    return jsonOk(target, 201);
  } catch (err) {
    if (err instanceof CloudflareMediaError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}
