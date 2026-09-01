// EL LOCALIZADOR DEL VÍDEO DE UN EJERCICIO — una columna, dos formas, cero tipos
// guardados.
//
// `exercises.video_url` y `coach_exercise_overrides.video_url` guardan UN texto: el
// localizador del vídeo de técnica. El TIPO no se guarda en ninguna parte, se DERIVA
// de la forma del localizador — exactamente como `exerciseOriginExpr` deriva el
// origen en lib/exercises/coach-override.ts. Una columna «tipo» sería un segundo
// dato que puede contradecir al primero.
//
// DOS FORMAS VÁLIDAS Y NINGUNA MÁS:
//   • YouTube — cualquier forma que YouTube reparta (watch / youtu.be / embed /
//     shorts); se canoniza conservando la verticalidad de un Short.
//   • Propio  — el vídeo que sube el entrenador, alojado en Cloudflare Stream: su
//     manifiesto HLS `https://customer-<code>.cloudflarestream.com/<uid>/manifest/
//     video.m3u8`.
// Un texto vacío es null (sin vídeo; en un ejercicio de la base, «hereda»).
//
// POR QUÉ STREAM Y NO UN FICHERO NUESTRO: Stream TRANSCODIFICA lo que se le eche, así
// que un `.mov` en HEVC salido de un iPhone deja de ser una lotería de compatibilidad
// en el móvil del atleta; sirve calidad adaptativa por HLS (el atleta mira la técnica
// en el gimnasio, con la cobertura que haya); y los bytes no pasan por nuestro
// cómputo, que es justo el cuello de botella para escalar a muchos entrenadores.
//
// POR QUÉ AQUÍ SÍ ES UNA URL ABSOLUTA (y la de un fichero nuestro no lo era): esta URL
// no apunta a NUESTRO servidor, así que no hay dominio propio al que atarse. Es
// autodescriptiva y viaja igual desde producción, desde una vista previa y desde el
// simulador. El customer code viaja DENTRO del localizador a propósito: es lo que
// permite reconstruir el reproductor sin que el navegador ni el iPhone tengan que
// conocer ninguna configuración nuestra.
//
// LA EXPOSICIÓN, DICHA EN VOZ ALTA: los vídeos se crean con `requireSignedURLs:false`
// (ver lib/exercises/video-stream.ts), así que quien tenga el localizador puede
// verlo. Lo que lo protege es que el uid son 32 hexadecimales que no se adivinan —
// exactamente la misma exposición que un vídeo de YouTube «no listado», que es lo que
// los entrenadores usan hoy. La reproducción firmada es un interruptor POR VÍDEO que
// se puede voltear por API cuando haga falta: no es una puerta que estemos cerrando.
//
// POR QUÉ ESTE MÓDULO Y NO `shared/youtube.ts`: aquel es sobre YouTube y sigue
// siéndolo (este lo importa). Este es sobre EL VÍDEO DE UN EJERCICIO, que ya no es
// lo mismo.
//
// ES ISOMÓRFICO: sin `node:*`, sin `server-only`, y sin leer una sola variable de
// entorno. Lo aplica el servidor al guardar (createExercise / updateExercise) y el
// navegador antes de dejar guardar (VideoUrlField). Un solo criterio para los dos.

import { z } from 'zod';
import {
  parseYouTubeLink,
  youtubeCanonicalUrl,
  type YouTubeLink,
} from '@fahybrid/shared/youtube';
import { CHAT_ATTACHMENT_MAX_BYTES } from '@/lib/chat/schema';

/** El dominio donde Cloudflare Stream sirve los vídeos de una cuenta. */
const STREAM_HOST_SUFFIX = '.cloudflarestream.com';

/** Prefijo del subdominio por cuenta: `customer-<code>.cloudflarestream.com`. */
const STREAM_HOST_PREFIX = 'customer-';

/** El identificador de un vídeo en Stream: 32 hexadecimales. Es lo que emite
 *  Cloudflare y es, además, lo único que protege el vídeo (ver cabecera). */
const STREAM_UID_HEX_LENGTH = 32;

