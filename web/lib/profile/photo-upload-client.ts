'use client';

// SUBIR LA FOTO DE PERFIL desde el navegador.
//
// Va en TRES pasos, y los bytes nunca viajan dentro de una petición nuestra:
//   1. se reserva sitio (`POST /api/perfil/foto/subida`);
//   2. el fichero va DIRECTO a Cloudflare Images, contra la dirección reservada;
//   3. se confirma (`POST /api/perfil/foto/confirmar`), que es el paso que comprueba
//      contra Cloudflare que la foto está de verdad ahí y recién entonces la guarda.
//
// A diferencia del vídeo no hay que esperar a ningún procesado: una imagen subida se
// entrega ya. Por eso confirmar devuelve el localizador definitivo y no un «espera».
//
// Lo que se admite y lo que pesa NO se copia aquí: sale de `photo-source.ts`, el mismo
// módulo que aplica el servidor. Comprobarlo antes de subir no es duplicarlo, es no
// hacerle esperar la subida entera a quien iba a recibir una negativa.

import { fileExtension } from '@/lib/chat/schema';
import { PROFILE_PHOTO_EXTENSIONS, PROFILE_PHOTO_MAX_BYTES } from '@/lib/profile/photo-source';

/** Para el `accept` del selector de ficheros: las mismas extensiones que admite el
 *  servidor, ni una más. */
export const PROFILE_PHOTO_ACCEPT_ATTR = PROFILE_PHOTO_EXTENSIONS.map((e) => `.${e}`).join(',');

/** Cómo se nombran los formatos que valen, para decirlo en pantalla sin repetir la lista. */
export const PROFILE_PHOTO_ACCEPTED_LABEL = PROFILE_PHOTO_EXTENSIONS.filter((e) => e !== 'jpeg')
  .map((e) => e.toUpperCase())
  .join(', ');

/** El campo que Cloudflare espera en el formulario de la subida directa. */
const UPLOAD_FILE_FIELD = 'file';

/** Un fallo de subida ya escrito para quien lo va a leer. */
export class ProfilePhotoUploadError extends Error {}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** El tope, ya en palabras, para el texto de ayuda del formulario. */
export const PROFILE_PHOTO_MAX_LABEL = megabytes(PROFILE_PHOTO_MAX_BYTES);

/**
 * ¿Se puede subir? Devuelve el motivo EN PALABRAS, o null si vale. Se comprueba ANTES
 * de subir nada.
 */
export function profilePhotoRejection(file: File): string | null {
  if (!PROFILE_PHOTO_EXTENSIONS.includes(fileExtension(file.name))) {
    return `«${file.name}» no es una imagen que se pueda subir. Sube ${PROFILE_PHOTO_ACCEPTED_LABEL}.`;
  }
  if (file.size === 0) return `«${file.name}» está vacío.`;
  if (file.size > PROFILE_PHOTO_MAX_BYTES) {
    return `«${file.name}» pesa ${megabytes(file.size)} y el tope son ${PROFILE_PHOTO_MAX_LABEL}.`;
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

/**
 * Sube la foto de quien está dentro y devuelve la BASE de entrega ya guardada. Sólo
 * vuelve cuando la foto existe y la fila apunta a ella.
 */
export async function uploadProfilePhoto(file: File, signal?: AbortSignal): Promise<string> {
  const rejection = profilePhotoRejection(file);
  if (rejection) throw new ProfilePhotoUploadError(rejection);

  const reserva = await fetch('/api/perfil/foto/subida', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name }),
    signal,
  });
  if (!reserva.ok) {
    throw new ProfilePhotoUploadError(
      await messageFromResponse(reserva, 'No se pudo preparar la subida de la foto.'),
    );
  }
  const target = (await reserva.json()) as { upload_url: string; image_id: string };

  const form = new FormData();
  form.append(UPLOAD_FILE_FIELD, file, file.name);
  const subida = await fetch(target.upload_url, { method: 'POST', body: form, signal });
  if (!subida.ok) {
    throw new ProfilePhotoUploadError('No se pudo subir la foto. Inténtalo otra vez.');
  }

  const confirmacion = await fetch('/api/perfil/foto/confirmar', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image_id: target.image_id }),
    signal,
  });
  if (!confirmacion.ok) {
    throw new ProfilePhotoUploadError(
      await messageFromResponse(confirmacion, 'La foto se subió pero no se pudo guardar.'),
    );
  }
  return ((await confirmacion.json()) as { avatar_url: string }).avatar_url;
}

/** Quita la foto de quien está dentro. */
export async function deleteProfilePhoto(signal?: AbortSignal): Promise<void> {
  const res = await fetch('/api/perfil/foto', {
    method: 'DELETE',
    credentials: 'include',
    signal,
  });
  if (!res.ok) {
    throw new ProfilePhotoUploadError(
      await messageFromResponse(res, 'No se pudo quitar la foto.'),
    );
  }
}
