import 'server-only';

// #28 importer — turns the coach's already-uploaded pathnames into the
// base64 images `readWeekVision` consumes. Split out of photo-proposal.ts
// (which keeps orchestrating: parse → resolve images → vision call →
// place → grammar/resolve) once that file crossed the repo's 500-line
// ceiling — same reasoning as `./import-shared.ts` / `./photo-placement.ts`
// already being their own modules: one concern (network + Blob) per file.
//
// INCIDENTE 2026-08-05 (producción): un coach subió una captura, la ruta
// murió con un 504 "Task timed out after 300 seconds" — el cliente esperó 5
// minutos y vio "No se pudo conectar". La llamada al modelo SÍ tenía cota
// (`LLM_VISION_TIMEOUT_MS`, 90s por defecto, en llm.ts); `head()` y `fetch()`
// del blob NO tenían ninguna, y el bucle era SECUENCIAL por imagen — un solo
// salto de red colgado se comía el presupuesto entero sin que el timeout del
// modelo llegara siquiera a activarse, porque esa etapa nunca se alcanzaba.
// Este fichero: (1) acota TODO salto de red con su propia señal de aborto,
// (2) resuelve las imágenes EN PARALELO en vez de una a una, (3) mide cada
// etapa y lo deja en los logs (console.info, nunca console.log), (4) acota
// el TOTAL de bytes de la importación, no solo por captura — 10 capturas de
// 15 MB en base64 son ~200 MB hacia el modelo, muy por encima de lo que
// cualquier proveedor acepta en un turno.

import { head as blobHead } from '@vercel/blob';
import type { LlmImageInput } from './vision-reader';
import { ImportError } from './import-shared';
import { importPhotoPathnameOwner } from './photo-pathname';

const LOG_TAG = '[import/photo]';

/**
 * Per-file size ceiling — a high-resolution screenshot or camera photo of a
 * week's calendar rarely exceeds a few MB; 15 MB leaves generous headroom
 * without inviting a client to disguise video as "an image". THE SAME
 * constant signs the upload (upload-url/route.ts imports it) and re-checks
 * the downloaded blob's real size here — one source of truth for the two
 * touchpoints of the same limit.
 */
export const IMPORT_PHOTO_MAX_BYTES = 15 * 1024 * 1024;

/**
 * The AGGREGATE ceiling across every image in ONE import (not just per
 * file) — the gap the 2026-08-05 incident review surfaced. Base64 inflates
 * bytes by ~33%, and `IMPORT_PHOTO_MAX_IMAGES` (10, photo-proposal.ts) ×
 * `IMPORT_PHOTO_MAX_BYTES` (15 MB) alone would let a request reach ~150 MB
 * raw → ~200 MB of JSON body sent to the vision model in one multimodal
 * turn — far past what any real provider accepts, and slow enough by itself
 * to burn the whole function budget before the model ever replies. 30 MB
 * raw (~40 MB base64) still covers a genuinely large batch (two full-size
 * 15 MB photos, or 6-10 normal phone-screenshot captures a few MB each)
 * while refusing the pathological case outright — checked BEFORE
 * downloading any bytes (from `head()`'s declared size), so a request over
 * the cap never pays for the download it was always going to reject.
 */
export const IMPORT_PHOTO_MAX_TOTAL_BYTES = 30 * 1024 * 1024;

/** Ceiling for ONE `head()` blob-metadata lookup. Near-instant in practice
 *  (same-infra call to our own Blob store); generous only so a genuine
 *  network hiccup doesn't false-positive. */
const HEAD_TIMEOUT_MS = 10_000;
/** Ceiling for ONE image's byte download from Blob. Bigger than HEAD_TIMEOUT_MS
 *  because it moves up to IMPORT_PHOTO_MAX_BYTES of real data, but still a
 *  hard stop — a hung connection must fail loud, never eat the function's
 *  whole `maxDuration` in silence (the incident's actual root cause). */
const DOWNLOAD_TIMEOUT_MS = 20_000;

/** One image reference from the wire — just its pathname. Deliberately NOT
 *  imported from photo-proposal.ts's Zod-inferred type: that file imports
 *  `resolvePhotoImages` FROM here, so importing the reverse direction would
 *  cycle. The shapes match structurally; no cast is needed at the call site. */
export interface PhotoImageRef {
  pathname: string;
}

/** Injectable seams for tests — a slow/hanging network hop must be provable
 *  without a REAL 10-20s wait: a test passes tiny timeouts + a `fetchImpl`
 *  that never resolves and asserts the abort fires quickly. Production never
 *  passes this — it always gets the real constants + global `fetch`. */
export interface ResolvePhotoImagesOptions {
  headTimeoutMs?: number;
  downloadTimeoutMs?: number;
  maxTotalBytes?: number;
  fetchImpl?: typeof fetch;
}

interface BlobHeadInfo {
  pathname: string;
  url: string;
  contentType: string;
  size: number;
}

/** `AbortSignal.timeout(ms)` fires with a `TimeoutError` (a manual `.abort()`
 *  fires with `AbortError`) — either way, this hop got cut off, it wasn't
 *  told "no". Distinguishing it from a real not-found/read-failure is what
 *  makes the coach-facing message HONEST instead of just bounded: "no existe
 *  o no es tuya" is a lie when the real answer is "no dio tiempo a mirar". */
function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

/** One image's blob metadata, with the ownership check + a bounded `head()`.
 *  Never downloads bytes — that's a separate, later step so the AGGREGATE
 *  size check (across every image) can reject a too-big request before any
 *  bandwidth is spent. */
