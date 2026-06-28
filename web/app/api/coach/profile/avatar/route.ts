import { put } from '@vercel/blob';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Accepted image types → file extension. Closed allow-list; anything else 415s.
const ALLOWED_TYPES = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
// Avatar cap. Comfortably under Vercel's request-body limit; the client also
// rejects oversized files before upload.
const MAX_BYTES = 4 * 1024 * 1024;

// POST /api/coach/profile/avatar — upload a coach photo to Vercel Blob and
// return its public URL. Does NOT persist to the DB: the client puts the URL
// into the form and it's saved with the rest via PATCH /api/coach/profile, so a
// single "Guardar" persists everything.
export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  // Honest degradation: without a Blob token the upload genuinely can't work, so
  // say so (503) instead of throwing a 500. The rest of the profile still saves.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return jsonError(
      'storage_unavailable',
      'El almacenamiento de imágenes no está configurado.',
      503,
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError('bad_request', 'Formulario inválido', 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return jsonError('bad_request', 'Falta el archivo de imagen', 400);
  }

  const ext = ALLOWED_TYPES.get(file.type);
  if (!ext) {
    return jsonError('unsupported_media_type', 'Formato no soportado · usa JPG, PNG o WEBP', 415);
  }
  if (file.size > MAX_BYTES) {
    return jsonError('payload_too_large', 'La imagen supera el máximo de 4 MB', 413);
  }

  try {
    const blob = await put(`coach-avatars/${session.coach_id}-avatar.${ext}`, file, {
      access: 'public',
      contentType: file.type,
      addRandomSuffix: true,
    });
    return jsonOk({ url: blob.url });
  } catch {
    return jsonError('upload_failed', 'No se pudo subir la imagen · Reintenta', 502);
  }
}
