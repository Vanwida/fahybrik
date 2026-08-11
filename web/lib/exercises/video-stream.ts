import 'server-only';

// EL VÍDEO DE TÉCNICA QUE SUBE EL ENTRENADOR — dónde vive y cómo se reserva el sitio.
//
// POR QUÉ EXISTE: este software se vende a muchos entrenadores, y obligar a cada uno a
// abrirse un canal de YouTube antes de poder enseñar una sentadilla no es una decisión
// de producto: es una barrera. El vídeo es contenido del coach y tiene que poder
// subirlo desde su móvil o su ordenador.
//
// POR QUÉ CLOUDFLARE STREAM y no un fichero nuestro:
//   · TRANSCODIFICA lo que se le eche, así que el `.mov` en HEVC que escupe un iPhone
//     deja de ser una lotería en el móvil del atleta;
//   · sirve CALIDAD ADAPTATIVA por HLS, que es lo que hace falta cuando el atleta mira
//     la técnica en el gimnasio con la cobertura que haya;
//   · los BYTES NO PASAN POR NUESTRO CÓMPUTO, ni al subir ni al reproducir. Es el
//     cuello de botella real para escalar a muchos entrenadores, y además la
//     plataforma corta el cuerpo de cualquier función en ~4,5 MB
//     (`FUNCTION_PAYLOAD_TOO_LARGE`) antes de ejecutar una línea nuestra.
//
// EL BAILE, EN TRES PASOS: se valida la INTENCIÓN aquí (quién pide, sobre qué
// ejercicio, qué formato), se le pide a Stream una dirección de subida DE UN SOLO USO
// y se le da al navegador, que sube el fichero DIRECTO a Cloudflare. Después hay que
// ESPERAR: un vídeo recién subido todavía no se puede ver, y darlo por bueno antes de
// que Stream termine sería prometerle al entrenador un vídeo que su atleta vería en
// negro. Eso lo contesta `readExerciseVideoState`.
//
// NO SE GUARDA NADA EN NUESTRA BASE: el localizador que acaba en `video_url` es la URL
// del manifiesto que devuelve el propio Cloudflare. Una tabla de vídeos sería un
// segundo censo que puede contradecir al primero.

import { fileExtension } from '@/lib/chat/schema';
import {
  EXERCISE_VIDEO_EXTENSIONS,
  EXERCISE_VIDEO_MAX_DURATION_SECONDS,
  exerciseStreamRefFrom,
} from '@/lib/exercises/video-source';

/** La API de Cloudflare. */
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Cuánto vive la dirección de subida. Lo dimensiona el peor caso legítimo: un vídeo
 * en el tope saliendo del móvil del entrenador por datos lentos. Sigue siendo un
 * enlace que muere solo.
 */
const UPLOAD_URL_TTL_MS = 30 * 60 * 1000;

/**
 * `requireSignedURLs: false`, y dicho a propósito: el uid son 32 hexadecimales que no
 * se adivinan, o sea la MISMA exposición que un vídeo de YouTube «no listado», que es
 * exactamente lo que los entrenadores usan hoy para su material. A cambio, el vídeo se
 * reproduce sin firmar nada desde el iPhone del atleta y desde el panel.
 *
 * NO es una puerta que cerremos: la reproducción firmada es un interruptor POR VÍDEO
 * que Cloudflare deja voltear por API cuando lo pidamos, sin tocar el localizador ni
 * migrar nada.
 */
const REQUIRE_SIGNED_URLS = false;

/** De quién es el vídeo, anotado EN Stream. Así el censo de qué ha subido cada
 *  entrenador vive donde viven los vídeos, sin tabla nuestra que mantener a la par. */
const CREATOR_PREFIX = 'coach:';

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

/** El sitio reservado en Stream para UN vídeo. */
export interface ExerciseVideoUploadTarget {
  /** Dirección de un solo uso contra la que el navegador hace `POST` con el fichero. */
  upload_url: string;
  /** El identificador del vídeo en Stream. Con él se pregunta si ya está listo. */
  uid: string;
  expires_at: string;
}

/**
 * En qué anda un vídeo recién subido. Son los estados HONESTOS, no una promesa:
 *   · `procesando` — Stream lo está transcodificando; `pct` es lo que lleva.
 *   · `listo`      — `readyToStream`, y sólo entonces hay `video_url` que guardar.
 *   · `error`      — no se pudo, con el motivo que da Cloudflare.
 */
export type ExerciseVideoState =
  | { state: 'procesando'; pct: number }
  | { state: 'listo'; video_url: string }
  | { state: 'error'; message: string };

interface CloudflareEnvelope<T> {
  success: boolean;
  result: T | null;
  errors: { code: number; message: string }[];
}

interface StreamVideo {
  readyToStream: boolean;
  status?: { state?: string; pctComplete?: string; errorReasonText?: string } | null;
  playback?: { hls?: string } | null;
}