/** El camino canónico: el manifiesto HLS. Es lo que reproducen los dos lados (el
 *  iframe en el navegador y AVPlayer en el iPhone, que lo hace de forma nativa). */
const STREAM_HLS_PATH = 'manifest/video.m3u8';

/** El reproductor incrustado de Cloudflare, hermano del embed de YouTube. */
const STREAM_IFRAME_PATH = 'iframe';

/**
 * Los caminos que Cloudflare reparte para UN MISMO vídeo, y que por tanto se aceptan
 * y se canonizan al manifiesto HLS. Un entrenador que copie del panel de Cloudflare
 * pega la del iframe o la de «watch», no la del manifiesto: rechazárselas sería
 * decirle «eso no es un vídeo» sobre un vídeo suyo que sí lo es.
 */
const STREAM_EQUIVALENT_PATHS = [
  STREAM_HLS_PATH,
  'manifest/video.mpd',
  STREAM_IFRAME_PATH,
  'watch',
] as const;

/**
 * Formatos aceptados: los que **Stream ingiere**, no los que reproduce un iPhone.
 *
 * Antes esta lista era la del vídeo del chat (mp4/mov/m4v) y la razón era buena
 * entonces: el fichero se le servía TAL CUAL al móvil del atleta, así que lo que no
 * decodificara iOS no era vídeo. Con Stream de por medio eso ya no es verdad —
 * transcodifica a HLS/H.264 y el atleta recibe siempre algo que su móvil reproduce—,
 * y mantener la lista corta sería dejar puesta una validación cuya razón de ser ya no
 * existe: al entrenador se le rechazaría un fichero que Stream acepta sin problema.
 */
export const EXERCISE_VIDEO_EXTENSIONS: readonly string[] = [
  'mp4',
  'mov',
  'm4v',
  'mkv',
  'webm',
  'avi',
  'flv',
  'mpg',
  'mpeg',
  'ts',
  '3gp',
];

/**
 * Tope de bytes. Mismo criterio y misma constante que un vídeo del chat: es
 * literalmente el mismo fichero salido del mismo móvil, tanto si el entrenador lo
 * manda por el chat como si lo cuelga del ejercicio. Nunca un número suelto aquí.
 *
 * Es un corte AMABLE en el navegador, no la regla que manda: la que manda es la
 * duración, que es la que va firmada en la reserva de subida y la aplica Cloudflare.
 */
export const EXERCISE_VIDEO_MAX_BYTES = CHAT_ATTACHMENT_MAX_BYTES.video;

/**
 * Cuánto puede durar un vídeo de técnica. Cinco minutos son de sobra para enseñar un
 * movimiento —lo normal son quince segundos— y es el tope que Cloudflare reserva y
 * hace cumplir al recibir el fichero. Es LA regla del tamaño.
 */
export const EXERCISE_VIDEO_MAX_DURATION_SECONDS = 5 * 60;

/** Tope de caracteres de la columna, y del `maxLength` de la caja de texto. */
export const EXERCISE_VIDEO_URL_MAX = 500;

/**
 * El rechazo, en palabras del entrenador y NOMBRANDO las dos que sí valen. Lo
 * comparten el servidor (mensaje del 400) y el campo del panel, para que no haya dos
 * redacciones del mismo no.
 */
export const EXERCISE_VIDEO_REJECTION =
  'Eso no vale como vídeo. Pega un enlace de YouTube o sube un fichero desde aquí.';

/** El vídeo de un ejercicio, ya leído: qué forma tiene y su localizador canónico. */
export type ExerciseVideo =
  | { kind: 'youtube'; link: YouTubeLink; url: string }
  | { kind: 'stream'; code: string; uid: string; url: string };

/** El manifiesto HLS de un vídeo de Stream: lo que se guarda en la columna. */
export function exerciseStreamHlsUrl(code: string, uid: string): string {
  return `https://${STREAM_HOST_PREFIX}${code}${STREAM_HOST_SUFFIX}/${uid}/${STREAM_HLS_PATH}`;
}

/** El reproductor incrustado, para el navegador. Mismo par (code, uid) que el HLS,
 *  leído del propio localizador: el panel no necesita saber de qué cuenta salió. */
