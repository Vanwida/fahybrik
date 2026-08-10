import 'server-only';

// LA NOTA DE VOZ DE UN COMUNICADO — dónde vive y quién puede oírla.
//
// Es el calco del «ahora te hago un podcast» que el coach de Pablo le manda por
// WhatsApp: la explicación hablada sobre la gráfica es la mitad del valor del
// feedback, y hoy se pierde en un hilo que nadie vuelve a abrir.
//
// POR QUÉ NO REUSA LA CARPETA DEL CHAT
// ------------------------------------
// Los adjuntos del chat viven en `chat/<athlete_id>/…` y su proxy autoriza por
// esa carpeta: quien mira tiene que ser ESE atleta o su coach. Un comunicado se
// publica a VARIOS, así que un audio guardado en la carpeta de uno le daría 404
// a los demás — y desde la biblioteca, donde todavía no hay destinatario, no
// habría ni carpeta a la que subirlo.
//
// Aquí el dueño es el COACH, que es quien lo graba: `comunicados/<coach_id>/…`.
// La autorización de lectura no mira la carpeta sino el DESTINO: se sirve al
// coach dueño, y a cualquier atleta que sea destinatario de un comunicado
// publicado que apunte a ese audio. Así el mismo fichero lo oyen los ocho
// atletas de un protocolo sin duplicar un byte, y deja de oírse en cuanto el
// comunicado se retira.
//
// TODO LO DEMÁS SE HEREDA DEL CHAT, a propósito: las mismas extensiones (las que
// reproducen los dos lados — WebM/Opus queda fuera porque iOS no lo decodifica),
// el mismo tope de 25 MB y el mismo baile de prefirmar y servir los bytes sin
// redirigir. Un audio no es un adjunto distinto por estar en otra pantalla.

import { randomUUID } from 'node:crypto';
import { issueSignedToken, presignUrl } from '@vercel/blob';
import {
  CHAT_ATTACHMENT_EXTENSIONS,
  CHAT_ATTACHMENT_MAX_BYTES,
  fileExtension,
} from '@/lib/chat/schema';
// El origen absoluto de la app, ya normalizado (con esquema y sin barra final).
// Se importa en vez de repetirse: es una función delicada —un `NEXT_PUBLIC_APP_URL`
// sin `https://` invalidaba TODOS los adjuntos— y dos copias acabarían divergiendo.
import { attachmentBaseUrl } from '@/lib/chat/upload';

/** Cuánto vive la URL de subida. Generoso para una nota de voz larga saliendo
 *  por una conexión mala; sigue siendo un enlace que muere solo. */
const UPLOAD_URL_TTL_MS = 30 * 60 * 1000;

/** El audio de un comunicado es voz: mismas extensiones y mismo tope que una
 *  nota de voz del chat. */
const AUDIO_EXTENSIONS = CHAT_ATTACHMENT_EXTENSIONS.voice;
export const COMMUNICATION_AUDIO_MAX_BYTES = CHAT_ATTACHMENT_MAX_BYTES.voice;

/** El prefijo del proxy autenticado. Lo que se guarda en `audio_url` empieza
 *  siempre por aquí: la URL cruda del blob es privada y no se le da a nadie. */
export const COMMUNICATION_AUDIO_PROXY_PREFIX = '/api/communications/audio/';

/** La carpeta raíz dentro del almacén. */
const AUDIO_ROOT = 'comunicados';

export class CommunicationAudioError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'CommunicationAudioError';
  }
}

export interface CommunicationAudioUploadTarget {
  /** URL prefirmada contra la que el cliente hace `PUT <bytes>`. */
  upload_url: string;
  /** La que se guarda en el comunicado y viaja a iOS. */
  audio_url: string;
  /** Content-Type EXACTO que el PUT debe declarar: es el que quedó firmado. */
  content_type: string;
  expires_at: string;
}

/** La URL pública (autenticada) de un pathname del almacén. Cada tramo se
 *  codifica por separado para que la ruta comodín pueda deshacerlo. */
export function audioProxyUrl(pathname: string): string {
  const encoded = pathname.split('/').map(encodeURIComponent).join('/');
  return `${attachmentBaseUrl()}${COMMUNICATION_AUDIO_PROXY_PREFIX}${encoded}`;
}

