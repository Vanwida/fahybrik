// GET /api/chat/stream
//
// Canal de mensajes en vivo (Server-Sent Events) para quien llama. El coach ve
// todo lo de su cohorte; el atleta, lo suyo. Emite una trama `event: message` por
// mensaje nuevo con la MISMA forma que devuelve el POST de mensajes, y un latido
// cada 30s para que ningún balanceador cierre la conexión por inactividad.
//
// El reparto es entre instancias vía Postgres LISTEN/NOTIFY (ver lib/chat/pubsub):
// el POST que publica puede correr en una instancia distinta de la que sostiene
// este stream abierto. Si no se puede establecer el LISTEN (sin conexión directa
// disponible), el handler sondea la base desde dentro del propio stream, así que
// sigue siendo seguro entre instancias y nunca se queda mudo.
//
// La suscripción es por DUEÑO (coach o atleta), no por una lista de hilos fijada
// al conectar: un hilo que nace mientras la pantalla está abierta —el atleta que
// escribe por primera vez— entra sin reconectar.
//
// Los clientes que no pueden abrir un EventSource caen a sondear
// /api/chat/threads/[athlete_id]/messages.

import { sql } from '@/lib/db';
import { resolveChatPrincipal } from '@/lib/chat/auth';
import { jsonError } from '@/lib/api/responses';
import { subscribe, type ChatScope } from '@/lib/chat/pubsub';
import { getMessageById, latestMessageId, listNewMessagesForScope } from '@/lib/chat/service';
import type { MessageDTO } from '@/lib/chat/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 30_000;
// Solo se usa cuando el transporte LISTEN/NOTIFY no está disponible: el handler
// sondea la base para que el reparto siga siendo seguro entre instancias.
const POLL_FALLBACK_MS = 3_000;

export async function GET(req: Request): Promise<Response> {
  const principal = await resolveChatPrincipal(req);
  if (!principal) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
  }

  const scope: ChatScope =
    principal.role === 'coach'
      ? { role: 'coach', id: principal.coach_id }
      : { role: 'athlete', id: principal.athlete_id };

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
        // Ignorar errores de limpieza.
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
          // El stream ya está cerrado.
        }
      };
      const emitMessage = (msg: MessageDTO) => {
        safeEnqueue(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
      };

      // `ready` confirma la suscripción. Lleva el ámbito (no una lista de hilos):
      // desde que el reparto filtra por dueño, los hilos que existan AHORA mismo
      // no cambian lo que este stream va a recibir.
      safeEnqueue(
        `event: ready\ndata: ${JSON.stringify({ role: scope.role, id: scope.id.toString() })}\n\n`,
      );

      const heartbeat = setInterval(() => {
        safeEnqueue(`: heartbeat ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);
      cleanups.push(() => clearInterval(heartbeat));

      // Sondeo de respaldo, seguro entre instancias, arrancado SOLO si el
      // LISTEN/NOTIFY no está disponible. Emite únicamente lo creado después de
      // conectar (el histórico lo carga el REST), avanzando un cursor exclusivo.
      const startPollFallback = async () => {
        if (closed) return;
        // El cursor es un id de mensaje, no una hora: un timestamptz que viaja
        // como parámetro pierde los microsegundos y el sondeo reenviaría en bucle
        // lo que ya había mandado. Si la consulta falla, se arranca en 0 y la
        // primera vuelta descarta el histórico contra lo que ya tiene el cliente.
        let cursor: string;
        try {
          cursor = await latestMessageId(sql);
        } catch {
          cursor = '0';
        }
        if (closed) return;
        let polling = false;
        const tick = () => {
          if (closed || polling) return;
          polling = true;
          listNewMessagesForScope({ sql, scope, after: cursor })
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

      // Vía principal: Postgres LISTEN/NOTIFY (entre instancias). El aviso solo
      // lleva ids; recomponemos el DTO completo para que la trama sea idéntica a
      // la forma `message` del REST que parsean los clientes.
      subscribe(scope, (message_id) => {
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
          // Ya cerrado.
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
