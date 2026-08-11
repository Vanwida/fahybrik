'use client';

// La subida del vídeo de un ejercicio, desde el navegador del entrenador.
//
// Va en DOS pasos y los bytes nunca viajan dentro de una petición nuestra: primero
// se pide una dirección de subida firmada (`POST /api/coach/exercises/video-url`) y
// después los bytes van DIRECTOS contra ella. La plataforma corta el cuerpo de una
// petición en ~4,5 MB y un vídeo de técnica pesa mucho más.
//
// Va con XMLHttpRequest y no con fetch por UNA razón: fetch no informa del progreso
// de subida. Un vídeo de 120 MB sin barra parece la app colgada, y el coach vuelve a
// darle al botón.
//
// (El mismo baile lo hace `components/v2/planes/import-photo-upload.ts` para las
// capturas del importador. Son dos, con copy distinto y sin más piezas en común que
// el `PUT`; si aparece un tercero, el `PUT` con progreso se extrae y lo comparten.)
//
// Lo que se acepta y lo que pesa NO se copia aquí: sale de `video-source.ts`, que es
// el mismo módulo que aplica el servidor. Comprobarlo antes de subir no es
// duplicarlo, es no hacerle esperar 200 MB para darle un 413.

import { fileExtension } from '@/lib/chat/schema';
import {
  EXERCISE_VIDEO_EXTENSIONS,
  EXERCISE_VIDEO_MAX_BYTES,
} from '@/lib/exercises/video-source';

/** Para el `accept` del selector de ficheros: las mismas extensiones que firma el
 *  servidor, ni una más. */
export const EXERCISE_VIDEO_ACCEPT_ATTR = EXERCISE_VIDEO_EXTENSIONS.map((e) => `.${e}`).join(',');

/** Cómo se le nombran al coach los formatos que valen. */
const ACCEPTED_LABEL = EXERCISE_VIDEO_EXTENSIONS.map((e) => e.toUpperCase()).join(', ');

/** Un fallo de subida ya escrito para el coach. */
export class ExerciseVideoUploadError extends Error {}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/**
 * ¿Se puede subir? Devuelve el motivo EN PALABRAS del coach, o null si vale. Se
 * comprueba ANTES de subir nada: un fichero que el servidor va a rechazar no merece
 * que el coach espere a que suban 200 MB para enterarse.
 */
export function exerciseVideoRejection(file: File): string | null {
  if (!EXERCISE_VIDEO_EXTENSIONS.includes(fileExtension(file.name))) {
    return `«${file.name}» no es un vídeo que tu atleta pueda reproducir. Sube ${ACCEPTED_LABEL}.`;
  }
  if (file.size === 0) {
    return `«${file.name}» está vacío.`;
  }
  if (file.size > EXERCISE_VIDEO_MAX_BYTES) {
    return `«${file.name}» pesa ${megabytes(file.size)} y el tope son ${megabytes(
      EXERCISE_VIDEO_MAX_BYTES,
    )}.`;
  }
  return null;
}

interface SignedUpload {
  upload_url: string;
  video_url: string;
  content_type: string;
}

async function messageFromResponse(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** Pide el destino firmado. `exerciseId` viaja cuando el ejercicio ya existe: el
 *  servidor comprueba que es suyo o forkeable por él. */
async function signUpload(
  file: File,
  exerciseId: string | null,
  signal?: AbortSignal,
): Promise<SignedUpload> {
  const res = await fetch('/api/coach/exercises/video-url', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mime_type: file.type || undefined,
      size_bytes: file.size,
      ...(exerciseId ? { exercise_id: exerciseId } : {}),
    }),
    signal,
  });
  if (!res.ok) {
    throw new ExerciseVideoUploadError(
      await messageFromResponse(res, 'No se pudo preparar la subida del vídeo.'),
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
    const done = () => signal?.removeEventListener('abort', abort);
    xhr.open('PUT', signed.upload_url, true);
    // El content-type EXACTO que quedó firmado: cualquier otro lo rechaza el almacén.
    xhr.setRequestHeader('content-type', signed.content_type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new ExerciseVideoUploadError('No se pudo subir el vídeo. Inténtalo otra vez.'));
    };
    xhr.onerror = () => {
      done();
      reject(new ExerciseVideoUploadError('Se cortó la subida del vídeo.'));
    };
    xhr.onabort = () => {
      done();
      reject(new ExerciseVideoUploadError('Subida cancelada.'));
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
 * Sube UN vídeo y devuelve su localizador — el texto que va a `video_url` y que el
 * formulario guarda con el resto del ejercicio. Nunca una dirección suelta del
 * cliente: la construye el servidor al firmar.
 */
export async function uploadExerciseVideo(
  file: File,
  opts: { exerciseId?: string | null; onProgress?: (pct: number) => void; signal?: AbortSignal } = {},
): Promise<string> {
  const rejection = exerciseVideoRejection(file);
  if (rejection) throw new ExerciseVideoUploadError(rejection);

  const onProgress = opts.onProgress ?? (() => {});
  onProgress(0);
  const signed = await signUpload(file, opts.exerciseId ?? null, opts.signal);
  await putBytes(signed, file, onProgress, opts.signal);
  return signed.video_url;
}
