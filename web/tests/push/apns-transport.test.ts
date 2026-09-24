/**
 * APNS only speaks HTTP/2. This runs the real transport against a local
 * h2-ONLY TLS server (allowHTTP1: false, like Apple's): Node's global fetch
 * cannot talk to such a server (it offers only http/1.1 in ALPN), which is how
 * every iOS push failed until 2026-09-24.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createSecureServer, type Http2SecureServer } from 'node:http2';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apnsConnect, apnsPost } from '@/lib/push/apns';

let server: Http2SecureServer;
let origin = '';
let cert = '';
const seen: Array<{ path: string; headers: Record<string, unknown>; body: string }> = [];

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apns-h2-'));
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'),
  ], { stdio: 'ignore' });
  cert = readFileSync(join(dir, 'cert.pem'), 'utf8');
  server = createSecureServer({ key: readFileSync(join(dir, 'key.pem')), cert, allowHTTP1: false });
  server.on('stream', (stream, headers) => {
    let body = '';
    stream.setEncoding('utf8');
    stream.on('data', (c: string) => (body += c));
    stream.on('end', () => {
      const path = String(headers[':path']);
      seen.push({ path, headers, body });
      if (path.endsWith('/dead')) {
        stream.respond({ ':status': 410, 'content-type': 'application/json' });
        stream.end(JSON.stringify({ reason: 'Unregistered' }));
      } else {
        stream.respond({ ':status': 200, 'apns-id': 'abc' });
        stream.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `https://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('APNS transport (HTTP/2)', () => {
  it('posts over h2 with the APNS headers and body, and reuses one session for several devices', async () => {
    const session = await apnsConnect(origin, { ca: cert });
    try {
      const headers = {
        authorization: 'bearer jwt',
        'apns-topic': 'app.bundle',
        'apns-push-type': 'alert',
        'content-type': 'application/json',
      };
      const a = await apnsPost(session, '/3/device/tokenA', headers, '{"aps":{"alert":"hola"}}');
      const b = await apnsPost(session, '/3/device/tokenB', headers, '{"aps":{"alert":"hola"}}');
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      const first = seen.find((s) => s.path === '/3/device/tokenA')!;
      expect(first.headers[':method']).toBe('POST');
      expect(first.headers['apns-topic']).toBe('app.bundle');
      expect(first.headers.authorization).toBe('bearer jwt');
      expect(JSON.parse(first.body)).toEqual({ aps: { alert: 'hola' } });
    } finally {
      session.close();
    }
  });

  it("returns Apple's error reason in the body (410 Unregistered)", async () => {
    const session = await apnsConnect(origin, { ca: cert });
    try {
      const res = await apnsPost(session, '/3/device/dead', {}, '{}');
      expect(res.status).toBe(410);
      expect(JSON.parse(res.body)).toEqual({ reason: 'Unregistered' });
    } finally {
      session.close();
    }
  });

  it('a host that is down rejects the connection instead of hanging', async () => {
    await expect(apnsConnect('https://localhost:1', { ca: cert })).rejects.toThrow();
  });
});
