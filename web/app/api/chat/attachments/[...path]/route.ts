// GET /api/chat/attachments/[...path]
//
// A3: authenticated proxy for chat attachments. Attachments are stored in
// Vercel Blob with `access: 'private'`, so the raw blob URL is never directly
// fetchable. Clients (coach dashboard + iOS) request this endpoint with the
// opaque pathname; we verify the requester belongs to the attachment's thread
// (athlete: their own thread; coach: an athlete in their cohort) and then
// redirect to a short-lived signed download URL.
//
// The owning athlete_id is encoded in the pathname layout
// (chat/<athlete_id>/<yyyy>/<mm>/<file>), so ownership is checked against that
// id — never against anything the caller supplies separately.
//
// Local-fs dev fallback: when there's no BLOB_READ_WRITE_TOKEN we stream the
// file straight from disk (same ownership gate first).

import { NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { jsonError } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { resolveChatPrincipal } from '@/lib/chat/auth';
import { athleteIdFromPathname } from '@/lib/chat/upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

// Signed URL lifetime — short enough that a leaked link expires fast, long
// enough for a client to follow the redirect and download.
const SIGNED_URL_TTL_SECONDS = 60 * 5; // 5 minutes

async function principalOwnsAthlete(
  principal: NonNullable<Awaited<ReturnType<typeof resolveChatPrincipal>>>,
  athleteId: bigint,
): Promise<boolean> {
  if (principal.role === 'athlete') {
    return principal.athlete_id === athleteId;
  }
  // Coach: the athlete must belong to their cohort.
  const rows = await sql<{ n: number }[]>`
    select count(*)::int as n from athletes
    where id = ${athleteId as unknown as number}
      and coach_id = ${principal.coach_id as unknown as number}
  `;
  return (rows[0]?.n ?? 0) > 0;
}

export async function GET(req: Request, ctx: Ctx): Promise<NextResponse | Response> {
  const principal = await resolveChatPrincipal(req);
  if (!principal) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
  }

  const { path } = await ctx.params;
  // The catch-all segments are individually URL-encoded by attachmentProxyUrl.
  const pathname = path.map((s) => decodeURIComponent(s)).join('/');

  const owningAthleteId = athleteIdFromPathname(pathname);
  if (owningAthleteId == null) {
    return jsonError('not_found', 'Attachment not found', 404);
  }

  // Ownership gate. Use 404 (not 403) so we don't disclose existence of other
  // athletes' attachments.
  const owns = await principalOwnsAthlete(principal, owningAthleteId);
  if (!owns) {
    return jsonError('not_found', 'Attachment not found', 404);
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (blobToken) {
    try {
      const dynImport = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>;
      const mod = (await dynImport('@vercel/blob').catch(() => null)) as
        | {
            head?: (
              pathname: string,
              opts: { token: string },
            ) => Promise<{ url: string; downloadUrl?: string }>;
            getDownloadUrl?: (
              urlOrPathname: string,
              opts: { token: string; expiresIn?: number },
            ) => Promise<string> | string;
          }
        | null;

      if (mod) {
        // Prefer an explicit short-lived signed download URL when available.
        if (typeof mod.getDownloadUrl === 'function') {
          const signed = await mod.getDownloadUrl(pathname, {
            token: blobToken,
            expiresIn: SIGNED_URL_TTL_SECONDS,
          });
          return NextResponse.redirect(signed, 302);
        }
        // Fallback: resolve the (private) blob URL via head and redirect. The
        // head() result for a private blob already carries a signed token.
        if (typeof mod.head === 'function') {
          const meta = await mod.head(pathname, { token: blobToken });
          const target = meta.downloadUrl ?? meta.url;
          if (target) return NextResponse.redirect(target, 302);
        }
      }
    } catch {
      // Fall through to local-fs (dev) / 404.
    }
  }

  // Local-fs dev fallback: stream the file from disk.
  try {
    const root = process.env.UPLOADS_DIR ?? '/tmp/fahybrik-uploads';
    const fullPath = join(root, pathname);
    // Defensive: ensure the resolved path stays under root.
    if (!fullPath.startsWith(root)) {
      return jsonError('not_found', 'Attachment not found', 404);
    }
    const info = await stat(fullPath);
    if (!info.isFile()) {
      return jsonError('not_found', 'Attachment not found', 404);
    }
    const nodeStream = createReadStream(fullPath);
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
    return new Response(webStream, {
      status: 200,
      headers: {
        'content-length': String(info.size),
        'cache-control': 'private, no-store',
      },
    });
  } catch {
    return jsonError('not_found', 'Attachment not found', 404);
  }
}
