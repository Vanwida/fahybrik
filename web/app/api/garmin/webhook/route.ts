// POST /api/garmin/webhook
//
// Receives push notifications from Garmin Health. Verifies signature, then
// persists raw payload + parsed metrics into biometric_streams.
//
// Supported summary types per Garmin Health Activity API:
//   - dailies (daily summary)
//   - activities, activityDetails
//   - sleeps
//   - stressDetails
//   - bodyComps
//   - heartRateVariabilities
//   - userMetrics (vo2max, fitnessAge)
//
// We accept the union and parse what we can map to biometric_metric enum.

import { gatedResponse, loadGarminConfig, verifyWebhookSignature } from '@/lib/garmin';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type GarminSummary = {
  userId?: string;
  userAccessToken?: string;
  summaryId?: string;
  startTimeInSeconds?: number;
  durationInSeconds?: number;
  averageHeartRateInBeatsPerMinute?: number;
  restingHeartRateInBeatsPerMinute?: number;
  activeKilocalories?: number;
  steps?: number;
  vo2Max?: number;
  bodyBatteryChargedValue?: number;
  bodyBatteryDrainedValue?: number;
  averageStressLevel?: number;
  durationInMillis?: number; // sleeps
};

type GarminPayload = {
  dailies?: GarminSummary[];
  activities?: GarminSummary[];
  activityDetails?: GarminSummary[];
  sleeps?: GarminSummary[];
  stressDetails?: GarminSummary[];
  bodyComps?: Array<GarminSummary & { weightInGrams?: number; bodyFatInPercent?: number }>;
  heartRateVariabilities?: Array<GarminSummary & { lastNightAvg?: number }>;
  userMetrics?: Array<GarminSummary & { vo2Max?: number }>;
};

export async function POST(request: Request): Promise<Response> {
  const cfg = loadGarminConfig();
  if (!cfg.ok) return gatedResponse(cfg.missing);

  const rawBody = await request.text();

  const sigHeader = request.headers.get('x-garmin-signature') ?? request.headers.get('x-hub-signature-256');
  const valid = verifyWebhookSignature({
    rawBody,
    signatureHeader: sigHeader,
    consumerSecret: cfg.config.consumer_secret,
  });
  if (!valid) {
    return jsonError(401, 'invalid_signature', 'webhook signature missing or invalid');
  }

  let payload: GarminPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonError(400, 'invalid_json', 'webhook body is not valid JSON');
  }

  const records = await persistPayload(payload, rawBody);
  return new Response(JSON.stringify({ ok: true, ingested: records }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function persistPayload(payload: GarminPayload, rawBody: string): Promise<number> {
  const items: Array<{
    userAccessToken: string;
    metric: string;
    value: number;
    unit: string;
    recorded_at: Date;
    source_workout_id: string | null;
  }> = [];

  function pushIfFinite(s: GarminSummary | undefined, metric: string, value: number | undefined, unit: string, source_workout_id: string | null = null) {
    if (!s || !s.userAccessToken) return;
    if (value == null || !Number.isFinite(value)) return;
    const ts = s.startTimeInSeconds ? new Date(s.startTimeInSeconds * 1000) : new Date();
    items.push({
      userAccessToken: s.userAccessToken,
      metric,
      value,
      unit,
      recorded_at: ts,
      source_workout_id,
    });
  }

  for (const d of payload.dailies ?? []) {
    pushIfFinite(d, 'hr_resting', d.restingHeartRateInBeatsPerMinute, 'bpm');
    pushIfFinite(d, 'steps', d.steps, 'count');
    pushIfFinite(d, 'calories_active', d.activeKilocalories, 'kcal');
    pushIfFinite(d, 'body_battery', d.bodyBatteryChargedValue, 'pct');
    pushIfFinite(d, 'stress', d.averageStressLevel, 'pct');
  }
  for (const a of payload.activities ?? []) {
    pushIfFinite(a, 'hr', a.averageHeartRateInBeatsPerMinute, 'bpm', a.summaryId ?? null);
  }
  for (const s of payload.sleeps ?? []) {
    pushIfFinite(s, 'sleep_duration', s.durationInMillis ? s.durationInMillis / 1000 : s.durationInSeconds, 'seconds');
  }
  for (const b of payload.bodyComps ?? []) {
    pushIfFinite(b, 'weight', b.weightInGrams ? b.weightInGrams / 1000 : undefined, 'kg');
    pushIfFinite(b, 'body_fat', b.bodyFatInPercent, 'pct');
  }
  for (const h of payload.heartRateVariabilities ?? []) {
    pushIfFinite(h, 'hrv', h.lastNightAvg, 'ms');
  }
  for (const u of payload.userMetrics ?? []) {
    pushIfFinite(u, 'vo2max', u.vo2Max, 'ml_kg_min');
  }

  if (items.length === 0) return 0;

  // Resolve userAccessToken → athlete_id by decrypting stored access tokens.
  // For scaffolding we batch-load the connected athletes and match in JS;
  // production should add a hashed-token index column for direct lookup.
  const tokenToAthlete = await resolveUserAccessTokens(items.map((i) => i.userAccessToken));

  let inserted = 0;
  for (const it of items) {
    const athlete_id = tokenToAthlete.get(it.userAccessToken);
    if (!athlete_id) continue;
    await sql`
      insert into biometric_streams (
        athlete_id, source, source_workout_id, metric_type, recorded_at, value_numeric, unit, raw_payload_json
      ) values (
        ${athlete_id as unknown as number},
        'garmin',
        ${it.source_workout_id},
        ${it.metric}::biometric_metric,
        ${it.recorded_at.toISOString()},
        ${it.value},
        ${it.unit},
        ${rawBody}::jsonb
      )
    `;
    inserted += 1;
  }
  return inserted;
}

async function resolveUserAccessTokens(tokens: string[]): Promise<Map<string, bigint>> {
  // Re-uses the already-decrypted token store. For each connected athlete we
  // decrypt and compare. Acceptable while we have <1k connected athletes;
  // we'll add a sha256-of-token index column when scale demands.
  const { decrypt } = await import('@/lib/crypto/aes-gcm');
  const rows = await sql<Array<{ athlete_id: bigint; access_token_encrypted: Buffer }>>`
    select athlete_id, access_token_encrypted from garmin_oauth_tokens
  `;
  const tokenSet = new Set(tokens);
  const out = new Map<string, bigint>();
  for (const r of rows) {
    let plain: string;
    try {
      plain = decrypt(r.access_token_encrypted);
    } catch {
      continue;
    }
    if (tokenSet.has(plain)) out.set(plain, r.athlete_id);
  }
  return out;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
