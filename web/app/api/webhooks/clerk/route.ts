import { Webhook } from 'svix';
import { sql } from '@/lib/db';
import { deriveDisplayNameFromClerk } from '@/lib/identity/display-name';

// Clerk → DB sync webhook.
//
// This is the SCALABLE mechanism behind user provisioning: every signup and
// profile change in Clerk fires here and is upserted into our `users` table,
// keyed by `clerk_user_id`. We NEVER hand-write user rows or edit a name in
// SQL — Clerk is the system of record for identity, this route mirrors it.
//
// Security: payload is verified with svix against CLERK_WEBHOOK_SIGNING_SECRET.
// If that secret is missing, the route FAILS CLOSED (500) — we never process an
// unverified body. This endpoint must stay PUBLIC (Clerk calls it
// server-to-server, no user session) and excluded from Clerk route protection.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNING_SECRET_ENV = 'CLERK_WEBHOOK_SIGNING_SECRET';

// Minimal shapes of the Clerk webhook payloads we consume. We only read the
// fields we sync — Clerk sends much more.
interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

interface ClerkUserData {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
}

interface ClerkDeletedData {
  id: string;
  deleted?: boolean;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserData & ClerkDeletedData;
}

/** Resolve the primary email string from a Clerk user payload. */
function resolvePrimaryEmail(data: ClerkUserData): string | null {
  const addresses = data.email_addresses ?? [];
  if (addresses.length === 0) return null;
  const primary =
    addresses.find((a) => a.id === data.primary_email_address_id) ?? addresses[0];
  return primary?.email_address?.trim() || null;
}

/**
 * UPSERT the user row keyed by clerk_user_id, and keep any linked coach's
 * full_name in sync with the derived display name. Returns nothing — side
 * effect only.
 */
async function syncUser(data: ClerkUserData): Promise<void> {
  const clerk_user_id = data.id;
  const email = resolvePrimaryEmail(data);
  if (!email) {
    // Clerk should always send a primary email for user.created/updated. If it
    // doesn't, we can't satisfy users.email NOT NULL — skip rather than guess.
    return;
  }

  const display_name = deriveDisplayNameFromClerk({
    first_name: data.first_name,
    last_name: data.last_name,
    username: data.username,
    primary_email: email,
  });

  await sql.begin(async (tx) => {
    // Upsert keyed by clerk_user_id. If a row already exists for this email
    // (e.g. provisioned by another flow before Clerk linked it), adopt it by
    // matching on email and stamping the clerk_user_id. New rows get a role:
    // users.role is NOT NULL with no default, so brand-new Clerk signups need a
    // value — 'athlete' is the safe least-privilege default. Authorization
    // (admin/coach) is granted via user_roles, never inferred here.
    //
    // TODO Fase 3: role/coach/athlete domain-row provisioning for brand-new
    // users (intake flow) — do NOT guess roles or create coach/athlete rows
    // here. This route only guarantees the users row exists + stays in sync.
    const rows = await tx<{ id: string }[]>`
      insert into users (clerk_user_id, email, role)
      values (${clerk_user_id}, ${email}, 'athlete')
      on conflict (clerk_user_id) where clerk_user_id is not null
      do update set
        email = excluded.email,
        updated_at = now(),
        deleted_at = null
      returning id::text as id
    `;

    let user_id = rows[0]?.id ?? null;

    // If the conflict target didn't match (no existing clerk_user_id row) but a
    // row already exists for this email, link it instead of creating a dup.
    if (!user_id) {
      const linked = await tx<{ id: string }[]>`
        update users
        set clerk_user_id = ${clerk_user_id}, updated_at = now()
        where email = ${email} and clerk_user_id is null
        returning id::text as id
      `;
      user_id = linked[0]?.id ?? null;
    }

    if (!user_id) return;

    // Keep a linked coach's full_name in sync with the derived display name.
    // Only update when we have a non-empty name (never blank out an existing
    // name with a fallback that resolved to '').
    if (display_name) {
      await tx`
        update coaches
        set full_name = ${display_name}, updated_at = now()
        where user_id = ${BigInt(user_id)}
      `;
    }
  });
}

/** Soft-delete the user row matching the deleted Clerk user. */
async function softDeleteUser(data: ClerkDeletedData): Promise<void> {
  await sql`
    update users
    set deleted_at = now(), updated_at = now()
    where clerk_user_id = ${data.id} and deleted_at is null
  `;
}

export async function POST(req: Request): Promise<Response> {
  const signing_secret = process.env[SIGNING_SECRET_ENV];
  if (!signing_secret) {
    // Fail closed: never process an unverifiable payload.
    return new Response('webhook signing secret not configured', { status: 500 });
  }

  const svix_id = req.headers.get('svix-id');
  const svix_timestamp = req.headers.get('svix-timestamp');
  const svix_signature = req.headers.get('svix-signature');
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('missing svix headers', { status: 400 });
  }

  const body = await req.text();

  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(signing_secret);
    event = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as ClerkWebhookEvent;
  } catch {
    return new Response('invalid signature', { status: 400 });
  }

  switch (event.type) {
    case 'user.created':
    case 'user.updated':
      await syncUser(event.data);
      break;
    case 'user.deleted':
      await softDeleteUser(event.data);
      break;
    default:
      // Acknowledge unhandled event types so Clerk doesn't retry them.
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
