// A3 — the authenticated attachment proxy derives the owning athlete_id from
// the blob pathname. That parsing is the security boundary, so it gets its own
// tests: only well-formed `chat/<id>/<yyyy>/<mm>/<file>` pathnames yield an id.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ATTACHMENT_PROXY_PREFIX,
  athleteIdFromPathname,
  attachmentProxyUrl,
} from '@/lib/chat/upload';

describe('athleteIdFromPathname (A3 ownership boundary)', () => {
  it('extracts the athlete_id from a well-formed pathname', () => {
    expect(athleteIdFromPathname('chat/42/2026/05/abc.jpg')).toBe(BigInt(42));
  });

  it('returns null when the prefix is not chat/', () => {
    expect(athleteIdFromPathname('evil/42/2026/05/abc.jpg')).toBeNull();
  });

  it('returns null when the athlete segment is non-numeric', () => {
    expect(athleteIdFromPathname('chat/notanid/2026/05/abc.jpg')).toBeNull();
  });

  it('returns null when the path is too short to be a real attachment', () => {
    expect(athleteIdFromPathname('chat/42/abc.jpg')).toBeNull();
    expect(athleteIdFromPathname('chat/42')).toBeNull();
    expect(athleteIdFromPathname('')).toBeNull();
  });

  it('is robust to leading/trailing slashes', () => {
    expect(athleteIdFromPathname('/chat/7/2026/05/x.png')).toBe(BigInt(7));
  });
});

describe('attachmentProxyUrl', () => {
  const prev = process.env.NEXT_PUBLIC_APP_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.fahybrid.com';
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prev;
  });

  it('builds an absolute URL through the proxy prefix', () => {
    const url = attachmentProxyUrl('chat/42/2026/05/abc.jpg');
    expect(url).toBe(`https://app.fahybrid.com${ATTACHMENT_PROXY_PREFIX}chat/42/2026/05/abc.jpg`);
  });

  it('is a valid absolute URL (satisfies sendMessageSchema.url())', () => {
    const url = attachmentProxyUrl('chat/42/2026/05/abc.jpg');
    expect(() => new URL(url)).not.toThrow();
  });
});
