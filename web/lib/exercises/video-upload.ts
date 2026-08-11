import 'server-only';

// EL VÍDEO DE TÉCNICA QUE SUBE EL ENTRENADOR — dónde vive y cómo se prefirma.
//
// POR QUÉ EXISTE: hasta hoy el vídeo de un ejercicio sólo podía ser un enlace de
// YouTube. Este software se vende a muchos entrenadores, y obligar a cada uno a
// abrirse un canal antes de poder enseñar una sentadilla no es una decisión de
// producto: es una barrera. El vídeo es contenido del coach y tiene que poder
// subirlo desde su móvil o su ordenador.
//
// LOS BYTES NO PASAN POR NUESTRA API. La plataforma corta el cuerpo de cualquier
// función en ~4,5 MB (`FUNCTION_PAYLOAD_TOO_LARGE`) ANTES de que se ejecute una
// línea nuestra, y un vídeo de técnica pesa dos órdenes de magnitud más. Se valida
// la INTENCIÓN (quién pide, sobre qué ejercicio, qué formato, cuántos bytes), se
// prefirma una URL atada a UN pathname con tope de bytes y caducidad corta, y el
// cliente hace un `PUT` plano contra ella. Ver docs/DECISIONS.md (27-jul) y los dos
// hermanos que ya lo hacen: lib/chat/upload.ts y lib/communications/audio.ts.
//
// EL DUEÑO ES EL COACH, no un atleta: `ejercicios/<coach_id>/<yyyy>/<mm>/<uuid>.<ext>`.
// Un vídeo de técnica es catálogo, se lo ven todos sus atletas y existe antes de
// tener destinatario. Es la misma razón por la que el audio de un comunicado no vive
// en la carpeta del chat.
//
// El blob queda `access: 'private'`: su URL cruda no se puede pedir desde fuera y
// nunca se le entrega a nadie. Lo que se guarda en el ejercicio es el localizador de
// nuestro proxy autenticado (`/api/exercises/video/<pathname>`).

import { randomUUID } from 'node:crypto';
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { fileExtension } from '@/lib/chat/schema';
import {
  EXERCISE_VIDEO_EXTENSIONS,
  EXERCISE_VIDEO_MAX_BYTES,
  EXERCISE_VIDEO_ROOT,
  exerciseVideoLocator,
} from '@/lib/exercises/video-source';

/** Cuánto vive la URL de subida. Lo dimensiona el peor caso legítimo: el tope entero
 *  (200 MB) saliendo del móvil del coach por datos lentos. Sigue siendo un enlace
 *  que muere solo. */
const UPLOAD_URL_TTL_MS = 30 * 60 * 1000;

/** El tipo con el que se firma cuando el navegador no declara ninguno. Es el formato
 *  más común de los tres y el único que todos los navegadores etiquetan bien. */
const DEFAULT_VIDEO_MIME = 'video/mp4';

export class ExerciseVideoError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ExerciseVideoError';
  }
}

export interface ExerciseVideoUploadTarget {
  /** URL prefirmada contra la que el cliente hace `PUT <bytes>`. */
  upload_url: string;
  /** El localizador que se guarda en `video_url` (relativo, autenticado). */
  video_url: string;
  /** Content-Type EXACTO que el PUT debe declarar: es el que quedó firmado. */
  content_type: string;
  expires_at: string;
}

/** Los megas del tope, para decírselo al coach en su idioma. */
function megabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

/**
 * Valida la subida que el coach ANUNCIA y devuelve el destino prefirmado. El tope de
 * bytes queda firmado DENTRO de la URL: declarar un tamaño pequeño y subir uno
 * grande no cuela, lo rechaza el almacén y no nosotros.
 *
 * Quién es el coach y si el ejercicio es suyo o forkeable por él lo decide la ruta
 * ANTES de llamar aquí: este módulo sólo sabe de ficheros.
 */
export async function createExerciseVideoUploadTarget(args: {
  coach_id: bigint | number;
  filename: string;
  mime_type: string;
  size_bytes: number;
}): Promise<ExerciseVideoUploadTarget> {
  const mime_type = args.mime_type.includes('/') ? args.mime_type : DEFAULT_VIDEO_MIME;
  // La extensión manda sobre el MIME: el navegador miente con el MIME (un .mov de
  // iPhone llega como `video/quicktime`, y macOS a veces con el tipo vacío) mucho más
  // de lo que miente con el nombre.
  const ext = fileExtension(args.filename);
  if (!EXERCISE_VIDEO_EXTENSIONS.includes(ext)) {
    throw new ExerciseVideoError(
      'invalid_extension',
      `Ese formato no se puede reproducir en el móvil de tu atleta. Admitidos: ${EXERCISE_VIDEO_EXTENSIONS.join(', ')}.`,
    );
  }
  if (args.size_bytes > EXERCISE_VIDEO_MAX_BYTES) {
    throw new ExerciseVideoError(
      'too_large',
      `El vídeo no puede pasar de ${megabytes(EXERCISE_VIDEO_MAX_BYTES)} MB.`,
      413,
    );
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    // Sin almacén no hay vídeo, ni en desarrollo: el respaldo silencioso a disco es
    // lo que enmascaró durante semanas que en producción no se guardaba nada.
    throw new ExerciseVideoError('storage_unavailable', 'El almacén no está configurado', 503);
  }

  const now = new Date();
  const pathname = `${EXERCISE_VIDEO_ROOT}/${args.coach_id}/${now.getUTCFullYear()}/${String(
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
      maximumSizeInBytes: EXERCISE_VIDEO_MAX_BYTES,
    });
    const { presignedUrl } = await presignUrl(signed, {
      operation: 'put',
      pathname,
      access: 'private',
      validUntil,
      allowedContentTypes: [mime_type],
      maximumSizeInBytes: EXERCISE_VIDEO_MAX_BYTES,
      // Ya lleva uuid: un sufijo del almacén rompería la correspondencia entre el
      // pathname firmado y el que pide el proxy después.
      addRandomSuffix: false,
    });
    return {
      upload_url: presignedUrl,
      video_url: exerciseVideoLocator(pathname),
      content_type: mime_type,
      expires_at: new Date(validUntil).toISOString(),
    };
  } catch (err) {
    // Sin red de seguridad a propósito: si el almacén no firma, que se vea.
    throw new ExerciseVideoError(
      'storage_unavailable',
      `No se pudo preparar la subida: ${err instanceof Error ? err.message : 'error de almacenamiento'}`,
      502,
    );
  }
}
