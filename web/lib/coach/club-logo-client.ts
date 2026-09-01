'use client';

// Subir el logo del club. Misma danza que la foto de perfil, otras rutas,
// otra columna. Los límites salen de photo-source: es el mismo alojamiento.

import { fileExtension } from '@/lib/chat/schema';
import { PROFILE_PHOTO_EXTENSIONS, PROFILE_PHOTO_MAX_BYTES } from '@/lib/profile/photo-source';

export const CLUB_LOGO_ACCEPT_ATTR = PROFILE_PHOTO_EXTENSIONS.map((e) => `.${e}`).join(',');

export const CLUB_LOGO_ACCEPTED_LABEL = PROFILE_PHOTO_EXTENSIONS.filter((e) => e !== 'jpeg')
  .map((e) => e.toUpperCase())
  .join(', ');

const UPLOAD_FILE_FIELD = 'file';

export class ClubLogoUploadError extends Error {}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export const CLUB_LOGO_MAX_LABEL = megabytes(PROFILE_PHOTO_MAX_BYTES);

export function clubLogoRejection(file: File): string | null {
  if (!PROFILE_PHOTO_EXTENSIONS.includes(fileExtension(file.name))) {
    return `«${file.name}» no es una imagen que se pueda subir. Sube ${CLUB_LOGO_ACCEPTED_LABEL}.`;
  }
  if (file.size === 0) return `«${file.name}» está vacío.`;
  if (file.size > PROFILE_PHOTO_MAX_BYTES) {
    return `«${file.name}» pesa ${megabytes(file.size)} y el tope son ${CLUB_LOGO_MAX_LABEL}.`;
  }
  return null;
}

async function messageFromResponse(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function uploadClubLogo(file: File, signal?: AbortSignal): Promise<string> {
  const rejection = clubLogoRejection(file);
  if (rejection) throw new ClubLogoUploadError(rejection);

  const reserva = await fetch('/api/coach/club/logo/subida', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name }),
    signal,
  });
  if (!reserva.ok) {
    throw new ClubLogoUploadError(
      await messageFromResponse(reserva, 'No se pudo preparar la subida del logo.'),
    );
  }
  const target = (await reserva.json()) as { upload_url: string; image_id: string };

  const form = new FormData();
  form.append(UPLOAD_FILE_FIELD, file, file.name);
  const subida = await fetch(target.upload_url, { method: 'POST', body: form, signal });
  if (!subida.ok) {
    throw new ClubLogoUploadError('No se pudo subir el logo. Inténtalo otra vez.');
  }

  const confirmacion = await fetch('/api/coach/club/logo/confirmar', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image_id: target.image_id }),
    signal,
  });
  if (!confirmacion.ok) {
    throw new ClubLogoUploadError(
      await messageFromResponse(confirmacion, 'El logo se subió pero no se pudo guardar.'),
    );
  }
  return ((await confirmacion.json()) as { logo_url: string }).logo_url;
}

export async function deleteClubLogo(signal?: AbortSignal): Promise<void> {
  const res = await fetch('/api/coach/club/logo', {
    method: 'DELETE',
    credentials: 'include',
    signal,
  });
  if (!res.ok) {
    throw new ClubLogoUploadError(await messageFromResponse(res, 'No se pudo quitar el logo.'));
  }
}