/**
 * El pathname que hay detrás de una `audio_url`, o null si esa URL no es NUESTRA.
 *
 * Es la comprobación que impide que el cliente guarde en un comunicado un enlace
 * a cualquier sitio de internet: sin ella, el coach (o quien le robara la sesión)
 * podría hacer que la app del atleta pidiera bytes a un dominio ajeno.
 */
export function audioPathnameFromUrl(url: string): string | null {
  const base = `${attachmentBaseUrl()}${COMMUNICATION_AUDIO_PROXY_PREFIX}`;
  if (!url.startsWith(base)) return null;
  const encoded = url.slice(base.length);
  if (encoded.length === 0) return null;
  let pathname: string;
  try {
    pathname = encoded.split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
  return coachIdFromAudioPathname(pathname) == null ? null : pathname;
}

/**
 * De quién es la carpeta de un audio. Null cuando el pathname no tiene la forma
 * esperada — nunca se confía en una ruta que llega de fuera.
 */
export function coachIdFromAudioPathname(pathname: string): bigint | null {
  // ['comunicados', '<coach_id>', '<yyyy>', '<mm>', '<fichero>']
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length !== 5) return null;
  if (segments[0] !== AUDIO_ROOT) return null;
  const coachSeg = segments[1];
  if (!coachSeg || !/^\d+$/.test(coachSeg)) return null;
  const fichero = segments[4]!;
  if (!AUDIO_EXTENSIONS.includes(fileExtension(fichero))) return null;
  try {
    return BigInt(coachSeg);
  } catch {
    return null;
  }
}

/**
 * Valida la subida que el coach ANUNCIA y devuelve el destino prefirmado. Los
 * bytes no pasan por nuestra API: la plataforma corta el cuerpo de una función
 * en ~4,5 MB, así que una nota de voz de diez minutos no cabría.
 */
export async function createCommunicationAudioUploadTarget(args: {
  coach_id: bigint | number;
  filename: string;
  mime_type: string;
  size_bytes: number;
}): Promise<CommunicationAudioUploadTarget> {
  const mime_type = args.mime_type.includes('/') ? args.mime_type : 'audio/wav';
  const ext = fileExtension(args.filename) || mime_type.split('/')[1]!.toLowerCase();
  if (!AUDIO_EXTENSIONS.includes(ext)) {
    throw new CommunicationAudioError(
      'invalid_extension',
      `Ese formato de audio no se puede reproducir en el móvil del atleta. Admitidos: ${AUDIO_EXTENSIONS.join(', ')}.`,
    );
  }
  if (args.size_bytes > COMMUNICATION_AUDIO_MAX_BYTES) {
    throw new CommunicationAudioError(
      'too_large',
      `El audio no puede pasar de ${Math.round(COMMUNICATION_AUDIO_MAX_BYTES / (1024 * 1024))} MB.`,
      413,
    );
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    // Sin almacén no hay audio, ni en desarrollo: un fallback a disco es lo que
    // enmascaró durante semanas que en producción no se guardaba nada.
    throw new CommunicationAudioError('storage_unavailable', 'El almacén no está configurado', 503);
  }

  const now = new Date();
  const pathname = `${AUDIO_ROOT}/${args.coach_id}/${now.getUTCFullYear()}/${String(
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
      maximumSizeInBytes: COMMUNICATION_AUDIO_MAX_BYTES,
    });
    const { presignedUrl } = await presignUrl(signed, {
      operation: 'put',
      pathname,
      access: 'private',
      validUntil,
      allowedContentTypes: [mime_type],
      maximumSizeInBytes: COMMUNICATION_AUDIO_MAX_BYTES,
      // Ya lleva uuid: un sufijo del almacén rompería la correspondencia entre
      // el pathname guardado y el que pide el proxy.
      addRandomSuffix: false,
    });
    return {
      upload_url: presignedUrl,
      audio_url: audioProxyUrl(pathname),
      content_type: mime_type,
      expires_at: new Date(validUntil).toISOString(),
    };
  } catch (err) {
    // Sin red de seguridad a propósito: si el almacén no firma, que se vea.
    throw new CommunicationAudioError(
      'storage_unavailable',
      `No se pudo preparar la subida: ${err instanceof Error ? err.message : 'error de almacenamiento'}`,
      502,
    );
  }
}
