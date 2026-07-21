// Chat attachment storage abstraction.
//
// Production: Vercel Blob (BLOB_READ_WRITE_TOKEN env). When the env is absent,
// we fall back to local-fs at /tmp/fahybrik-uploads in dev. R2 adapter is a
// TODO when we move off Vercel hosting.
//
// Layout: every blob lives under
//   chat/<athlete_id>/<yyyy>/<mm>/<uuid>.<ext>
//
// A3 (security): blobs are uploaded with `access: 'private'`, so the raw blob
// URL is NOT publicly fetchable. We never hand the blob URL to clients.
// Instead `storeAttachment` returns a URL pointing at our own authenticated
// proxy endpoint (`/api/chat/attachments/<pathname>`), which verifies the
// requester belongs to the thread and then redirects to a short-lived signed
// download URL. The stored `attachment_url` therefore stays opaque + access
// is always gated by thread membership.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const ALLOWED_KIND_TO_EXT: Record<string, string[]> = {
  voice: ['m4a', 'aac', 'mp3', 'wav'],
  video: ['mp4', 'mov', 'm4v'],
  image: ['jpg', 'jpeg', 'png', 'heic', 'webp'],
  file: ['pdf', 'txt', 'md', 'docx'],
};

export const MAX_BYTES_BY_KIND: Record<string, number> = {
  voice: 25 * 1024 * 1024,    // 25MB voice notes
  video: 200 * 1024 * 1024,   // 200MB video
  image: 30 * 1024 * 1024,
  file: 25 * 1024 * 1024,
};

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
  const dot = filename.lastIndexOf('.');
  if (dot >= 0) return filename.slice(dot + 1).toLowerCase();
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
  const allowed = ALLOWED_KIND_TO_EXT[kind];
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
  const max = MAX_BYTES_BY_KIND[kind] ?? 25 * 1024 * 1024;
  if (bytes.length > max) {
    throw new UploadError('too_large', `File exceeds ${kind} limit of ${max} bytes`, 413);
  }

  const id = randomUUID();
  const now = new Date();
  const path = `chat/${athlete_id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${ext}`;

  // Vercel Blob path (preferred). Detected at runtime so missing token
  // doesn't break the build. Resolved via Function constructor so bundlers
  // don't try to bake the optional package into the build graph.
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (blobToken) {
    try {
      const dynImport = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>;
      const mod = (await dynImport('@vercel/blob').catch(() => null)) as
        | {
            put?: (
              path: string,
              data: Buffer,
              // A3: 'private' so the blob URL is never directly fetchable.
              opts: { access: 'private'; contentType: string; token: string; addRandomSuffix?: boolean },
            ) => Promise<{ pathname: string }>;
          }
        | null;
      if (mod && typeof mod.put === 'function') {
        const res = await mod.put(path, bytes, {
          access: 'private',
          contentType: mime_type,
          token: blobToken,
          // We already namespace by uuid; don't append Vercel's random suffix
          // so the stored pathname matches what the proxy endpoint expects.
          addRandomSuffix: false,
        });
        // Never return the raw blob URL — return our authenticated proxy URL.
        return {
          url: attachmentProxyUrl(res.pathname),
          size_bytes: bytes.length,
          mime_type,
          kind,
        };
      }
    } catch {
      // Fall through to local fs.
    }
  }

  // Local fs fallback (dev only).
  const root = process.env.UPLOADS_DIR ?? '/tmp/fahybrik-uploads';
  const dir = join(root, `chat/${athlete_id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`);
  await mkdir(dir, { recursive: true });
  const fullPath = join(dir, `${id}.${ext}`);
  await writeFile(fullPath, bytes);
  // Local URL — only useful in dev. Routed through the same authenticated
  // proxy endpoint as prod so the access model is identical everywhere.
  return {
    url: attachmentProxyUrl(path),
    size_bytes: bytes.length,
    mime_type,
    kind,
  };
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