async function headOnePhoto(
  coach_id: number | bigint,
  pathname: string,
  blobToken: string,
  headTimeoutMs: number,
): Promise<BlobHeadInfo> {
  const owner = importPhotoPathnameOwner(pathname);
  if (owner === null || owner !== BigInt(coach_id)) {
    throw new ImportError('not_found', 'Una de las capturas no existe o no es tuya.', 404);
  }
  const startedAt = Date.now();
  let meta: { url: string; contentType: string; size: number };
  try {
    meta = await blobHead(pathname, {
      token: blobToken,
      abortSignal: AbortSignal.timeout(headTimeoutMs),
    });
  } catch (err) {
    console.info(`${LOG_TAG} head_failed`, {
      pathname,
      ms: Date.now() - startedAt,
      aborted: isAbortError(err),
      error: err instanceof Error ? err.message : String(err),
    });
    if (isAbortError(err)) {
      throw new ImportError(
        'network_timeout',
        'No se pudo comprobar una de las capturas a tiempo. Vuelve a intentarlo.',
        504,
      );
    }
    throw new ImportError('not_found', 'Una de las capturas no existe o no es tuya.', 404);
  }
  console.info(`${LOG_TAG} head`, { pathname, size_bytes: meta.size, ms: Date.now() - startedAt });
  return { pathname, url: meta.url, contentType: meta.contentType, size: meta.size };
}

/** One image's bytes, base64-encoded — bounded download, on an ALREADY
 *  size-checked blob (see `resolvePhotoImages`). */
async function downloadOnePhoto(
  info: BlobHeadInfo,
  blobToken: string,
  downloadTimeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<LlmImageInput> {
  const startedAt = Date.now();
  let upstream: Response;
  try {
    upstream = await fetchImpl(info.url, {
      headers: { authorization: `Bearer ${blobToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(downloadTimeoutMs),
    });
  } catch (err) {
    console.info(`${LOG_TAG} download_failed`, {
      pathname: info.pathname,
      ms: Date.now() - startedAt,
      aborted: isAbortError(err),
      error: err instanceof Error ? err.message : String(err),
    });
    if (isAbortError(err)) {
      throw new ImportError(
        'network_timeout',
        'La descarga de una de las capturas tardó demasiado. Vuelve a intentarlo.',
        504,
      );
    }
    throw new ImportError(
      'source_read_failed',
      'No se pudo leer una de las capturas subidas.',
      502,
    );
  }
  if (!upstream.ok) {
    console.info(`${LOG_TAG} download_bad_status`, {
      pathname: info.pathname,
      status: upstream.status,
      ms: Date.now() - startedAt,
    });
    throw new ImportError(
      'source_read_failed',
      'No se pudo leer una de las capturas subidas.',
      502,
    );
  }
  const bytes = Buffer.from(await upstream.arrayBuffer());
  console.info(`${LOG_TAG} download`, {
    pathname: info.pathname,
    bytes: bytes.length,
    ms: Date.now() - startedAt,
  });
  return { image_base64: bytes.toString('base64'), mime_type: info.contentType };
}

/**
 * Turns the coach's already-uploaded pathnames into the base64 images
 * `readWeekVision` consumes.
 *
 * WHY A PATHNAME AND NEVER A URL: if this accepted a client-supplied URL, the
 * endpoint would become a proxy that fetches WHATEVER host the client names —
 * a classic SSRF hole, and worse here because the fetched bytes get forwarded
 * on to an LLM call. A pathname closes it two ways: (1) `head()` below is an
 * AUTHENTICATED call to Vercel Blob's API scoped by our own token — it can
 * only ever resolve an object inside OUR store, never an arbitrary external
 * host, no matter what string is passed; (2) the `import-photos/<coach_id>/…`
 * prefix — written only by upload-url, from the session, never the client —
 * is checked against the CALLING coach before we even ask Blob, so one coach
 * can't reference another coach's upload either. Outside our store: nothing
 * resolves. Inside it: only the caller's own.
 *
 * HEAD → sum sizes → DOWNLOAD, all in two PARALLEL passes (not sequential —
 * the incident's actual root cause): worst-case latency is bounded by the
 * SLOWEST single hop, not the sum of N hops. The aggregate size check runs
 * between the two passes so a too-big request is rejected before a single
 * byte is downloaded.
 */
export async function resolvePhotoImages(
  coach_id: number | bigint,
  images: PhotoImageRef[],
  opts: ResolvePhotoImagesOptions = {},
): Promise<LlmImageInput[]> {
  const headTimeoutMs = opts.headTimeoutMs ?? HEAD_TIMEOUT_MS;
  const downloadTimeoutMs = opts.downloadTimeoutMs ?? DOWNLOAD_TIMEOUT_MS;
  const maxTotalBytes = opts.maxTotalBytes ?? IMPORT_PHOTO_MAX_TOTAL_BYTES;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    throw new ImportError(
      'storage_unavailable',
      'El almacén de imágenes no está configurado.',
      503,
    );
  }

  const heads = await Promise.all(
    images.map(({ pathname }) => headOnePhoto(coach_id, pathname, blobToken, headTimeoutMs)),
  );

  for (const h of heads) {
    if (h.size > IMPORT_PHOTO_MAX_BYTES) {
      throw new ImportError('too_large', 'Una de las capturas supera el tamaño permitido.', 413);
    }
  }
  const totalBytes = heads.reduce((sum, h) => sum + h.size, 0);
  if (totalBytes > maxTotalBytes) {
    console.info(`${LOG_TAG} total_too_large`, { total_bytes: totalBytes, max: maxTotalBytes });
    throw new ImportError(
      'too_large',
      'Las capturas juntas pesan demasiado. Prueba con menos capturas o imágenes más ligeras.',
      413,
    );
  }

  return Promise.all(heads.map((h) => downloadOnePhoto(h, blobToken, downloadTimeoutMs, fetchImpl)));
}
