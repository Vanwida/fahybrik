// GET /api/chat/stream
//
// Server-Sent Events feed of chat messages for the calling principal.
// Coach: subscribes to every thread in their cohort. Athlete: subscribes
// to their single thread. The stream emits one `event: message` frame per
// new message with the MessageDTO JSON shape (same as the messages POST
// response). Heartbeat ping every 30s to keep load balancers from
// closing the connection.
//
// Delivery is cross-instance via Postgres LISTEN/NOTIFY (see lib/chat/pubsub):
// the publishing POST may run on a different serverless instance than this open
// stream. If the LISTEN transport can't be established (no direct/unpooled
// connection), the handler short-polls the DB in-stream so it stays
// cross-instance-safe and never goes silent.
//
// Clients that can't open EventSource (older iOS WebViews) fall back to
// polling /api/chat/threads/[athlete_id]/messages.

import { sql } from '@/lib/db';
import { resolveChatPrincipal } from '@/lib/chat/auth';
import { jsonError } from '@/lib/api/responses';
import { subscribe } from '@/lib/chat/pubsub';
import { getMessageById, listNewMessages } from '@/lib/chat/service';
import type { MessageDTO } from '@/lib/chat/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 30_000;
// Only used when the LISTEN/NOTIFY transport is unavailable: the handler
// short-polls the DB so delivery stays cross-instance-safe instead of silent.
const POLL_FALLBACK_MS = 3_000;

export async function GET(req: Request): Promise<Response> {
  const principal = await resolveChatPrincipal(req);
  if (!principal) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
  }

  // Resolve thread ids the principal is allowed to see.
  let thread_ids: bigint[];
  if (principal.role === 'coach') {
    const rows = await sql<{ id: string }[]>`
      select id::text from chat_threads
      where coach_id = ${principal.coach_id as unknown as number}
    `;
    thread_ids = rows.map((r) => BigInt(r.id));
  } else {
    const rows = await sql<{ id: string }[]>`
      select id::text from chat_threads
      where athlete_id = ${principal.athlete_id as unknown as number}
    `;
    thread_ids = rows.map((r) => BigInt(r.id));
  }

  const encoder = new TextEncoder();
  const cleanups: Array<() => void> = [];
  let closed = false;

  const runCleanup = () => {
    if (closed) return;
    closed = true;
    for (const c of cleanups) {
      try {
        c();
      } catch {
        // Ignore cleanup errors.
      }
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Stream already closed.
        }
      };
      const emitMessage = (msg: MessageDTO) => {
        safeEnqueue(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
      };

      safeEnqueue(`event: ready\ndata: ${JSON.stringify({ thread_ids: thread_ids.map(String) })}\n\n`);

      const heartbeat = setInterval(() => {
        safeEnqueue(`: heartbeat ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);
      cleanups.push(() => clearInterval(heartbeat));

      // Cross-instance-safe DB poll, started ONLY when LISTEN/NOTIFY is
      // unavailable. Streams only messages created after connect (history is
      // loaded by the REST endpoint), advancing an exclusive timestamp cursor.
      const startPollFallback = async () => {
        if (closed) return;
        let cursor: string;
        try {
          const rows = await sql<{ now: string }[]>`select now()::text as now`;
          cursor = rows[0]!.now;
        } catch {
          cursor = new Date().toISOString();
        }
        if (closed) return;
        let polling = false;
        const tick = () => {
          if (closed || polling) return;
          polling = true;
          listNewMessages({ sql, thread_ids, after: cursor })
            .then(({ messages, cursor: next }) => {
              for (const m of messages) emitMessage(m);
              if (next) cursor = next;
            })
            .catch(() => undefined)
            .finally(() => {
              polling = false;
            });
        };
        const interval = setInterval(tick, POLL_FALLBACK_MS);
        cleanups.push(() => clearInterval(interval));
      };

      // Primary: Postgres LISTEN/NOTIFY (cross-instance). The notify carries
      // only ids; refetch the full DTO so the wire frame is byte-identical to
      // the REST `message` shape the iOS client parses.
      subscribe(thread_ids, (message_id) => {
        getMessageById(sql, message_id)
          .then((msg) => {
            if (msg) emitMessage(msg);
          })
          .catch(() => undefined);
      })
        .then((unsub) => {
          if (closed) {
            unsub?.();
            return;
          }
          if (unsub) {
            cleanups.push(unsub);
          } else {
            void startPollFallback();
          }
        })
        .catch(() => {
          if (!closed) void startPollFallback();
        });

      req.signal.addEventListener('abort', () => {
        runCleanup();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      runCleanup();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    },
  });
}
