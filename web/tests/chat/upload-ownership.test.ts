// K4 — POST /api/chat/upload-url must verify that a coach owns the target
// athlete before presigning into chat/<athlete_id>/…, and must ignore any
// athlete_id an athlete principal supplies (forcing their own id).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatPrincipal } from '@/lib/chat/auth';

let principal: ChatPrincipal | null = null;
let ownsRows: Array<{ n: number }> = [];
const createTarget = vi.fn(async () => ({
  upload_url: 'https://blob.test/put?signed=1',
  attachment_url: 'https://app.test/api/chat/attachments/chat/x.bin',
  content_type: 'application/octet-stream',
  expires_at: '2026-01-01T00:00:00.000Z',
}));
let lastTargetArgs: { athlete_id: bigint } | null = null;

vi.mock('@/lib/chat/auth', () => ({
  resolveChatPrincipal: async () => principal,
}));

vi.mock('@/lib/db', () => ({
  // The route only runs a single SELECT count(*) for the ownership check.
  sql: () => Promise.resolve(ownsRows),
}));

vi.mock('@/lib/chat/upload', () => ({
  createAttachmentUploadTarget: (args: { athlete_id: bigint }) => {
    lastTargetArgs = args;
    return createTarget();
  },
  UploadError: class UploadError extends Error {},
}));

const { POST } = await import('@/app/api/chat/upload-url/route');

function uploadUrlRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/chat/upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'file',
      filename: 'a.bin',
      mime_type: 'application/octet-stream',
      size_bytes: 3,
      ...body,
    }),
  });
}

describe('POST /api/chat/upload-url — ownership (K4)', () => {
  beforeEach(() => {
    principal = null;
    ownsRows = [];
    lastTargetArgs = null;
    createTarget.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it('rejects (404) when a coach targets an athlete outside their cohort', async () => {
    principal = { role: 'coach', user_id: BigInt(1), coach_id: BigInt(10) };
    ownsRows = [{ n: 0 }]; // ownership query returns no match

    const res = await POST(uploadUrlRequest({ athlete_id: '999' }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
    expect(createTarget).not.toHaveBeenCalled();
  });

  it('allows a coach to presign for an athlete they own', async () => {
    principal = { role: 'coach', user_id: BigInt(1), coach_id: BigInt(10) };
    ownsRows = [{ n: 1 }]; // ownership confirmed

    const res = await POST(uploadUrlRequest({ athlete_id: '42' }));
    expect(res.status).toBe(201);
    expect(createTarget).toHaveBeenCalledTimes(1);
    expect(lastTargetArgs?.athlete_id).toBe(BigInt(42));
  });

  it('rejects (400) a coach request without athlete_id', async () => {
    principal = { role: 'coach', user_id: BigInt(1), coach_id: BigInt(10) };

    const res = await POST(uploadUrlRequest({ athlete_id: undefined }));
    expect(res.status).toBe(400);
    expect(createTarget).not.toHaveBeenCalled();
  });

  it("ignores a spoofed athlete_id from an athlete principal (forces their own id)", async () => {
    principal = { role: 'athlete', user_id: BigInt(2), athlete_id: BigInt(7) };

    const res = await POST(uploadUrlRequest({ athlete_id: '999' }));
    expect(res.status).toBe(201);
    // The blob folder uses the bearer athlete_id, never the body value.
    expect(lastTargetArgs?.athlete_id).toBe(BigInt(7));
  });

  it('rejects (401) when there is no principal', async () => {
    principal = null;
    const res = await POST(uploadUrlRequest({ athlete_id: '42' }));
    expect(res.status).toBe(401);
  });

  it('rejects (400) a malformed body before touching auth-derived state', async () => {
    principal = { role: 'athlete', user_id: BigInt(2), athlete_id: BigInt(7) };
    const res = await POST(
      new Request('http://localhost/api/chat/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'file' }), // filename + size_bytes missing
      }),
    );
    expect(res.status).toBe(400);
    expect(createTarget).not.toHaveBeenCalled();
  });
});
