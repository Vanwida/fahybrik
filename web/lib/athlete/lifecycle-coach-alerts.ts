// Telling the coach that an athlete paused, is leaving, or is coming back (#13).
//
// WHY EMAIL AND NOT JUST THE IN-APP NOTIFICATION. `notifyCoach()` writes a row into
// `notifications` and pushes it over APNs. But APNs is iOS and the coach works in the
// WEB dashboard, where — checked, 2026-07-26 — no component reads that table at all.
// So today that channel reaches nobody. A baja is money and a person walking out the
// door: it cannot wait until he happens to open the panel. Email (Resend, already
// wired for the lead funnel) is therefore the channel that actually delivers, and the
// notification row is still written so the day the dashboard grows an inbox, these
// light up in it for free.
//
// The return ("vuelve mañana") deliberately gets NO email: it is routine, it happens
// on a schedule he already knows, and a mailbox that cries wolf stops being read.
//
// Every send is BEST-EFFORT and guarded. A lifecycle transition must never fail
// because an email bounced — the state change is the truth, the alert is a courtesy.

import { Resend } from 'resend';
import { sql } from '@/lib/db';
import { longDateEs } from '@fahybrid/shared/domain/dates';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { notifyCoach } from '@/lib/notifications/dispatch';
import { appBase, brandShell, ctaButton, escapeHtml } from '@/lib/leads/email-shell';
import {
  PAUSE_REASON_LABELS,
  type PauseReason,
} from '@fahybrid/shared/domain/coach/athlete-lifecycle';

/** Where coach-facing alerts land. Same convention as the lead funnel. */
function coachInbox(): string {
  return process.env.LEADS_NOTIFY_EMAIL ?? 'hello@fahybrid.com';
}

interface AthleteCard {
  athlete_id: bigint;
  full_name: string;
  /** Whole months since the athlete joined, for the "lleva contigo" line. */
  months_with_coach: number | null;
}

/**
 * The minimum context the coach needs to decide whether to pick up the phone: who,
 * and how long they have been around. Deliberately NOT adherence or race history —
 * those need the deep-dive queries, and a number that is expensive to get right is
 * worse in an email than no number at all.
 */
async function loadAthleteCard(athlete_id: bigint): Promise<AthleteCard | null> {
  const rows = await sql<
    { full_name: string | null; months: number | null }[]
  >`
    select
      coalesce(u.full_name, u.email)                                              as full_name,
      floor(extract(epoch from (now() - a.created_at)) / 2592000)::int            as months
    from athletes a
    join users u on u.id = a.user_id
    where a.id = ${athlete_id as unknown as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    athlete_id,
    full_name: row.full_name ?? 'Un atleta',
    months_with_coach: row.months,
  };
}

function tenureLine(card: AthleteCard): string {
  const m = card.months_with_coach;
  if (m === null || m < 1) return 'Lleva menos de un mes contigo.';
  if (m === 1) return 'Lleva un mes contigo.';
  return `Lleva ${m} meses contigo.`;
}

async function sendCoachEmail(subject: string, html: string, text: string): Promise<void> {
  const apiKey = AUTH_CONFIG.resendApiKey();
  if (!apiKey) {
    console.warn('[lifecycle-alerts] RESEND_API_KEY not configured — skipping', { subject });
    return;
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: AUTH_CONFIG.resendFromEmail(),
    to: coachInbox(),
    subject,
    text,
    html,
  });
  if (error) console.error('[lifecycle-alerts] send failed', { subject, error: error.message });
}

function fichaUrl(athlete_id: bigint): string {
  return `${appBase()}/es/atletas/${athlete_id.toString()}`;
}

/** The athlete paused from the app. Email + inbox row. */
export async function alertCoachPauseStarted(input: {
  athlete_id: bigint;
  reason: PauseReason;
  /** ISO day the athlete comes back. */
  returns_on: string;
  /** Days this pause costs them. */
  days: number;
  /** Days left in their budget afterwards. */
  available_after: number;
}): Promise<void> {
  const card = await loadAthleteCard(input.athlete_id);
  if (!card) return;
  const motivo = PAUSE_REASON_LABELS[input.reason];
  const vuelve = longDateEs(input.returns_on);

  await notifyCoach({
    sql,
    athlete_id: input.athlete_id,
    type: 'system',
    payload: {
      kind: 'athlete_paused',
      athlete_id: input.athlete_id.toString(),
      reason: input.reason,
      returns_on: input.returns_on,
    },
  }).catch(() => undefined);

  const text = [
    `${card.full_name} ha pausado su plan hasta el ${vuelve}.`,
    `Motivo: ${motivo}. ${input.days} días. ${tenureLine(card)}`,
    `Su plaza queda reservada y no se le cobra mientras dure.`,
    `Le quedan ${input.available_after} días de pausa este año.`,
    fichaUrl(input.athlete_id),
  ].join('\n');

  const html = brandShell(
    `<h1 style="margin:0 0 14px;font-size:22px;letter-spacing:-0.01em;">${escapeHtml(card.full_name)} ha pausado hasta el ${escapeHtml(vuelve)}</h1>` +
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444;">Lo ha hecho desde la app. Motivo: <b style="color:#0a0a0a;">${escapeHtml(motivo)}</b>, ${input.days} días. ${escapeHtml(tenureLine(card))}</p>` +
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444;">Su plaza queda <b style="color:#0a0a0a;">reservada</b> y el cobro está parado mientras dure. Vuelve solo el ${escapeHtml(vuelve)}. Le quedan ${input.available_after} días de pausa en los próximos doce meses.</p>` +
      ctaButton(fichaUrl(input.athlete_id), 'Abrir su ficha'),
  );

  await sendCoachEmail(`${card.full_name} en pausa hasta el ${vuelve}`, html, text);
}

