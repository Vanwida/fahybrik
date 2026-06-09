// K4 — POST /api/chat/upload must verify that a coach owns the target athlete
// before writing into chat/<athlete_id>/…, and must ignore any athlete_id an
// athlete principal supplies (forcing their own id).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatPrincipal } from '@/lib/chat/auth';

let principal: ChatPrincipal | null = null;
let ownsRows: Array<{ n: number }> = [];
const storeAttachment = vi.fn(async () => ({
  url: 'https://blob.test/chat/x.bin',
  mime_type: 'application/octet-stream',
  size_bytes: 3,
  kind: 'file',
}));
let lastStoreArgs: { athlete_id: bigint } | null = null;

vi.mock('@/lib/chat/auth', () => ({
  resolveChatPrincipal: async () => principal,
}));

vi.mock('@/lib/db', () => ({
  // The route only runs a single SELECT count(*) for the ownership check.
  sql: () => Promise.resolve(ownsRows),
}));

vi.mock('@/lib/chat/upload', () => ({
  storeAttachment: (args: { athlete_id: bigint }) => {
    lastStoreArgs = args;
    return storeAttachment();
  },
  UploadError: class UploadError extends Error {},
  // The route derives its early Content-Length ceiling (M14) from this map at
  // module load, so the mock must export it too.
  MAX_BYTES_BY_KIND: {
    voice: 25 * 1024 * 1024,
    video: 200 * 1024 * 1024,
    image: 30 * 1024 * 1024,
    file: 25 * 1024 * 1024,
  },
}));

const { POST } = await import('@/app/api/chat/upload/route');

function uploadRequest(fields: Record<string, string>): Request {
  const form = new FormData();
  form.set('file', new File([new Uint8Array([1, 2, 3])], 'a.bin', { type: 'application/octet-stream' }));
  form.set('kind', 'file');
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request('http://localhost/api/chat/upload', { method: 'POST', body: form });
}

describe('POST /api/chat/upload — ownership (K4)', () => {
  beforeEach(() => {
    principal = null;
    ownsRows = [];
    lastStoreArgs = null;
    storeAttachment.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it('rejects (404) when a coach targets an athlete outside their cohort', async () => {
    principal = { role: 'coach', user_id: BigInt(1), coach_id: BigInt(10) };
    ownsRows = [{ n: 0 }]; // ownership query returns no match

    const res = await POST(uploadRequest({ athlete_id: '999' }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
    expect(storeAttachment).not.toHaveBeenCalled();
  });

  it('allows a coach upload to an athlete they own', async () => {
    principal = { role: 'coach', user_id: BigInt(1), coach_id: BigInt(10) };
    ownsRows = [{ n: 1 }]; // ownership confirmed

    const res = await POST(uploadRequest({ athlete_id: '42' }));
    expect(res.status).toBe(201);
    expect(storeAttachment).toHaveBeenCalledTimes(1);
    expect(lastStoreArgs?.athlete_id).toBe(BigInt(42));
  });

  it("ignores a spoofed athlete_id from an athlete principal (forces their own id)", async () => {
    principal = { role: 'athlete', user_id: BigInt(2), athlete_id: BigInt(7) };

    const res = await POST(uploadRequest({ athlete_id: '999' }));
    expect(res.status).toBe(201);
    // The blob folder uses the bearer athlete_id, never the form value.
    expect(lastStoreArgs?.athlete_id).toBe(BigInt(7));
  });

  it('rejects (401) when there is no principal', async () => {
    principal = null;
    const res = await POST(uploadRequest({ athlete_id: '42' }));
    expect(res.status).toBe(401);
  });

  it('rejects (413) early when Content-Length exceeds the ceiling (M14)', async () => {
    principal = { role: 'coach', user_id: BigInt(1), coach_id: BigInt(10) };
    ownsRows = [{ n: 1 }];

    const req = uploadRequest({ athlete_id: '42' });
    // Force an absurd Content-Length; the route must reject before reading body.
    const oversized = new Request(req.url, {
      method: 'POST',
      headers: { 'content-length': String(500 * 1024 * 1024) },
      body: req.body,
      // @ts-expect-error duplex required by undici when a body stream is set
      duplex: 'half',
    });
    const res = await POST(oversized);
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('payload_too_large');
    expect(storeAttachment).not.toHaveBeenCalled();
  });
});
