// GET /api/chat/stream
//
// Server-Sent Events feed of chat messages for the calling principal.
// Coach: subscribes to every thread in their cohort. Athlete: subscribes
// to their single thread. The stream emits one `data:` event per
// new message with the MessageDTO JSON shape (same as the messages POST
// response). Heartbeat ping every 30s to keep load balancers from
// closing the connection.
//
// Clients that can't open EventSource (older iOS WebViews) fall back to
// polling /api/chat/threads/[athlete_id]/messages.

import { sql } from '@/lib/db';
import { resolveChatPrincipal } from '@/lib/chat/auth';
import { jsonError } from '@/lib/api/responses';
import { subscribeThread } from '@/lib/chat/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 30_000;

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
  const unsubscribers: Array<() => void> = [];

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Stream already closed.
        }
      };
      safeEnqueue(`event: ready\ndata: ${JSON.stringify({ thread_ids: thread_ids.map(String) })}\n\n`);

      for (const tid of thread_ids) {
        const unsub = subscribeThread(tid, (msg) => {
          const payload = JSON.stringify(msg);
          safeEnqueue(`event: message\ndata: ${payload}\n\n`);
        });
        unsubscribers.push(unsub);
      }

      const heartbeat = setInterval(() => {
        safeEnqueue(`: heartbeat ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      const cleanup = () => {
        clearInterval(heartbeat);
        for (const u of unsubscribers) u();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      for (const u of unsubscribers) u();
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
