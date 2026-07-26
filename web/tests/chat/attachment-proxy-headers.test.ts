// Las cabeceras del proxy de adjuntos.
//
// Dos cosas que no se pueden equivocar: que el caché sea PRIVADO —un adjunto es
// una conversación entre dos personas y no puede quedarse en ninguna caché
// compartida del camino— y que se reenvíe `Range`, sin el cual un vídeo hay que
// descargarlo entero antes de poder adelantarlo.

import { describe, expect, it } from 'vitest';
import {
  buildDownstreamHeaders,
  buildUpstreamHeaders,
} from '@/app/api/chat/attachments/[...path]/route';

const TOKEN = 'vercel_blob_rw_TESTTOKEN';

describe('buildUpstreamHeaders', () => {
  it('autoriza contra el blob privado', () => {
    const h = buildUpstreamHeaders(new Request('https://x.test/a'), TOKEN);
    expect(h.get('authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('reenvía Range para que el vídeo se pueda adelantar', () => {
    const req = new Request('https://x.test/a', { headers: { range: 'bytes=1024-2047' } });
    expect(buildUpstreamHeaders(req, TOKEN).get('range')).toBe('bytes=1024-2047');
  });

  it('reenvía las condicionales para no repetir bytes ya descargados', () => {
    const req = new Request('https://x.test/a', {
      headers: { 'if-none-match': '"abc"', 'if-modified-since': 'Wed, 21 Oct 2026 07:28:00 GMT' },
    });
    const h = buildUpstreamHeaders(req, TOKEN);
    expect(h.get('if-none-match')).toBe('"abc"');
    expect(h.get('if-modified-since')).toBe('Wed, 21 Oct 2026 07:28:00 GMT');
  });

  it('no arrastra la cookie ni la autorización de quien llama', () => {
    // Reenviarlas mandaría la sesión del coach a un tercero.
    const req = new Request('https://x.test/a', {
      headers: { cookie: 'session=secreto', authorization: 'Bearer del-cliente' },
    });
    const h = buildUpstreamHeaders(req, TOKEN);
    expect(h.get('cookie')).toBeNull();
    expect(h.get('authorization')).toBe(`Bearer ${TOKEN}`);
  });
});

describe('buildDownstreamHeaders', () => {
  function upstream(headers: Record<string, string>, status = 200): Response {
    return new Response(null, { status, headers });
  }

  it('el caché es privado y acotado', () => {
    const h = buildDownstreamHeaders(upstream({}));
    expect(h.get('cache-control')).toBe('private, max-age=300');
    expect(h.get('cache-control')).not.toContain('public');
  });

  it('copia lo que describe el contenido', () => {
    const h = buildDownstreamHeaders(
      upstream({ 'content-type': 'video/mp4', 'content-length': '2048', etag: '"v1"' }),
    );
    expect(h.get('content-type')).toBe('video/mp4');
    expect(h.get('content-length')).toBe('2048');
    expect(h.get('etag')).toBe('"v1"');
  });

  it('conserva content-range en una respuesta parcial', () => {
    const h = buildDownstreamHeaders(
      upstream({ 'content-range': 'bytes 0-99/2048', 'accept-ranges': 'bytes' }, 206),
    );
    expect(h.get('content-range')).toBe('bytes 0-99/2048');
  });

  it('anuncia que acepta tramos aunque el blob no lo diga', () => {
    // Sin esta cabecera, el navegador ni intenta pedir un tramo y descarga el
    // vídeo entero antes de dejar mover la barra.
    expect(buildDownstreamHeaders(upstream({})).get('accept-ranges')).toBe('bytes');
  });

  it('no reenvía cabeceras del blob que no describen el contenido', () => {
    const h = buildDownstreamHeaders(upstream({ 'x-vercel-blob-store': 'flhljlytjilaib8q' }));
    expect(h.get('x-vercel-blob-store')).toBeNull();
  });
});
