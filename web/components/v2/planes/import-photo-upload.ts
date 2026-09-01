'use client';

// import-photo-upload — las capturas del importador por foto viajan en DOS pasos y
// nunca dentro de la petición: primero se pide una dirección de subida firmada
// (/api/coach/import/upload-url) y después los bytes van DIRECTOS contra ella. La
// plataforma corta el cuerpo de una petición mucho antes de lo que pesa una tanda
// de capturas, así que mandarlas por la API no cabe. Es el mismo camino que ya
// hacen los adjuntos del chat.
//
// Va con XMLHttpRequest y no con fetch por UNA razón: fetch no informa del progreso
// de subida. Una captura de 15 MB sin barra parece la app colgada, y el coach
// vuelve a darle al botón.

import { useCallback, useState } from 'react';

/** Lo que `usePhotoUploads` necesita de una captura. Lo cumple `PhotoDraft`
 *  (ImportPhotoPicker); se pide así de poco para que la subida no dependa de la
 *  forma de la miniatura. */
interface PhotoDraftLike {
  id: string;
  file: File;
  pathname: string | null;
}

/** Lo que la subida escribe de vuelta en una captura. */
interface PhotoUploadPatch {
  progress?: number | null;
  pathname?: string;
  error?: string | null;
}

/**
 * ESPEJO de los topes del servidor: `IMPORT_PHOTO_MAX_IMAGES` e
 * `IMPORT_PHOTO_MAX_BYTES` (lib/import/proposal-service.ts) y la tabla de tipos de
 * app/api/coach/import/upload-url/route.ts. Están repetidos porque esos dos módulos
 * son de servidor y el navegador no puede importarlos; el que manda sigue siendo el
 * servidor, que lo vuelve a comprobar todo. Si cambian allí, cambian aquí.
 */
export const MAX_PHOTOS = 10;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/** Tipo de imagen aceptado → extensiones con las que se le reconoce. La extensión
 *  hace falta porque macOS entrega los `.heic` con el tipo vacío: sin esto, la
 *  captura del propio iPhone del coach se rechazaría en su cara. */
const ACCEPTED_IMAGE_TYPES: Readonly<Record<string, readonly string[]>> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/heic': ['heic'],
  'image/heif': ['heif'],
};

/** Para el `accept` del selector de ficheros. Lleva tipos Y extensiones por lo
 *  mismo que arriba. */
export const PHOTO_ACCEPT_ATTR = [
  ...Object.keys(ACCEPTED_IMAGE_TYPES),
  ...Object.values(ACCEPTED_IMAGE_TYPES).flatMap((exts) => exts.map((e) => `.${e}`)),
].join(',');

/** Cómo se le nombran al coach los formatos que valen. */
const ACCEPTED_LABEL = 'JPG, PNG, WEBP o HEIC';

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** El tipo con el que se firmará la subida, o null si el fichero no es una foto
 *  que sepamos leer. El tipo declarado manda; la extensión es el plan B. */
export function photoMimeType(file: File): string | null {
  const declared = file.type.toLowerCase();
  if (declared in ACCEPTED_IMAGE_TYPES) return declared;
  const ext = extensionOf(file.name);
  for (const [mime, exts] of Object.entries(ACCEPTED_IMAGE_TYPES)) {
    if (exts.includes(ext)) return mime;
  }
  return null;
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/**
 * ¿Se puede subir? Devuelve el motivo EN PALABRAS del coach, o null si vale. Se
 * comprueba antes de subir nada: un fichero que el servidor va a rechazar no
 * merece que el coach espere a que suban 15 MB para enterarse.
 */
export function rejectionReason(file: File): string | null {
  if (photoMimeType(file) == null) {
    return `«${file.name}» no es una foto que podamos leer. Sube ${ACCEPTED_LABEL}.`;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `«${file.name}» pesa ${megabytes(file.size)} y el tope por foto son ${megabytes(
      MAX_PHOTO_BYTES,
    )}.`;
  }
  if (file.size === 0) {
    return `«${file.name}» está vacío.`;
  }
  return null;
}

/** Un fallo de subida ya escrito para el coach. */
export class PhotoUploadError extends Error {}

async function messageFromResponse(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

interface SignedUpload {
  upload_url: string;
  pathname: string;
  content_type: string;
}

async function signUpload(file: File, mimeType: string, signal?: AbortSignal): Promise<SignedUpload> {
  const res = await fetch('/api/coach/import/upload-url', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mime_type: mimeType, size_bytes: file.size }),
    signal,
  });
  if (!res.ok) {
    throw new PhotoUploadError(
      await messageFromResponse(res, `No se pudo preparar la subida de «${file.name}».`),
    );
  }
  return (await res.json()) as SignedUpload;
}

