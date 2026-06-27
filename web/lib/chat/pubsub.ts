// Cross-instance chat pub/sub over Postgres LISTEN/NOTIFY.
//
// Why this exists: the previous in-process `Map` only delivered a new message to
// SSE streams living in the SAME serverless instance as the POST that created
// it. On Vercel each request lands on an isolated instance, so a message
// published by POST /messages was invisible to an SSE stream held open on
// another instance — only the iOS poll fallback worked.
//
// Postgres LISTEN/NOTIFY makes delivery cross-instance: every instance LISTENs
// on one shared channel; publish issues NOTIFY; Postgres fans the notification
// out to every listening instance, which forwards it to its local SSE streams.
//
// Neon constraint (verified): the pooled (`-pooler`) endpoint runs PgBouncer in
// transaction mode and does NOT support session features like LISTEN/NOTIFY. We
// therefore open a dedicated DIRECT (unpooled) connection for pub/sub — using
// DATABASE_URL_UNPOOLED when set, otherwise deriving the direct host by stripping
// the `-pooler` marker. If no direct connection can be established the route
// degrades to an in-stream DB poll (also cross-instance-safe), never going silent.

import postgres from 'postgres';
import type { Sql } from '@/lib/db';

// Single shared channel. The payload carries ONLY ids (thread + message): chat
// bodies can be up to 8000 chars (~32 KB UTF-8), which would overflow Postgres'
// 8000-byte NOTIFY payload cap. The SSE route refetches the full MessageDTO by
// id so the wire frame stays byte-identical to the REST `message` shape.
const CHANNEL = 'chat_message';

type LocalSubscriber = {
  thread_ids: Set<string>;
  deliver: (messageId: string, threadId: string) => void;
};

type ListenHandle = { unlisten: () => Promise<void> };

type PubsubState = {
  client: Sql | null; // dedicated DIRECT (unpooled) connection
  clientResolved: boolean; // we attempted to build the client at least once
  listenHandle: ListenHandle | null;
  starting: Promise<boolean> | null;
  subscribers: Set<LocalSubscriber>;
};

declare global {
  var __fahybrik_chat_pubsub: PubsubState | undefined;
}

// Stored on globalThis so dev HMR doesn't leak duplicate LISTEN connections or
// orphan subscriber sets across module re-evaluation.
const state: PubsubState =
  globalThis.__fahybrik_chat_pubsub ??
  (globalThis.__fahybrik_chat_pubsub = {
    client: null,
    clientResolved: false,
    listenHandle: null,
    starting: null,
    subscribers: new Set(),
  });

// The direct (session-capable) host is the pooled host minus the `-pooler`
// marker. Prefer an explicit DATABASE_URL_UNPOOLED if provided. Returns null
// when no usable URL exists (caller then degrades to the in-stream poll).
function resolveDirectUrl(): string | null {
  const explicit = process.env.DATABASE_URL_UNPOOLED;
  if (explicit && explicit.length > 0) return explicit;
  const pooled = process.env.DATABASE_URL;
  if (!pooled) return null;
  try {
    const u = new URL(pooled);
    if (u.hostname.includes('-pooler')) {
      u.hostname = u.hostname.replace('-pooler', '');
    }
    return u.toString();
  } catch {
    return null;
  }
}

function getDirectClient(): Sql | null {
  if (state.clientResolved) return state.client;
  state.clientResolved = true;
  const url = resolveDirectUrl();
  if (!url) {
    state.client = null;
    return null;
  }
  state.client = postgres(url, {
    ssl: 'require',
    // 1 transient connection for NOTIFY; LISTEN holds its own dedicated one.
    max: 2,
    idle_timeout: 30,
    // Fail fast so a bad/unreachable direct host can't hang the SSE handler.
    connect_timeout: 10,
    prepare: false,
    types: { bigint: postgres.BigInt },
  }) as Sql;
  return state.client;
}

function onNotify(payload: string): void {
  let parsed: { t?: unknown; m?: unknown };
  try {
    parsed = JSON.parse(payload);
  } catch {
    return;
  }
  const threadId = typeof parsed.t === 'string' ? parsed.t : null;
  const messageId = typeof parsed.m === 'string' ? parsed.m : null;
  if (!threadId || !messageId) return;
  for (const sub of state.subscribers) {
    if (sub.thread_ids.has(threadId)) {
      try {
        sub.deliver(messageId, threadId);
      } catch {
        // Subscriber bug — skip.
      }
    }
  }
}

// Establish the single instance-wide LISTEN. postgres.js holds one dedicated
// connection for all listeners and re-issues LISTEN automatically on reconnect,
// so one call per instance suffices. Idempotent + retryable: a failed attempt
// resets so the next subscriber retries (transient Neon hiccups self-heal).
function ensureListening(): Promise<boolean> {
  if (state.listenHandle) return Promise.resolve(true);
  if (state.starting) return state.starting;
  state.starting = (async () => {
    const client = getDirectClient();
    if (!client) return false;
    try {
      state.listenHandle = await client.listen(CHANNEL, onNotify);
      return true;
    } catch {
      return false;
    } finally {
      state.starting = null;
    }
  })();
  return state.starting;
}

// Publish a new message to all instances. Best-effort: the message is already
// persisted, and the SSE poll fallback / iOS poll still deliver it if NOTIFY
// fails. Uses the direct connection because the pooled endpoint can't NOTIFY.
export async function publishMessage(thread_id: bigint, message_id: string): Promise<void> {
  const client = getDirectClient();
  if (!client) return;
  await client.notify(CHANNEL, JSON.stringify({ t: thread_id.toString(), m: message_id }));
}

// Subscribe the calling SSE stream to its threads. Returns an unsubscribe fn, or
// null when the LISTEN transport can't be established — the route then falls back
// to an in-stream DB poll (cross-instance-safe too).
export async function subscribe(
  thread_ids: bigint[],
  deliver: (messageId: string, threadId: string) => void,
): Promise<(() => void) | null> {
  const ok = await ensureListening();
  if (!ok) return null;
  const sub: LocalSubscriber = {
    thread_ids: new Set(thread_ids.map(String)),
    deliver,
  };
  state.subscribers.add(sub);
  return () => {
    state.subscribers.delete(sub);
  };
}
