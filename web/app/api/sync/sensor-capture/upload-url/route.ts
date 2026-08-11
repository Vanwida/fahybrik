import { randomUUID } from 'node:crypto';
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { z } from 'zod';
import {
  SENSOR_CAPTURE_CONSENT_VERSION,
  SENSOR_CAPTURE_MAX_BYTES,
} from '@/lib/sync/ingest-sensor-capture';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOAD_URL_TTL_MS = 30 * 60 * 1000;

const bodySchema = z.object({
  execution_id: z.number().int().positive(),
  size_bytes: z.number().int().positive().max(SENSOR_CAPTURE_MAX_BYTES),
});

// POST /api/sync/sensor-capture/upload-url — prefirma el destino del archivo
// inercial. Exige consentimiento del atleta (fase 0).
export async function POST(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);
  const athleteId = Number(auth.athlete_id);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  const consent = await sql<Array<{ v: string | null }>>`
    select sensor_capture_consent_version as v
    from athletes where id = ${athleteId} limit 1
  `;
  if (!consent[0]?.v || consent[0].v !== SENSOR_CAPTURE_CONSENT_VERSION) {
    return jsonError('forbidden', 'sensor capture consent required', 403);
  }

  const owned = await sql<Array<{ id: string }>>`
    select id::text as id from workout_executions
    where id = ${parsed.data.execution_id} and athlete_id = ${athleteId}
    limit 1
  `;
  if (owned.length === 0) return jsonError('not_found', 'Execution not found', 404);

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    return jsonError('storage_unavailable', 'Blob storage is not configured', 503);
  }

  const now = new Date();
  const id = randomUUID();
  const pathname = `sensor/${athleteId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${parsed.data.execution_id}-${id}.fhsc`;
  const mime = 'application/octet-stream';
  const validUntil = now.getTime() + UPLOAD_URL_TTL_MS;

  try {
    const signed = await issueSignedToken({
      token: blobToken,
      pathname,
      operations: ['put'],
      validUntil,
      allowedContentTypes: [mime],
      maximumSizeInBytes: SENSOR_CAPTURE_MAX_BYTES,
    });
    const { presignedUrl } = await presignUrl(signed, {
      operation: 'put',
      pathname,
      access: 'private',
      validUntil,
      allowedContentTypes: [mime],
      maximumSizeInBytes: SENSOR_CAPTURE_MAX_BYTES,
      addRandomSuffix: false,
    });
    return jsonOk({
      upload_url: presignedUrl,
      storage_pathname: pathname,
      content_type: mime,
      consent_version: SENSOR_CAPTURE_CONSENT_VERSION,
      expires_at: new Date(validUntil).toISOString(),
    });
  } catch (err) {
    return jsonError(
      'storage_unavailable',
      `No se pudo preparar la subida: ${err instanceof Error ? err.message : 'error'}`,
      502,
    );
  }
}