/** Los bytes, contra la dirección firmada, contando el progreso. */
function putBytes(
  signed: SignedUpload,
  file: File,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open('PUT', signed.upload_url, true);
    xhr.setRequestHeader('content-type', signed.content_type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      signal?.removeEventListener('abort', abort);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new PhotoUploadError(`No se pudo subir «${file.name}». Inténtalo otra vez.`));
    };
    xhr.onerror = () => {
      signal?.removeEventListener('abort', abort);
      reject(new PhotoUploadError(`Se cortó la subida de «${file.name}».`));
    };
    xhr.onabort = () => {
      signal?.removeEventListener('abort', abort);
      reject(new PhotoUploadError(`Subida de «${file.name}» cancelada.`));
    };
    if (signal) {
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
    }
    xhr.send(file);
  });
}

/**
 * Sube UNA captura y devuelve su `pathname`, que es lo único que /proposal acepta
 * después (nunca una dirección suelta del cliente).
 */
export async function uploadPhoto(
  file: File,
  opts: { onProgress?: (pct: number) => void; signal?: AbortSignal } = {},
): Promise<string> {
  const mimeType = photoMimeType(file);
  if (mimeType == null) {
    throw new PhotoUploadError(`«${file.name}» no es una foto que podamos leer.`);
  }
  const onProgress = opts.onProgress ?? (() => {});
  onProgress(0);
  const signed = await signUpload(file, mimeType, opts.signal);
  await putBytes(signed, file, onProgress, opts.signal);
  return signed.pathname;
}

/**
 * La tanda entera, de una en una, marcando el progreso en cada miniatura.
 *
 * Devuelve los identificadores EN EL ORDEN DE LA LISTA — que es el orden de las
 * semanas — o null si alguna falla (el fallo se queda pintado en su miniatura, que
 * es donde el coach puede hacer algo con él). Una captura ya subida NO se vuelve a
 * subir aunque la haya movido de sitio: lo que cambia es la posición, no el fichero.
 */
export function usePhotoUploads(
  photos: PhotoDraftLike[],
  patch: (id: string, patch: PhotoUploadPatch) => void,
) {
  const [uploading, setUploading] = useState(false);

  const uploadAll = useCallback(async (): Promise<string[] | null> => {
    setUploading(true);
    try {
      const pathnames: string[] = [];
      for (const photo of photos) {
        if (photo.pathname) {
          pathnames.push(photo.pathname);
          continue;
        }
        patch(photo.id, { progress: 0, error: null });
        try {
          const pathname = await uploadPhoto(photo.file, {
            onProgress: (pct) => patch(photo.id, { progress: pct }),
          });
          patch(photo.id, { pathname, progress: 100 });
          pathnames.push(pathname);
        } catch (err) {
          patch(photo.id, {
            progress: null,
            error:
              err instanceof PhotoUploadError
                ? err.message
                : `No se pudo subir «${photo.file.name}». Inténtalo otra vez.`,
          });
          return null;
        }
      }
      return pathnames;
    } finally {
      setUploading(false);
    }
  }, [photos, patch]);

  return { uploading, uploadAll };
}
