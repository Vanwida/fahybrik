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
//   • Subido  — una ruta RELATIVA nuestra, `/api/exercises/video/<pathname>`, donde
//     el pathname es el del fichero en el almacén privado.
// Un texto vacío es null (sin vídeo; en un ejercicio de la base, «hereda»).
//
// POR QUÉ RELATIVA Y NO ABSOLUTA: el localizador viaja en la base de datos y la
// misma fila se lee desde producción, desde una vista previa y desde el simulador.
// Una URL absoluta ataría el vídeo al dominio con el que se guardó.
//
// POR QUÉ ESTE MÓDULO Y NO `shared/youtube.ts`: aquel es sobre YouTube y sigue
// siéndolo (este lo importa). Este es sobre EL VÍDEO DE UN EJERCICIO, que ya no es
// lo mismo. Y vive en `web/lib` porque la lista de formatos y el tope de bytes ya
// tienen UNA casa —`lib/chat/schema.ts`, que es cliente-segura a propósito— y
// duplicarlos en `shared/` sería crear la segunda fuente que este módulo existe
// para evitar.
//
// ES ISOMÓRFICO: sin `node:*`, sin `server-only`. Lo aplica el servidor al guardar
// (createExercise / updateExercise) y el navegador antes de dejar guardar
// (VideoUrlField). Un solo criterio para los dos.

import { z } from 'zod';
import {
  parseYouTubeLink,
  youtubeCanonicalUrl,
  type YouTubeLink,
} from '@fahybrid/shared/youtube';
import { CHAT_ATTACHMENT_EXTENSIONS, CHAT_ATTACHMENT_MAX_BYTES } from '@/lib/chat/schema';

/** El prefijo del proxy autenticado de lectura. Todo localizador de fichero propio
 *  empieza por aquí: la URL cruda del blob es privada y no se le da a nadie. */
export const EXERCISE_VIDEO_PROXY_PREFIX = '/api/exercises/video/';

/** La carpeta raíz dentro del almacén. Hermana de `chat/`, `comunicados/` y
 *  `import-photos/`. */
export const EXERCISE_VIDEO_ROOT = 'ejercicios';

/**
 * Formatos aceptados. Son los MISMOS que un vídeo del chat, y no por comodidad: la
 * regla es «lo que reproducen los dos lados» (el navegador del coach y el iPhone del
 * atleta). WebM/Opus se queda fuera porque iOS no lo decodifica, y un vídeo que el
 * atleta no puede abrir no es un vídeo. Una sola lista, en lib/chat/schema.ts.
 */
export const EXERCISE_VIDEO_EXTENSIONS = CHAT_ATTACHMENT_EXTENSIONS.video;

/**
 * Tope de bytes. El MISMO criterio y la MISMA constante que un vídeo del chat: un
 * vídeo de técnica grabado con el móvil en 4K se come 200 MB sin despeinarse, y es
 * exactamente el mismo fichero tanto si el coach lo manda por el chat como si lo
 * cuelga del ejercicio. Nunca un número suelto aquí.
 */
export const EXERCISE_VIDEO_MAX_BYTES = CHAT_ATTACHMENT_MAX_BYTES.video;

/** Tope de caracteres de la columna, y del `maxLength` de la caja de texto. */
export const EXERCISE_VIDEO_URL_MAX = 500;

/**
 * El rechazo, en palabras del entrenador y NOMBRANDO las dos que sí valen. Lo
 * comparten el servidor (mensaje del 400) y el campo del panel, para que no haya dos
 * redacciones del mismo no.
 */
export const EXERCISE_VIDEO_REJECTION =
  'Eso no vale como vídeo. Pega un enlace de YouTube o sube un fichero desde aquí.';

/**
 * La forma EXACTA de un fichero propio: `ejercicios/<coach_id>/<yyyy>/<mm>/<uuid>.<ext>`.
 * Se construye a partir de las constantes de arriba para que la lista de formatos no
 * se repita. El uuid se exige con su forma completa porque lo generamos nosotros
 * (`randomUUID`, en video-upload.ts): validar contra lo que emitimos deja el
 * localizador cerrado a cualquier ruta que llegue de fuera.
 */
const UPLOADED_PATHNAME_RE = new RegExp(
  `^${EXERCISE_VIDEO_ROOT}/(\\d+)/\\d{4}/\\d{2}/` +
    `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}` +
    `\\.(?:${EXERCISE_VIDEO_EXTENSIONS.join('|')})$`,
);

/** El vídeo de un ejercicio, ya leído: qué forma tiene y su localizador canónico. */
export type ExerciseVideo =
  | { kind: 'youtube'; link: YouTubeLink; url: string }
  | { kind: 'subido'; pathname: string; url: string };

/** El localizador relativo de un fichero del almacén. Cada tramo se codifica por
 *  separado para que la ruta comodín pueda deshacerlo. */
export function exerciseVideoLocator(pathname: string): string {
  const encoded = pathname.split('/').map(encodeURIComponent).join('/');
  return `${EXERCISE_VIDEO_PROXY_PREFIX}${encoded}`;
}

/**
 * El pathname que hay detrás de un localizador nuestro, o null si no lo es.
 *
 * Es la comprobación que impide que el cliente guarde en un ejercicio un enlace a
 * cualquier sitio: sin ella, el coach (o quien le robara la sesión) podría hacer que
 * la app del atleta pidiera bytes a un dominio ajeno.
 */
export function exerciseVideoPathnameFrom(locator: string): string | null {
  const raw = locator.trim();
  if (!raw.startsWith(EXERCISE_VIDEO_PROXY_PREFIX)) return null;
  const encoded = raw.slice(EXERCISE_VIDEO_PROXY_PREFIX.length);
  if (encoded.length === 0) return null;
  let pathname: string;
  try {
    pathname = encoded.split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
  return UPLOADED_PATHNAME_RE.test(pathname) ? pathname : null;
}

/**
 * De quién es la carpeta de un vídeo subido. Null cuando el pathname no tiene la
 * forma esperada — nunca se confía en una ruta que llega de fuera. Es lo que usa el
 * proxy de lectura para decidir a quién se le sirven los bytes.
 */
export function coachIdFromExerciseVideoPathname(pathname: string): bigint | null {
  const match = UPLOADED_PATHNAME_RE.exec(pathname);
  const coachSeg = match?.[1];
  if (!coachSeg) return null;
  try {
    return BigInt(coachSeg);
  } catch {
    return null;
  }
}

/**
 * Lee lo que el coach ha puesto en el campo. Null cuando no es ninguna de las dos
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

  const pathname = exerciseVideoPathnameFrom(raw);
  if (pathname) return { kind: 'subido', pathname, url: exerciseVideoLocator(pathname) };

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
 * (sin vídeo / hereda de la base), YouTube → canónico, fichero nuestro → su
 * localizador, y cualquier otra cosa → rechazo honesto que nombra las dos que valen.
 */
export const exerciseVideoSchema = z
  .string()
  .max(EXERCISE_VIDEO_URL_MAX)
  .refine((v) => v.trim() === '' || isValidExerciseVideo(v), {
    message: EXERCISE_VIDEO_REJECTION,
  })
  .transform((v) => parseExerciseVideo(v)?.url ?? null);
