// OAuth 1.0a (HMAC-SHA1) signing per RFC 5849. Garmin Health API uses this
// flow; access tokens never expire (revoked manually by user or by Garmin).
//
// Public surface:
//   - rfc3986Encode
//   - buildSignatureBaseString
//   - signOAuth1
//   - buildAuthHeader
//   - verifyHmacSha256Webhook (for /api/garmin/webhook)

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type OAuth1Params = {
  oauth_consumer_key: string;
  oauth_token?: string;
  oauth_callback?: string;
  oauth_verifier?: string;
  oauth_signature_method?: 'HMAC-SHA1';
  oauth_timestamp?: string;
  oauth_nonce?: string;
  oauth_version?: '1.0';
};

// Per RFC 5849 §3.6: percent-encode every byte that isn't unreserved.
export function rfc3986Encode(s: string): string {
  return encodeURIComponent(s).replace(
    /[!*'()]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function newNonce(): string {
  return randomBytes(16).toString('hex');
}

function nowSeconds(): string {
  return Math.floor(Date.now() / 1000).toString();
}

// Build the OAuth 1.0a signature base string per §3.4.1.
export function buildSignatureBaseString(params: {
  method: string;
  url: string;                                    // including scheme, host, path; no query
  query: Record<string, string>;                  // query params from the URL
  oauth_params: Record<string, string>;
  body_form_params?: Record<string, string>;      // application/x-www-form-urlencoded body
}): string {
  const all: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(params.query)) all.push([k, v]);
  for (const [k, v] of Object.entries(params.oauth_params)) all.push([k, v]);
  if (params.body_form_params) {
    for (const [k, v] of Object.entries(params.body_form_params)) all.push([k, v]);
  }

  const encoded = all
    .map(([k, v]) => [rfc3986Encode(k), rfc3986Encode(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));

  const paramString = encoded.map(([k, v]) => `${k}=${v}`).join('&');

  return [
    params.method.toUpperCase(),
    rfc3986Encode(params.url),
    rfc3986Encode(paramString),
  ].join('&');
}

export function signOAuth1(params: {
  method: string;
  url: string;
  query?: Record<string, string>;
  body_form_params?: Record<string, string>;
  consumer_secret: string;
  token_secret?: string;
  oauth_params: OAuth1Params;
}): { authHeader: string; oauth_params: Required<Pick<OAuth1Params, 'oauth_signature_method' | 'oauth_timestamp' | 'oauth_nonce' | 'oauth_version'>> & OAuth1Params; signature: string } {
  const oauth_params: Record<string, string> = {
    oauth_consumer_key: params.oauth_params.oauth_consumer_key,
    oauth_signature_method: params.oauth_params.oauth_signature_method ?? 'HMAC-SHA1',
    oauth_timestamp: params.oauth_params.oauth_timestamp ?? nowSeconds(),
    oauth_nonce: params.oauth_params.oauth_nonce ?? newNonce(),
    oauth_version: params.oauth_params.oauth_version ?? '1.0',
  };
  if (params.oauth_params.oauth_token) oauth_params.oauth_token = params.oauth_params.oauth_token;
  if (params.oauth_params.oauth_callback) oauth_params.oauth_callback = params.oauth_params.oauth_callback;
  if (params.oauth_params.oauth_verifier) oauth_params.oauth_verifier = params.oauth_params.oauth_verifier;

  const baseString = buildSignatureBaseString({
    method: params.method,
    url: params.url,
    query: params.query ?? {},
    oauth_params,
    body_form_params: params.body_form_params,
  });

  const signingKey =
    rfc3986Encode(params.consumer_secret) + '&' + rfc3986Encode(params.token_secret ?? '');

  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauth_params.oauth_signature = signature;
  const authHeader =
    'OAuth ' +
    Object.entries(oauth_params)
      .map(([k, v]) => `${rfc3986Encode(k)}="${rfc3986Encode(v)}"`)
      .join(', ');

  return { authHeader, oauth_params: oauth_params as never, signature };
}

export function buildAuthHeader(oauth_params: Record<string, string>): string {
  return (
    'OAuth ' +
    Object.entries(oauth_params)
      .map(([k, v]) => `${rfc3986Encode(k)}="${rfc3986Encode(v)}"`)
      .join(', ')
  );
}

// Garmin's push notifications include a signature header so we can verify the
// payload origin. Garmin uses HMAC-SHA256 over the raw request body with the
// consumer secret as the key. The exact header name varies by program; we read
// `x-garmin-signature` and accept hex or base64.
//
// The webhook secret defaults to `consumerSecret` to match Garmin's contract,
// but allows overriding via GARMIN_WEBHOOK_SECRET in case a separate
// per-program HMAC key is provisioned (some Garmin programs do this).
export function verifyWebhookSignature(params: {
  rawBody: string | Buffer;
  signatureHeader: string | null;
  consumerSecret: string;
  webhookSecret?: string;
}): boolean {
  if (!params.signatureHeader) return false;
  const body = typeof params.rawBody === 'string' ? Buffer.from(params.rawBody, 'utf8') : params.rawBody;
  const key = params.webhookSecret && params.webhookSecret.length > 0
    ? params.webhookSecret
    : params.consumerSecret;
  const expected = createHmac('sha256', key).update(body).digest();

  let received: Buffer;
  try {
    if (/^[0-9a-fA-F]+$/.test(params.signatureHeader) && params.signatureHeader.length === expected.length * 2) {
      received = Buffer.from(params.signatureHeader, 'hex');
    } else {
      received = Buffer.from(params.signatureHeader, 'base64');
    }
  } catch {
    return false;
  }
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
