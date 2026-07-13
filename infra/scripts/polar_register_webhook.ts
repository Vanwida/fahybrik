/**
 * Register (or inspect) the Polar AccessLink webhook subscription.
 *
 * Polar delivers one webhook PER CLIENT (not per user): once created, every
 * connected athlete's EXERCISE / SLEEP events POST to our single callback. This
 * script creates that subscription against the official v3 endpoint:
 *
 *   POST https://www.polaraccesslink.com/v3/webhooks
 *   Authorization: Basic base64(POLAR_CLIENT_ID:POLAR_CLIENT_SECRET)   (CLIENT creds)
 *   body: { "events": ["EXERCISE","SLEEP"], "url": "<callback>" }
 *
 * The response carries `signature_secret_key` EXACTLY ONCE — we print it with a
 * loud reminder to store it in POLAR_WEBHOOK_SECRET (the webhook route verifies
 * the HMAC with it). This script never persists the secret itself.
 *
 * Idempotent: Polar allows a single subscription per client, so if one already
 * exists the create returns a conflict — we then GET and print the existing
 * subscription instead of failing (its secret cannot be re-shown; delete+recreate
 * to rotate). `--dry-run` prints the exact request without sending it.
 *
 *   pnpm --filter @fahybrid/infra polar:register-webhook -- --dry-run
 *   pnpm --filter @fahybrid/infra polar:register-webhook -- --url=https://fahybrid.com/api/polar/webhook
 *
 * Env (loaded from .env.local when present, else the ambient environment):
 *   POLAR_CLIENT_ID, POLAR_CLIENT_SECRET   (required)
 *   POLAR_API_BASE                         (optional; default www.polaraccesslink.com)
 *   POLAR_OAUTH_CALLBACK_URL               (used to derive the target URL origin)
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

// Minimal .env.local loader (this script needs no DB, so it does not import _db).
function loadEnvLocal(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '..', '..', '.env.local');
  let raw: string;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const DEFAULT_API_BASE = 'https://www.polaraccesslink.com';
const DEFAULT_EVENTS = ['EXERCISE', 'SLEEP'];
const WEBHOOK_PATH = '/api/polar/webhook';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf('=');
  return eq >= 0 ? hit.slice(eq + 1) : '';
}

function resolveTargetUrl(): string {
  const override = arg('url');
  if (override) return override;
  const callback = process.env.POLAR_OAUTH_CALLBACK_URL;
  if (callback) {
    try {
      return new URL(WEBHOOK_PATH, new URL(callback).origin).toString();
    } catch {
      /* fall through */
    }
  }
  throw new Error(
    'Cannot determine target URL. Pass --url=https://<host>/api/polar/webhook or set POLAR_OAUTH_CALLBACK_URL.',
  );
}

function basicAuth(id: string, secret: string): string {
  return `Basic ${Buffer.from(`${id}:${secret}`, 'utf8').toString('base64')}`;
}

async function main(): Promise<void> {
  loadEnvLocal();

  const clientId = process.env.POLAR_CLIENT_ID;
  const clientSecret = process.env.POLAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('POLAR_CLIENT_ID and POLAR_CLIENT_SECRET are required.');
  }
  const apiBase = (process.env.POLAR_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
  const events = (arg('events')?.split(',').map((e) => e.trim()).filter(Boolean)) ?? DEFAULT_EVENTS;
  const targetUrl = resolveTargetUrl();
  const dryRun = process.argv.includes('--dry-run');

  const endpoint = `${apiBase}/v3/webhooks`;
  const body = JSON.stringify({ events, url: targetUrl });

  if (dryRun) {
    console.log('[polar:webhook] DRY RUN — would send:');
    console.log(`  POST ${endpoint}`);
    console.log(`  Authorization: Basic <base64(client_id:client_secret)>`);
    console.log(`  Content-Type: application/json`);
    console.log(`  Body: ${body}`);
    return;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: basicAuth(clientId, clientSecret),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body,
  });

  const text = await res.text();

  if (res.ok) {
    let parsed: { data?: { id?: string; url?: string; events?: string[]; signature_secret_key?: string } };
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
    const data = parsed.data ?? {};
    console.log('[polar:webhook] created.');
    console.log(`  id:     ${data.id ?? '(unknown)'}`);
    console.log(`  url:    ${data.url ?? targetUrl}`);
    console.log(`  events: ${(data.events ?? events).join(', ')}`);
    console.log('');
    console.log('  ┌───────────────────────────────────────────────────────────────');
    console.log('  │  SIGNATURE SECRET (shown ONCE — save it now):');
    console.log(`  │      ${data.signature_secret_key ?? '(missing in response!)'}`);
    console.log('  │  Store it as the env var  POLAR_WEBHOOK_SECRET  (do NOT commit).');
    console.log('  └───────────────────────────────────────────────────────────────');
    return;
  }

  // Conflict / already-exists → GET the existing subscription and report it
  // (idempotent). Polar returns 400/409 when a client already has a webhook.
  if (res.status === 400 || res.status === 409) {
    console.warn(`[polar:webhook] create returned ${res.status} — a subscription likely already exists.`);
    const existing = await fetch(endpoint, {
      method: 'GET',
      headers: { authorization: basicAuth(clientId, clientSecret), accept: 'application/json' },
    });
    const exText = await existing.text();
    if (existing.ok) {
      console.log('[polar:webhook] existing subscription(s):');
      console.log(`  ${exText}`);
      console.log(
        '  NOTE: the signature secret is only shown at creation. To rotate it, delete the\n' +
          '        webhook (DELETE /v3/webhooks/{id}) and re-run this script.',
      );
      return;
    }
    console.error(`[polar:webhook] could not list existing webhooks (${existing.status}): ${exText}`);
    process.exitCode = 1;
    return;
  }

  console.error(`[polar:webhook] create failed (${res.status}): ${text}`);
  process.exitCode = 1;
}

await main();
