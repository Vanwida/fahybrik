// GET /api/cron/notifications
//
// Vercel Cron entry-point — daily at 07:00 UTC (see vercel.json). Runs the three
// scheduled notification triggers in one pass: skipped check-ins, HRV crashes,
// and race countdown. Each trigger is independently idempotent on
// (user, kind, dedupe window) — see lib/notifications/triggers.ts — so re-runs
// never spam Pablo or the athletes. One failing trigger never aborts the others
// (per-trigger try/catch), and each crash is journalled via captureRouteError.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (fail-closed if unset). Mirrors
// the other api/cron/* routes' runtime/auth contract.

import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import {
  checkHrvCrashes,
  checkRaceCountdown,
  checkSkippedCheckins,
} from '@/lib/notifications/triggers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Three cohort-wide sweeps; give headroom beyond the default function timeout.
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get('authorization');
  if (!header) return false;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() === expected;
}

type TriggerOutcome = { ok: true; notified: number } | { ok: false; error: string };

// Wrap each trigger so one failure is isolated (logged + reported) instead of
// aborting the whole cron run.
async function runTrigger(fn: () => Promise<number>, route: string): Promise<TriggerOutcome> {
  try {
    const notified = await fn();
    return { ok: true, notified };
  } catch (err) {
    captureRouteError(err, { route });
    return { ok: false, error: err instanceof Error ? err.message : 'unknown_error' };
  }
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return jsonError('unauthorized', 'Cron auth required', 401);
  }

  const checkins = await runTrigger(
    async () => (await checkSkippedCheckins({ sql })).flagged,
    'api/cron/notifications.checkins',
  );
  const hrv = await runTrigger(
    async () => (await checkHrvCrashes({ sql })).flagged,
    'api/cron/notifications.hrv',
  );
  const race_countdown = await runTrigger(
    async () => (await checkRaceCountdown({ sql })).sent,
    'api/cron/notifications.race_countdown',
  );

  const notified =
    (checkins.ok ? checkins.notified : 0) +
    (hrv.ok ? hrv.notified : 0) +
    (race_countdown.ok ? race_countdown.notified : 0);

  return jsonOk({ ok: true, notified, checkins, hrv, race_countdown });
}
