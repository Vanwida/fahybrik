/**
 * Incidente 2026-08-05 (producción): un coach subió una captura y
 * `/api/coach/import/proposal` murió con un 504 opaco de Vercel a los 300s —
 * `head()`/`fetch()` del blob no tenían ninguna cota propia. Este fichero
 * prueba que un salto de red lento produce un error ACOTADO y LEGIBLE
 * (código, mensaje en español, status), no un cuelgue que agote el
 * presupuesto de la función.
 *
 * Los timeouts son tiny (10-20ms) e INYECTADOS — nunca se espera un timeout
 * real de producción (10-20s): así el test prueba el MECANISMO en
 * milisegundos, no la paciencia de CI.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { resolvePhotoImages, IMPORT_PHOTO_MAX_BYTES } from '@/lib/import/photo-blob-resolve';
import { ImportError } from '@/lib/import/import-shared';

const { headMock } = vi.hoisted(() => ({ headMock: vi.fn() }));
vi.mock('@vercel/blob', () => ({ head: headMock }));

const COACH_ID = 42;
const PATHNAME = `import-photos/${COACH_ID}/2026/08/uuid.jpg`;

/** Nunca resuelve por sí sola — solo termina si su `AbortSignal` se dispara,
 *  exactamente como un socket colgado de verdad. */
function hangingFetch(): typeof fetch {
  return vi.fn((_url, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  headMock.mockReset();
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
});

describe('resolvePhotoImages — saltos de red acotados', () => {
  test('head() colgado: aborta a tiempo con un error legible, no agota el presupuesto', async () => {
    headMock.mockImplementation(
      (_pathname: string, opts?: { abortSignal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.abortSignal?.addEventListener(
            'abort',
            () => reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })),
            { once: true },
          );
        }),
    );

    const startedAt = Date.now();
    await expect(
      resolvePhotoImages(COACH_ID, [{ pathname: PATHNAME }], { headTimeoutMs: 15 }),
    ).rejects.toMatchObject({
      code: 'network_timeout',
      status: 504,
      message: expect.stringContaining('a tiempo'),
    });
    // Prueba real de "no agota el presupuesto": el fallo llega en milisegundos,
    // no en los 15s reales que tardaría un head() de verdad colgado.
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  test('fetch() de descarga colgado: aborta a tiempo con un error legible', async () => {
    headMock.mockResolvedValue({
      url: 'https://blob.example/signed',
      contentType: 'image/jpeg',
      size: 1024,
    });

    const startedAt = Date.now();
    await expect(
      resolvePhotoImages(COACH_ID, [{ pathname: PATHNAME }], {
        downloadTimeoutMs: 15,
        fetchImpl: hangingFetch(),
      }),
    ).rejects.toMatchObject({
      code: 'network_timeout',
      status: 504,
      message: expect.stringContaining('tardó demasiado'),
    });
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  test('varias imágenes se resuelven EN PARALELO: el tiempo total es el de la más lenta, no la suma', async () => {
    // Tres head() con retrasos distintos (15/20/25ms) resueltos vía
    // setTimeout real (no colgados) — si el bucle fuera secuencial el total
    // rondaría 60ms; en paralelo debe rondar los 25ms del más lento.
    const delays = [15, 20, 25];
    let call = 0;
    headMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          const ms = delays[call]!;
          call += 1;
          setTimeout(
            () => resolve({ url: 'https://blob.example/x', contentType: 'image/jpeg', size: 100 }),
            ms,
          );
        }),
    );
    const images = delays.map((_, i) => ({ pathname: `import-photos/${COACH_ID}/2026/08/${i}.jpg` }));

    const startedAt = Date.now();
    const out = await resolvePhotoImages(COACH_ID, images, {
      fetchImpl: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
    });
    const elapsedMs = Date.now() - startedAt;

    expect(out).toHaveLength(3);
    // Generoso pero decisivo: en serie serían ~60ms; en paralelo, ~25-40ms.
    expect(elapsedMs).toBeLessThan(50);
  });

  test('el tope AGREGADO de bytes rechaza ANTES de descargar ni un byte', async () => {
    // Dos imágenes que individualmente caben bajo IMPORT_PHOTO_MAX_BYTES pero
    // juntas superan un tope agregado pequeño e inyectado.
    headMock.mockResolvedValue({
      url: 'https://blob.example/x',
      contentType: 'image/jpeg',
      size: 6_000_000,
    });
    const fetchSpy = vi.fn();
    const images = [
      { pathname: `import-photos/${COACH_ID}/2026/08/1.jpg` },
      { pathname: `import-photos/${COACH_ID}/2026/08/2.jpg` },
    ];

    await expect(
      resolvePhotoImages(COACH_ID, images, {
        maxTotalBytes: 10_000_000, // 2×6MB = 12MB > 10MB
        fetchImpl: fetchSpy as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'too_large', status: 413 });
    // La aserción que de verdad importa: nunca se llegó a descargar.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('un tamaño individual por debajo del tope pero cerca del real (15 MB) sigue pasando la validación de forma', async () => {
    headMock.mockResolvedValue({
      url: 'https://blob.example/x',
      contentType: 'image/jpeg',
      size: IMPORT_PHOTO_MAX_BYTES,
    });
    const out = await resolvePhotoImages(COACH_ID, [{ pathname: PATHNAME }], {
      maxTotalBytes: IMPORT_PHOTO_MAX_BYTES + 1,
      fetchImpl: (async () => new Response(new Uint8Array([1]))) as unknown as typeof fetch,
    });
    expect(out).toHaveLength(1);
  });
});

describe('ImportError — el error sigue siendo instanceof la clase compartida', () => {
  test('network_timeout es un ImportError normal, tal y como lo espera el route.ts', async () => {
    headMock.mockImplementation(
      (_pathname: string, opts?: { abortSignal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.abortSignal?.addEventListener(
            'abort',
            () => reject(Object.assign(new Error('x'), { name: 'TimeoutError' })),
            { once: true },
          );
        }),
    );
    try {
      await resolvePhotoImages(COACH_ID, [{ pathname: PATHNAME }], { headTimeoutMs: 10 });
      expect.unreachable('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(ImportError);
    }
  });
});