/** Cuenta y credencial, o un 503 honesto. Nunca se cae en silencio a otro camino: el
 *  respaldo mudo es lo que enmascaró durante semanas que en producción no se guardaba
 *  nada. */
function credenciales(): { accountId: string; token: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    throw new ExerciseVideoError('storage_unavailable', 'El alojamiento de vídeo no está configurado', 503);
  }
  return { accountId, token };
}

/** Una llamada a Stream, con su sobre desenvuelto. Sin red de seguridad a propósito:
 *  si Cloudflare no contesta lo que debe, que se vea. */
async function llamar<T>(path: string, init: RequestInit): Promise<T> {
  const { accountId, token } = credenciales();
  let res: Response;
  try {
    res = await fetch(`${CLOUDFLARE_API_BASE}/accounts/${accountId}/stream${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      cache: 'no-store',
    });
  } catch (err) {
    throw new ExerciseVideoError(
      'storage_unavailable',
      `No se pudo hablar con el alojamiento de vídeo: ${err instanceof Error ? err.message : 'error de red'}`,
      502,
    );
  }

  let body: CloudflareEnvelope<T> | null = null;
  try {
    body = (await res.json()) as CloudflareEnvelope<T>;
  } catch {
    body = null;
  }
  if (!res.ok || !body?.success || body.result == null) {
    const motivo = body?.errors?.[0]?.message ?? `respuesta ${res.status}`;
    throw new ExerciseVideoError('storage_unavailable', `El alojamiento de vídeo falló: ${motivo}`, 502);
  }
  return body.result;
}

/**
 * Reserva sitio para UN vídeo y devuelve dónde subirlo.
 *
 * QUIÉN COMPRUEBA QUÉ, para que no haya dos reglas del mismo eje:
 *   · el FORMATO lo comprueba el servidor, aquí, contra la lista que Stream ingiere;
 *   · la DURACIÓN queda firmada en la reserva y la hace cumplir CLOUDFLARE al recibir
 *     el fichero — es la regla que manda sobre el tamaño, y no se puede esquivar
 *     anunciando otra cosa porque no se anuncia nada;
 *   · los BYTES los mira el navegador antes de empezar, y sólo por cortesía: no le
 *     hacemos esperar a que suban 200 MB para darle una negativa.
 * Un tope de bytes «validado» aquí sería teatro: los bytes no pasan por nosotros y
 * nada obliga a que el fichero se parezca a lo que se hubiera anunciado.
 *
 * Quién es el entrenador y si el ejercicio es suyo o forkeable por él lo decide la
 * ruta ANTES de llamar aquí: este módulo sólo sabe de vídeos.
 */
export async function createExerciseVideoUploadTarget(args: {
  coach_id: bigint | number;
  filename: string;
}): Promise<ExerciseVideoUploadTarget> {
  const ext = fileExtension(args.filename);
  if (!EXERCISE_VIDEO_EXTENSIONS.includes(ext)) {
    throw new ExerciseVideoError(
      'invalid_extension',
      `Ese formato no se puede subir. Admitidos: ${EXERCISE_VIDEO_EXTENSIONS.join(', ')}.`,
    );
  }

  const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_MS);
  const result = await llamar<{ uploadURL: string; uid: string }>('/direct_upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      maxDurationSeconds: EXERCISE_VIDEO_MAX_DURATION_SECONDS,
      requireSignedURLs: REQUIRE_SIGNED_URLS,
      expiry: expiresAt.toISOString(),
      creator: `${CREATOR_PREFIX}${args.coach_id}`,
      meta: { name: args.filename },
    }),
  });
  return { upload_url: result.uploadURL, uid: result.uid, expires_at: expiresAt.toISOString() };
}

/**
 * ¿Ya se puede ver? El localizador se construye a partir del manifiesto que devuelve
 * el propio Cloudflare —nunca se inventa aquí— y se pasa por `exerciseStreamRefFrom`,
 * que es la MISMA validación que aplicará el guardado: si Stream devolviera algo con
 * otra forma, esto lo dice ahora en vez de dejar en la columna un texto que el campo
 * del panel rechazaría después.
 */
export async function readExerciseVideoState(uid: string): Promise<ExerciseVideoState> {
  const video = await llamar<StreamVideo>(`/${encodeURIComponent(uid)}`, { method: 'GET' });

  if (video.status?.state === 'error') {
    return {
      state: 'error',
      message: video.status.errorReasonText?.trim() || 'El vídeo no se pudo procesar.',
    };
  }

  if (!video.readyToStream) {
    const pct = Number(video.status?.pctComplete ?? 0);
    return { state: 'procesando', pct: Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0 };
  }

  const hls = video.playback?.hls ?? '';
  const ref = exerciseStreamRefFrom(hls);
  if (!ref) {
    return { state: 'error', message: 'El vídeo se procesó pero no se pudo localizar.' };
  }
  return { state: 'listo', video_url: hls };
}
