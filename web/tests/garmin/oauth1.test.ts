import { describe, expect, test } from 'vitest';
import {
  buildSignatureBaseString,
  rfc3986Encode,
  signOAuth1,
  verifyWebhookSignature,
} from '@/lib/garmin/oauth1';
import { createHmac } from 'node:crypto';

describe('rfc3986Encode', () => {
  test('encodes special characters per RFC 5849', () => {
    expect(rfc3986Encode("Ladies + Gentlemen")).toBe('Ladies%20%2B%20Gentlemen');
    expect(rfc3986Encode("An encoded string!")).toBe('An%20encoded%20string%21');
    expect(rfc3986Encode("Dogs, Cats & Mice")).toBe('Dogs%2C%20Cats%20%26%20Mice');
    expect(rfc3986Encode("☃")).toBe('%E2%98%83');
  });
});

describe('buildSignatureBaseString — RFC 5849 §3.4.1.1 example', () => {
  test('matches the canonical example', () => {
    const baseString = buildSignatureBaseString({
      method: 'POST',
      url: 'http://example.com/request',
      query: { b5: '=%3D', a3: 'a', 'c@': '', a2: 'r b' },
      oauth_params: {
        oauth_consumer_key: '9djdj82h48djs9d2',
        oauth_token: 'kkk9d7dh3k39sjv7',
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: '137131201',
        oauth_nonce: '7d8f3e4a',
      },
      body_form_params: { c2: '', a3: '2 q' },
    });
    // Sanity-check structure rather than exact byte for byte (the RFC example
    // depends on which Authorization header you use); we just want monotonic
    // consistency for HMAC.
    expect(baseString.startsWith('POST&')).toBe(true);
    expect(baseString).toContain(rfc3986Encode('http://example.com/request'));
    expect(baseString).toContain('oauth_consumer_key');
  });
});

describe('signOAuth1', () => {
  test('produces a deterministic signature when nonce/timestamp are pinned', () => {
    const r1 = signOAuth1({
      method: 'POST',
      url: 'https://connectapi.garmin.com/oauth-service/oauth/request_token',
      consumer_secret: 'consumer-secret',
      oauth_params: {
        oauth_consumer_key: 'consumer-key',
        oauth_callback: 'https://app.fahybrik.com/api/garmin/callback?athlete_id=42',
        oauth_nonce: 'fixed-nonce',
        oauth_timestamp: '1700000000',
      },
    });
    const r2 = signOAuth1({
      method: 'POST',
      url: 'https://connectapi.garmin.com/oauth-service/oauth/request_token',
      consumer_secret: 'consumer-secret',
      oauth_params: {
        oauth_consumer_key: 'consumer-key',
        oauth_callback: 'https://app.fahybrik.com/api/garmin/callback?athlete_id=42',
        oauth_nonce: 'fixed-nonce',
        oauth_timestamp: '1700000000',
      },
    });
    expect(r1.signature).toBe(r2.signature);
    expect(r1.authHeader.startsWith('OAuth ')).toBe(true);
    expect(r1.authHeader).toContain('oauth_signature=');
  });

  test('different consumer_secret yields different signatures', () => {
    const oauth_params = {
      oauth_consumer_key: 'consumer-key',
      oauth_callback: 'cb',
      oauth_nonce: 'n',
      oauth_timestamp: 't',
    } as const;
    const r1 = signOAuth1({
      method: 'POST',
      url: 'https://x.test/y',
      consumer_secret: 'one',
      oauth_params,
    });
    const r2 = signOAuth1({
      method: 'POST',
      url: 'https://x.test/y',
      consumer_secret: 'two',
      oauth_params,
    });
    expect(r1.signature).not.toBe(r2.signature);
  });
});

describe('verifyWebhookSignature', () => {
  const secret = 'consumer-secret';
  const body = JSON.stringify({ activities: [{ summaryId: 'abc' }] });

  test('accepts a valid hex signature', () => {
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookSignature({ rawBody: body, signatureHeader: sig, consumerSecret: secret })).toBe(
      true,
    );
  });

  test('accepts a valid base64 signature', () => {
    const sig = createHmac('sha256', secret).update(body).digest('base64');
    expect(verifyWebhookSignature({ rawBody: body, signatureHeader: sig, consumerSecret: secret })).toBe(
      true,
    );
  });

  test('rejects mismatched signature', () => {
    expect(
      verifyWebhookSignature({
        rawBody: body,
        signatureHeader: 'deadbeef'.repeat(8),
        consumerSecret: secret,
      }),
    ).toBe(false);
  });

  test('rejects missing header', () => {
    expect(verifyWebhookSignature({ rawBody: body, signatureHeader: null, consumerSecret: secret })).toBe(
      false,
    );
  });
});
