// POST /api/coach/import/upload-url
//
// El coach anuncia UNA captura que va a subir (MIME + bytes) y recibe una URL
// de subida PREFIRMADA contra la que hace `PUT <bytes>` DIRECTO a Vercel Blob
// — el servidor nunca toca los bytes. Mismo patrón que
// lib/chat/upload.ts / api/chat/upload-url/route.ts: la plataforma corta el
// body de una función en ~4.5 MB (verificado en producción) y una importación
// por foto sube VARIAS capturas, así que recibirlas en el body no cabe.
//
// El PATHNAME que devuelve es el único identificador que
// /api/coach/import/proposal (modo `photo`) acepta después — nunca una URL
// suelta del cliente. Ver el porqué, con detalle, en el comentario de
// `resolvePhotoImages` en lib/import/proposal-service.ts: aceptar una URL
// convertiría esa ruta en un proxy de descarga arbitraria.
//
// Auth: sesión de coach obligatoria. La carpeta del blob la decide el
// servidor a partir de `session.coach_id`, nunca del cliente.

import { randomUUID } from 'node:crypto';
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { IMPORT_PHOTO_MAX_BYTES } from '@/lib/import/proposal-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// El tope de bytes (`IMPORT_PHOTO_MAX_BYTES`) vive en lib/import/proposal-service.ts
// — es la MISMA constante que firma esta subida y que, del otro lado, vuelve a
// comprobar la ruta de proposal antes de descargar el blob. Una sola fuente.

/** MIME → extensión de la captura. La extensión manda sobre el nombre que
 *  mande el cliente (no lo pedimos): un `PUT` firmado solo admite ESTE
 *  content-type exacto, así que el MIME es el único dato que decide la
 *  extensión y no hay margen para que diverjan. */
const IMPORT_PHOTO_MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};
const IMPORT_PHOTO_MIMES = Object.keys(IMPORT_PHOTO_MIME_EXTENSION) as [string, ...string[]];

/** Cuánto vive la URL de subida. Una captura de calendario pesa poco (tope
 *  `IMPORT_PHOTO_MAX_BYTES`), así que una ventana corta basta y reduce el
 *  tiempo en que una URL firmada filtrada seguiría siendo válida. */
const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;

// Exported so the request shape has a pure, no-I/O test — same pattern as
// `profilePatchSchema` in app/api/athlete/profile/route.ts.
export const importPhotoUploadUrlSchema = z
  .object({
    mime_type: z.enum(IMPORT_PHOTO_MIMES),
    size_bytes: z.number().int().positive().max(IMPORT_PHOTO_MAX_BYTES),
  })
  .strict();

export async function POST(request: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = importPhotoUploadUrlSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }
  // `size_bytes` solo se valida (rechaza pronto un tamaño que igualmente
  // fallaría al subir); el tope que de verdad se firma es el fijo de abajo.
  const { mime_type } = parsed.data;

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    // Sin almacén no hay importación por foto, ni en desarrollo — nada de caer
    // a un camino silencioso que finja que la subida funcionó.
    return jsonError('storage_unavailable', 'El almacén de imágenes no está configurado', 503);
  }

  const ext = IMPORT_PHOTO_MIME_EXTENSION[mime_type]!;
  const now = new Date();
  const pathname = `import-photos/${session.coach_id}/${now.getUTCFullYear()}/${String(
    now.getUTCMonth() + 1,
  ).padStart(2, '0')}/${randomUUID()}.${ext}`;
  const validUntil = now.getTime() + UPLOAD_URL_TTL_MS;

  try {
    const signed = await issueSignedToken({
      token: blobToken,
      pathname,
      operations: ['put'],
      validUntil,
      allowedContentTypes: [mime_type],
      maximumSizeInBytes: IMPORT_PHOTO_MAX_BYTES,
    });
    const { presignedUrl } = await presignUrl(signed, {
      operation: 'put',
      pathname,
      access: 'private',
      validUntil,
      allowedContentTypes: [mime_type],
      maximumSizeInBytes: IMPORT_PHOTO_MAX_BYTES,
      // El pathname ya lleva uuid — un sufijo del almacén rompería la
      // coincidencia entre lo firmado aquí y lo que /proposal recibe después.
      addRandomSuffix: false,
    });
    return jsonOk(
      {
        upload_url: presignedUrl,
        pathname,
        content_type: mime_type,
        expires_at: new Date(validUntil).toISOString(),
      },
      201,
    );
  } catch (err) {
    return jsonError(
      'storage_unavailable',
      `No se pudo preparar la subida: ${err instanceof Error ? err.message : 'error de almacenamiento'}`,
      502,
    );
  }
}
