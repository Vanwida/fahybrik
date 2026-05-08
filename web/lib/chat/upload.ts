// Chat attachment storage abstraction.
//
// Production: Vercel Blob (FAHYBRIK_BLOB_READ_WRITE_TOKEN env). When the env
// is absent, we fall back to local-fs at /tmp/fahybrik-uploads in dev. R2
// adapter is a TODO when we move off Vercel hosting.
//
// Layout: every blob lives under
//   chat/<athlete_id>/<yyyy>/<mm>/<uuid>.<ext>
// so the read URL never exposes other athletes' uploads through path
// guessing.

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
              opts: { access: 'public'; contentType: string; token: string },
            ) => Promise<{ url: string }>;
          }
        | null;
      if (mod && typeof mod.put === 'function') {
        const res = await mod.put(path, bytes, {
          access: 'public',
          contentType: mime_type,
          token: blobToken,
        });
        return { url: res.url, size_bytes: bytes.length, mime_type, kind };
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
  // Local URL — only useful in dev. Production ALWAYS uses Vercel Blob.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return {
    url: `${baseUrl}/api/chat/uploads/${encodeURIComponent(path)}`,
    size_bytes: bytes.length,
    mime_type,
    kind,
  };
}