export function exerciseStreamIframeUrl(video: { code: string; uid: string }): string {
  return `https://${STREAM_HOST_PREFIX}${video.code}${STREAM_HOST_SUFFIX}/${video.uid}/${STREAM_IFRAME_PATH}`;
}

/**
 * `<code, uid>` detrás de un localizador de Stream, o null si no lo es.
 *
 * Es la comprobación que impide que el cliente guarde en un ejercicio un enlace a
 * cualquier sitio: sin ella, el entrenador (o quien le robara la sesión) podría hacer
 * que la app del atleta pidiera bytes a un dominio ajeno. El host se compara ENTERO
 * contra el de Cloudflare —nunca con `includes`, que dejaría pasar
 * `cloudflarestream.com.ejemplo.tld`.
 *
 * No se ata al customer code de NUESTRA cuenta a propósito: sería meter configuración
 * de servidor dentro de una validación que también corre en el navegador, y se
 * rompería el día que la cuenta cambie. Lo que hay que cerrar —que no apunte a un
 * dominio arbitrario— queda cerrado igual.
 */
export function exerciseStreamRefFrom(locator: string): { code: string; uid: string } | null {
  let url: URL;
  try {
    url = new URL(locator.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  if (!host.startsWith(STREAM_HOST_PREFIX) || !host.endsWith(STREAM_HOST_SUFFIX)) return null;
  const code = host.slice(STREAM_HOST_PREFIX.length, host.length - STREAM_HOST_SUFFIX.length);
  if (!/^[a-z0-9]+$/.test(code)) return null;

  // `/<uid>/<camino>`: el primer tramo es el vídeo, el resto dice qué se pide de él.
  const [uidRaw, ...rest] = url.pathname.replace(/^\//, '').split('/');
  const uid = (uidRaw ?? '').toLowerCase();
  if (!new RegExp(`^[0-9a-f]{${STREAM_UID_HEX_LENGTH}}$`).test(uid)) return null;

  const path = rest.join('/');
  if (!STREAM_EQUIVALENT_PATHS.includes(path as (typeof STREAM_EQUIVALENT_PATHS)[number])) {
    return null;
  }
  return { code, uid };
}

/**
 * Lee lo que el entrenador ha puesto en el campo. Null cuando no es ninguna de las dos
 * formas válidas (y también cuando está vacío: «sin vídeo» no es un vídeo).
 *
 * `url` es SIEMPRE la forma canónica, así que aplicar esto dos veces da lo mismo que
 * aplicarlo una: lo que se guarda y lo que se vuelve a leer son el mismo texto.
 */
export function parseExerciseVideo(input: string): ExerciseVideo | null {
  const raw = input.trim();
  if (!raw) return null;

  const link = parseYouTubeLink(raw);
  if (link) return { kind: 'youtube', link, url: youtubeCanonicalUrl(link) };

  const ref = exerciseStreamRefFrom(raw);
  if (ref) {
    return { kind: 'stream', ...ref, url: exerciseStreamHlsUrl(ref.code, ref.uid) };
  }

  return null;
}

/** Si lo escrito es un vídeo que sabemos servir. El vacío NO lo es (es «sin vídeo»,
 *  que quien llama trata aparte). */
export function isValidExerciseVideo(input: string): boolean {
  return parseExerciseVideo(input) !== null;
}

/**
 * LA validación del campo `video_url`, y la única. La aplican
 * `createExerciseSchema`, `updateExerciseSchema` y el campo del panel: vacío → null
 * (sin vídeo / hereda de la base), YouTube → canónico, vídeo propio → su manifiesto
 * HLS, y cualquier otra cosa → rechazo honesto que nombra las dos que valen.
 */
export const exerciseVideoSchema = z
  .string()
  .max(EXERCISE_VIDEO_URL_MAX)
  .refine((v) => v.trim() === '' || isValidExerciseVideo(v), {
    message: EXERCISE_VIDEO_REJECTION,
  })
  .transform((v) => parseExerciseVideo(v)?.url ?? null);