/** The athlete scheduled their baja. Email + inbox row. */
export async function alertCoachBajaScheduled(input: {
  athlete_id: bigint;
  reason: PauseReason;
  /** ISO day the baja applies — the last day they have paid for. */
  scheduled_for: string;
  /** Days of runway the coach has to react. */
  days_left: number;
}): Promise<void> {
  const card = await loadAthleteCard(input.athlete_id);
  if (!card) return;
  const motivo = PAUSE_REASON_LABELS[input.reason];
  const dia = longDateEs(input.scheduled_for);

  await notifyCoach({
    sql,
    athlete_id: input.athlete_id,
    type: 'system',
    payload: {
      kind: 'athlete_baja_scheduled',
      athlete_id: input.athlete_id.toString(),
      reason: input.reason,
      scheduled_for: input.scheduled_for,
    },
  }).catch(() => undefined);

  const margen =
    input.days_left > 0
      ? `Entrena con normalidad hasta entonces: te quedan ${input.days_left} días con él, y hasta ese día puede echarse atrás.`
      : `Se aplica hoy mismo: no le quedaba periodo pagado por delante.`;

  const text = [
    `${card.full_name} se da de baja el ${dia}.`,
    `Lo ha hecho él desde la app. Motivo: ${motivo}. ${tenureLine(card)}`,
    margen,
    `Su plaza se libera el ${dia} y pasa a la lista de espera.`,
    fichaUrl(input.athlete_id),
  ].join('\n');

  const html = brandShell(
    `<h1 style="margin:0 0 14px;font-size:22px;letter-spacing:-0.01em;">${escapeHtml(card.full_name)} se da de baja el ${escapeHtml(dia)}</h1>` +
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444;">Lo ha hecho él desde la app hace un momento. Motivo: <b style="color:#0a0a0a;">${escapeHtml(motivo)}</b>. ${escapeHtml(tenureLine(card))}</p>` +
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444;">${escapeHtml(margen)}</p>` +
      ctaButton(fichaUrl(input.athlete_id), 'Abrir su ficha') +
      `<p style="margin:18px 0 0;font-size:12px;color:#999;">Su plaza se libera el ${escapeHtml(dia)} y pasa a la lista de espera.</p>`,
  );

  await sendCoachEmail(`Baja · ${card.full_name} se va el ${dia}`, html, text);
}

/** The athlete changed their mind before the baja landed. Inbox only — it is good news. */
export async function alertCoachBajaCanceled(athlete_id: bigint): Promise<void> {
  await notifyCoach({
    sql,
    athlete_id,
    type: 'system',
    payload: { kind: 'athlete_baja_canceled', athlete_id: athlete_id.toString() },
  }).catch(() => undefined);
}

/**
 * The lifecycle cron brought a paused athlete back. Inbox only, no email: it is
 * routine and it is on a date the coach already agreed to. What it IS worth is a
 * nudge to look at whether the block they left half-done still fits.
 */
export async function alertCoachAthleteReturned(athlete_id: bigint): Promise<void> {
  await notifyCoach({
    sql,
    athlete_id,
    type: 'system',
    payload: { kind: 'athlete_returned', athlete_id: athlete_id.toString() },
  }).catch(() => undefined);
}
