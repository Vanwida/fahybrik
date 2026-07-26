// Dónde se guardan los adjuntos del chat.
//
// Producción: Vercel Blob. Desarrollo sin token: disco local en
// /tmp/fahybrik-uploads.
//
// Cada fichero vive en  chat/<athlete_id>/<yyyy>/<mm>/<uuid>.<ext>
//
// Los blobs se suben con `access: 'private'`, así que su URL cruda NO se puede
// pedir desde fuera y nunca se le entrega a nadie. Lo que se guarda en el mensaje
// es una URL a nuestro propio proxy autenticado
// (`/api/chat/attachments/<pathname>`), que comprueba que quien mira pertenece al
// hilo antes de servir un solo byte.
//
// EL IMPORT ES ESTÁTICO, Y NO ES UN DETALLE
// -----------------------------------------
// Antes `@vercel/blob` se cargaba con `new Function('m', 'return import(m)')`
// para que el empaquetador no lo metiera en el grafo. El empaquetador le hizo
// caso: en el bundle desplegado el paquete NO viajaba, el import reventaba en
// tiempo de ejecución y un `catch` mudo mandaba el fichero al disco temporal de
// la función. Ese disco muere con la petición.
//
// El resultado era el peor posible: la subida contestaba 201, el mensaje se
// guardaba con una URL de aspecto correcto, y el fichero no existía en ninguna
// parte. Verificado el 26-jul contra el almacén de producción: CERO ficheros,
// con mensajes en la base apuntando a seis. En local nunca se veía porque ahí sí
// están los `node_modules`.
//
// `@vercel/blob` es una dependencia declarada en package.json. Se importa como
// tal, y si falla, falla a la vista.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { put } from '@vercel/blob';
import {
  CHAT_ATTACHMENT_EXTENSIONS,
  CHAT_ATTACHMENT_MAX_BYTES,
  fileExtension,
  type ChatAttachmentKind,
} from './schema';

// Las listas de extensiones y los topes viven en `./schema` (módulo sin Node) para
// que la caja de texto del navegador valide con las MISMAS reglas y avise antes de
// subir, en vez de comerse un 400 sin explicación.
export { CHAT_ATTACHMENT_MAX_BYTES as MAX_BYTES_BY_KIND };

export type UploadResult = {
  url: string;
  size_bytes: number;
  mime_type: string;
  kind: string;
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

export async function storeAttachment(args: {
  athlete_id: bigint;
  kind: string;
  filename: string;
  mime_type: string;
  bytes: Buffer;
}): Promise<UploadResult> {
  const { athlete_id, kind, filename, mime_type, bytes } = args;
  const allowed = CHAT_ATTACHMENT_EXTENSIONS[kind as ChatAttachmentKind];
  if (!allowed) {
    throw new UploadError('invalid_kind', `Unknown attachment kind: ${kind}`);
  }
  const ext = inferExtension(filename, mime_type);
  if (!allowed.includes(ext)) {
    throw new UploadError(
      'invalid_extension',
      `Extension .${ext} not allowed for ${kind} (allowed: ${allowed.join(', ')})`,
    );
  }
  const max = CHAT_ATTACHMENT_MAX_BYTES[kind as ChatAttachmentKind] ?? 25 * 1024 * 1024;
  if (bytes.length > max) {
    throw new UploadError('too_large', `File exceeds ${kind} limit of ${max} bytes`, 413);
  }

  const id = randomUUID();
  const now = new Date();
  const path = `chat/${athlete_id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${ext}`;

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (blobToken) {
    // Sin red de seguridad a propósito. Si la subida falla, que falle: quien
    // escribe ve "no se pudo subir" y lo vuelve a intentar. Tragarse el error y
    // escribir en el disco de la función es lo que hizo que durante semanas los
    // adjuntos se "enviaran" y no existieran.
    let stored: { pathname: string };
    try {
      stored = await put(path, bytes, {
        access: 'private',
        contentType: mime_type,
        token: blobToken,
        // Ya va con uuid: sin esto Vercel añade su propio sufijo y el pathname
        // guardado dejaría de coincidir con el que pide el proxy.
        addRandomSuffix: false,
      });
    } catch (err) {
      throw new UploadError(
        'storage_unavailable',
        `No se pudo guardar el archivo: ${err instanceof Error ? err.message : 'error de almacenamiento'}`,
        502,
      );
    }
    return {
      url: attachmentProxyUrl(stored.pathname),
      size_bytes: bytes.length,
      mime_type,
      kind,
    };
  }

  // Solo desarrollo: sin token no hay almacén, así que se escribe en disco.
  const root = process.env.UPLOADS_DIR ?? '/tmp/fahybrik-uploads';
  const dir = join(root, `chat/${athlete_id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}.${ext}`), bytes);
  return { url: attachmentProxyUrl(path), size_bytes: bytes.length, mime_type, kind };
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
function attachmentBaseUrl(): string {
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
