// Cómo se suben los adjuntos del chat: DIRECTO del cliente a Vercel Blob.
//
// El servidor NO toca los bytes. Valida la intención (tipo, extensión, tamaño,
// propiedad de la carpeta) y prefirma una URL de subida atada a UN pathname
// concreto, con tope de bytes, content-type fijado y caducidad corta. El cliente
// (dashboard o iOS) hace un PUT plano de los bytes contra esa URL.
//
// POR QUÉ NO PUEDEN PASAR LOS BYTES POR NUESTRA API
// -------------------------------------------------
// La plataforma corta el body de cualquier función en ~4.5 MB con
// FUNCTION_PAYLOAD_TOO_LARGE ANTES de que se ejecute una línea nuestra
// (verificado el 27-jul contra producción: 2 MB entra, 6 MB no). La versión
// anterior recibía el fichero por multipart y lo re-subía al almacén: prometía
// fotos de 30 MB y vídeos de 200 MB por una tubería que admite 4.5. Una foto
// detallada del iPhone ya no cabía.
//
// Cada fichero vive en  chat/<athlete_id>/<yyyy>/<mm>/<uuid>.<ext>
//
// Los blobs siguen siendo `access: 'private'`: su URL cruda no se puede pedir
// desde fuera y nunca se le entrega a nadie. Lo que se guarda en el mensaje es
// una URL a nuestro proxy autenticado (`/api/chat/attachments/<pathname>`), que
// comprueba que quien mira pertenece al hilo antes de servir un solo byte. La
// URL prefirmada de subida solo permite `put` sobre ese pathname y muere sola.

import { randomUUID } from 'node:crypto';
import { issueSignedToken, presignUrl } from '@vercel/blob';
import {
  CHAT_ATTACHMENT_EXTENSIONS,
  CHAT_ATTACHMENT_MAX_BYTES,
  fileExtension,
  type ChatAttachmentKind,
} from './schema';

// Las listas de extensiones y los topes viven en `./schema` (módulo sin Node) para
// que la caja de texto del navegador valide con las MISMAS reglas y avise antes de
// subir, en vez de comerse un 400 sin explicación.

/** Cuánto vive la URL de subida. Lo dimensiona el peor caso legítimo: un vídeo
 *  de 200 MB saliendo por datos móviles lentos. */
const UPLOAD_URL_TTL_MS = 30 * 60 * 1000;

export type AttachmentUploadTarget = {
  /** URL prefirmada contra la que el cliente hace `PUT <bytes>`. */
  upload_url: string;
  /** URL del proxy autenticado que el mensaje referencia (la de siempre). */
  attachment_url: string;
  /** Content-Type EXACTO que el PUT debe declarar — es el que quedó firmado. */
  content_type: string;
  expires_at: string;
};

export class UploadError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function inferExtension(filename: string, mime: string): string {
  const ext = fileExtension(filename);
  if (ext) return ext;
  if (mime.includes('/')) return mime.split('/')[1]!.toLowerCase();
  return 'bin';
}

/**
 * Valida la subida que el cliente ANUNCIA y devuelve el destino prefirmado.
 * El tope de bytes queda firmado dentro de la URL: declarar un tamaño pequeño
 * y subir uno grande no cuela — lo rechaza el almacén, no nosotros.
 */
