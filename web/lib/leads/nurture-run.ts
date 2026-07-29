// Daily nurture run — pure logic, no auth, no HTTP (the route is a thin guard around this,
// mirroring lib/citas/reminder.ts). Selects every due touch, then for each one:
//
//   1) CLAIM it: `insert into lead_nurture_log (lead_id, touch_type) … on conflict do
//      nothing returning id`. Only the run that WINS the insert gets a row → it alone sends.
//      A concurrent run (or a re-run) that loses the conflict gets 0 rows and skips. This is
//      the hard idempotency guarantee (UNIQUE (lead_id, touch_type), migration 0100).
//   2) SEND the email. If it does not go out, DELETE the just-inserted log row so the next
//      daily run retries (at-least-once delivery on top of the idempotent claim). We own the
//      row we just inserted, so deleting it can never clobber another run's claim.
//
// Candidates are independent (distinct lead_id/touch_type), so the whole batch runs under
// Promise.allSettled — one failure never sinks the rest.
//
// dryRun: selects and RETURNS the candidates without claiming, sending or logging anything
// (used by tests and the `?dryRun=1` cron query).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { selectNurtureCandidates, type NurtureCandidate } from './nurture';
import { sendNurtureEmail, type NurtureEmailResult } from './nurture-email';
import { coachNameForLead } from './funnel-coach';

export interface NurtureRunResult {
  dry_run: boolean;
  /** Due touches found when we scanned. */
  candidates: number;
  /** Touches we won the claim on (sent + failed). */
  claimed: number;
  /** Emails actually delivered. */
  sent: number;
  /** Claimed but the send did not go out → log row deleted for a retry next run. */
  failed: number;
  /** Claim lost to a concurrent run / already logged — the idempotency guard firing. */
  skipped: number;
  /** Only populated on a dry run: the exact candidates that WOULD be sent. */
  selected?: NurtureCandidate[];
}

export interface RunNurtureParams {
  now?: Date;
  client?: Sql;
  dryRun?: boolean;
  /** Injected in tests so the suite never touches Resend or the network. */
  send?: (candidate: NurtureCandidate) => Promise<NurtureEmailResult>;
}

type Outcome = 'sent' | 'failed' | 'skipped';

export async function runNurture(params: RunNurtureParams = {}): Promise<NurtureRunResult> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const send = params.send ?? defaultSend;

  const candidates = await selectNurtureCandidates(now, client);

  if (params.dryRun) {
    return { dry_run: true, candidates: candidates.length, claimed: 0, sent: 0, failed: 0, skipped: 0, selected: candidates };
  }

  const results = await Promise.allSettled(
    candidates.map((candidate) => processOne(client, candidate, send)),
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of results) {
    // processOne is written to never reject (it maps its own failures to 'failed'); the
    // allSettled guard is belt-and-braces so an unexpected throw still can't sink the batch.
    const outcome: Outcome = r.status === 'fulfilled' ? r.value : 'failed';
    if (outcome === 'sent') sent += 1;
    else if (outcome === 'failed') failed += 1;
    else skipped += 1;
  }

  return { dry_run: false, candidates: candidates.length, claimed: sent + failed, sent, failed, skipped };
}

async function processOne(
  client: Sql,
  candidate: NurtureCandidate,
  send: (candidate: NurtureCandidate) => Promise<NurtureEmailResult>,
): Promise<Outcome> {
  // CLAIM — only the run whose insert survives the unique conflict gets the row.
  const claimed = await client<{ id: string }[]>`
    insert into lead_nurture_log (lead_id, touch_type)
    values (${Number(candidate.lead.id)}, ${candidate.touch_type})
    on conflict (lead_id, touch_type) do nothing
    returning id::text as id
  `;
  if (claimed.length === 0) return 'skipped';
  const logId = Number(claimed[0]!.id);

  let result: NurtureEmailResult;
  try {
    result = await send(candidate);
  } catch {
    result = { sent: false, skipped_reason: 'resend_send_failed' };
  }

  if (result.sent) return 'sent';

  // Send didn't go out → release our claim so the next daily run retries.
  await client`delete from lead_nurture_log where id = ${logId}`;
  return 'failed';
}

async function defaultSend(candidate: NurtureCandidate): Promise<NurtureEmailResult> {
  return sendNurtureEmail({
    touch_type: candidate.touch_type,
    email: candidate.lead.email,
    nombre: candidate.lead.nombre,
    cita_token: candidate.cita_token,
    unsubscribe_token: candidate.unsubscribe_token,
    // El coach de ESTE lead firma el correo. `coachNameForLead` no lanza nunca: si no
    // se puede resolver, la copia sale con el sujeto neutro en vez de perder el envío.
    coach_name: await coachNameForLead(defaultSql, BigInt(candidate.lead.id)),
  });
}
