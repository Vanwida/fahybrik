'use client';

// LA SUBIDA DEL VÍDEO DE UN EJERCICIO, desde el navegador del entrenador.
//
// Va en TRES pasos, y los bytes nunca viajan dentro de una petición nuestra:
//   1. se reserva sitio (`POST /api/coach/exercises/video/subida`);
//   2. el fichero va DIRECTO a Cloudflare Stream, contra la dirección reservada;
//   3. se ESPERA a que Stream lo transcodifique (`GET …/video/estado`), porque un
//      vídeo recién subido todavía no se reproduce. Sólo cuando está listo hay
//      localizador que guardar.
//
// El paso 3 no es un detalle de implementación: es la diferencia entre decirle al
// entrenador «ya está» y que su atleta abra el ejercicio y vea un rectángulo negro.
//
// El paso 2 va con XMLHttpRequest y no con fetch por UNA razón: fetch no informa del
// progreso de subida. Un vídeo de 120 MB sin barra parece la app colgada, y el
// entrenador vuelve a darle al botón.
//
// Lo que se acepta y lo que pesa NO se copia aquí: sale de `video-source.ts`, que es
// el mismo módulo que aplica el servidor. Comprobarlo antes de subir no es duplicarlo,
// es no hacerle esperar 200 MB para darle una negativa.

import { fileExtension } from '@/lib/chat/schema';
import {
  EXERCISE_VIDEO_EXTENSIONS,
  EXERCISE_VIDEO_MAX_BYTES,
} from '@/lib/exercises/video-source';

/** Para el `accept` del selector de ficheros: las mismas extensiones que admite el
 *  servidor, ni una más. */
export const EXERCISE_VIDEO_ACCEPT_ATTR = EXERCISE_VIDEO_EXTENSIONS.map((e) => `.${e}`).join(',');

/** Cómo se le nombran al entrenador los formatos que valen. */
const ACCEPTED_LABEL = EXERCISE_VIDEO_EXTENSIONS.map((e) => e.toUpperCase()).join(', ');

/** El campo que Cloudflare espera en el formulario de la subida directa. */
const UPLOAD_FILE_FIELD = 'file';

/** Cada cuánto se le pregunta a Stream si ya terminó. Lo bastante seguido para que un
 *  clip corto (lo normal: quince segundos) se sienta inmediato, y lo bastante espaciado
 *  para no martillear la API mientras transcodifica uno largo. */
const POLL_INTERVAL_MS = 2_000;

/** Cuánto se espera como mucho a que Stream termine antes de dar el parte. Un vídeo de
 *  cinco minutos —el tope— se procesa de sobra dentro de esta ventana; si se agota, es
 *  que algo va mal y decirlo es mejor que dejar la rueda girando para siempre. */
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/** Un fallo de subida ya escrito para el entrenador. */
export class ExerciseVideoUploadError extends Error {}

/** En qué anda la subida, para que el panel lo cuente tal cual es. */
export type ExerciseVideoUploadPhase =
  | { phase: 'subiendo'; pct: number }
  | { phase: 'procesando'; pct: number };

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/**
 * ¿Se puede subir? Devuelve el motivo EN PALABRAS del entrenador, o null si vale. Se
 * comprueba ANTES de subir nada: un fichero que el servidor va a rechazar no merece
 * que el entrenador espere a que suban 200 MB para enterarse.
 */
export function exerciseVideoRejection(file: File): string | null {
  if (!EXERCISE_VIDEO_EXTENSIONS.includes(fileExtension(file.name))) {
    return `«${file.name}» no es un vídeo que se pueda subir. Sube ${ACCEPTED_LABEL}.`;
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

interface UploadTarget {
  upload_url: string;
  uid: string;
}

type EstadoVideo =
  | { state: 'procesando'; pct: number }
  | { state: 'listo'; video_url: string }
  | { state: 'error'; message: string };

async function messageFromResponse(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** Reserva el sitio. `exerciseId` viaja cuando el ejercicio ya existe: el servidor
 *  comprueba que es suyo o forkeable por él. */
async function reservar(
  file: File,
  exerciseId: string | null,
  signal?: AbortSignal,
): Promise<UploadTarget> {
  const res = await fetch('/api/coach/exercises/video/subida', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      ...(exerciseId ? { exercise_id: exerciseId } : {}),
    }),
    signal,
  });
  if (!res.ok) {
    throw new ExerciseVideoUploadError(
      await messageFromResponse(res, 'No se pudo preparar la subida del vídeo.'),
    );
  }
  return (await res.json()) as UploadTarget;
}

/** El fichero, directo a Cloudflare, contando el progreso. */
function subirBytes(
  target: UploadTarget,
  file: File,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const done = () => signal?.removeEventListener('abort', abort);
    const form = new FormData();
    form.append(UPLOAD_FILE_FIELD, file, file.name);
    xhr.open('POST', target.upload_url, true);
    // Sin `content-type` a mano: lo pone el navegador con el `boundary` del formulario.
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
    xhr.send(form);
  });
}

function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(id);
      reject(new ExerciseVideoUploadError('Subida cancelada.'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Espera a que Stream termine de procesar y devuelve el localizador. Aquí es donde el
 * vídeo pasa de «subido» a «se puede ver», que no es lo mismo.
 */
async function esperarAQueEsteListo(
  uid: string,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const limite = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const res = await fetch(`/api/coach/exercises/video/estado?uid=${encodeURIComponent(uid)}`, {
      credentials: 'include',
      signal,
    });
    if (!res.ok) {
      throw new ExerciseVideoUploadError(
        await messageFromResponse(res, 'No se pudo comprobar si el vídeo está listo.'),
      );
    }
    const estado = (await res.json()) as EstadoVideo;
    if (estado.state === 'listo') return estado.video_url;
    if (estado.state === 'error') throw new ExerciseVideoUploadError(estado.message);

    onProgress(estado.pct);
    if (Date.now() >= limite) {
      throw new ExerciseVideoUploadError(
        'El vídeo está tardando demasiado en procesarse. Vuelve a intentarlo en un rato.',
      );
    }
    await esperar(POLL_INTERVAL_MS, signal);
  }
}

/**
 * Sube UN vídeo y devuelve su localizador — el texto que va a `video_url` y que el
 * formulario guarda con el resto del ejercicio. Sólo vuelve cuando el vídeo SE PUEDE
 * VER: nunca una dirección que todavía no reproduce nada.
 */
export async function uploadExerciseVideo(
  file: File,
  opts: {
    exerciseId?: string | null;
    onPhase?: (phase: ExerciseVideoUploadPhase) => void;
    signal?: AbortSignal;
  } = {},
): Promise<string> {
  const rejection = exerciseVideoRejection(file);
  if (rejection) throw new ExerciseVideoUploadError(rejection);

  const onPhase = opts.onPhase ?? (() => {});
  onPhase({ phase: 'subiendo', pct: 0 });
  const target = await reservar(file, opts.exerciseId ?? null, opts.signal);
  await subirBytes(target, file, (pct) => onPhase({ phase: 'subiendo', pct }), opts.signal);
  onPhase({ phase: 'procesando', pct: 0 });
  return esperarAQueEsteListo(
    target.uid,
    (pct) => onPhase({ phase: 'procesando', pct }),
    opts.signal,
  );
}