export async function createAttachmentUploadTarget(args: {
  athlete_id: bigint;
  kind: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}): Promise<AttachmentUploadTarget> {
  const { athlete_id, kind, filename, size_bytes } = args;
  const allowed = CHAT_ATTACHMENT_EXTENSIONS[kind as ChatAttachmentKind];
  if (!allowed) {
    throw new UploadError('invalid_kind', `Unknown attachment kind: ${kind}`);
  }
  const mime_type = args.mime_type.includes('/') ? args.mime_type : 'application/octet-stream';
  const ext = inferExtension(filename, mime_type);
  if (!allowed.includes(ext)) {
    throw new UploadError(
      'invalid_extension',
      `Extension .${ext} not allowed for ${kind} (allowed: ${allowed.join(', ')})`,
    );
  }
  const max = CHAT_ATTACHMENT_MAX_BYTES[kind as ChatAttachmentKind];
  if (size_bytes > max) {
    throw new UploadError('too_large', `File exceeds ${kind} limit of ${max} bytes`, 413);
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    // Sin almacén no hay adjuntos, ni en desarrollo: el fallback a disco que
    // había aquí es lo que enmascaró durante semanas que en producción no se
    // guardaba nada.
    throw new UploadError('storage_unavailable', 'Blob storage is not configured', 503);
  }

  const id = randomUUID();
  const now = new Date();
  const pathname = `chat/${athlete_id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${ext}`;
  const validUntil = now.getTime() + UPLOAD_URL_TTL_MS;

  try {
    const signed = await issueSignedToken({
      token: blobToken,
      pathname,
      operations: ['put'],
      validUntil,
      allowedContentTypes: [mime_type],
      maximumSizeInBytes: max,
    });
    const { presignedUrl } = await presignUrl(signed, {
      operation: 'put',
      pathname,
      access: 'private',
      validUntil,
      allowedContentTypes: [mime_type],
      maximumSizeInBytes: max,
      // Ya va con uuid: un sufijo del almacén rompería la coincidencia entre el
      // pathname guardado y el que pide el proxy.
      addRandomSuffix: false,
    });
    return {
      upload_url: presignedUrl,
      attachment_url: attachmentProxyUrl(pathname),
      content_type: mime_type,
      expires_at: new Date(validUntil).toISOString(),
    };
  } catch (err) {
    // Sin red de seguridad a propósito: si el almacén no firma, que se vea.
    throw new UploadError(
      'storage_unavailable',
      `No se pudo preparar la subida: ${err instanceof Error ? err.message : 'error de almacenamiento'}`,
      502,
    );
  }
}

/** Path prefix of the authenticated attachment proxy endpoint. */
export const ATTACHMENT_PROXY_PREFIX = '/api/chat/attachments/';

/**
 * Build the absolute, authenticated proxy URL for a stored blob `pathname`
 * (e.g. `chat/42/2026/05/<uuid>.jpg`). The pathname segments are individually
 * encoded so the catch-all route can decode them back. We return an absolute
 * URL because `sendMessageSchema.attachment_url` requires `.url()`.
 */
export function attachmentProxyUrl(pathname: string): string {
  const encoded = pathname.split('/').map(encodeURIComponent).join('/');
  return `${attachmentBaseUrl()}${ATTACHMENT_PROXY_PREFIX}${encoded}`;
}

/**
 * The absolute origin the proxy URL is built on. `sendMessageSchema.attachment_url`
 * requires `.url()`, so this MUST be a scheme-qualified absolute origin — a
 * scheme-less env value (e.g. `NEXT_PUBLIC_APP_URL=app.fahybrid.com` without
 * `https://`) would otherwise yield an invalid `attachment_url` and make EVERY
 * attachment send fail validation (400). We normalise defensively: add `https://`
 * when the configured value has no scheme, and strip any trailing slash so the
 * prefix concatenation never doubles it. Dev falls back to localhost.
 */
export function attachmentBaseUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? '').trim();
  if (!configured) return 'http://localhost:3000';
  const withScheme = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  return withScheme.replace(/\/+$/, '');
}

/**
 * Extract the owning athlete_id from a blob pathname of the shape
 * `chat/<athlete_id>/<yyyy>/<mm>/<file>`. Returns null when the pathname
 * doesn't match the expected layout (defensive — never trust path input).
 */
export function athleteIdFromPathname(pathname: string): bigint | null {
  const segments = pathname.split('/').filter(Boolean);
  // ['chat', '<athlete_id>', '<yyyy>', '<mm>', '<file>']
  if (segments.length < 5) return null;
  if (segments[0] !== 'chat') return null;
  const athleteSeg = segments[1];
  if (!athleteSeg || !/^\d+$/.test(athleteSeg)) return null;
  try {
    return BigInt(athleteSeg);
  } catch {
    return null;
  }
}
