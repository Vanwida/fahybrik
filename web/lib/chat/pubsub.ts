// Reparto de mensajes de chat entre instancias, sobre Postgres LISTEN/NOTIFY.
//
// Por qué existe: un `Map` en memoria solo entregaba el mensaje nuevo a los
// streams SSE vivos en LA MISMA instancia serverless que el POST que lo creó. En
// Vercel cada petición cae en una instancia aislada, así que un mensaje publicado
// por POST /messages era invisible para un stream abierto en otra — solo el
// sondeo de respaldo lo salvaba.
//
// LISTEN/NOTIFY lo arregla: cada instancia escucha un canal compartido, publicar
// emite un NOTIFY, y Postgres lo reparte a todas las que escuchan, que lo pasan a
// sus streams locales.
//
// Restricción de Neon (verificada): el endpoint agrupado (`-pooler`) corre
// PgBouncer en modo transacción y NO soporta funciones de sesión como
// LISTEN/NOTIFY. Por eso abrimos una conexión DIRECTA (sin pooler) dedicada —
// DATABASE_URL_UNPOOLED si está, si no derivando el host directo quitando el
// marcador `-pooler`. Si no se puede establecer ninguna, la ruta del stream cae a
// un sondeo interno de la base (también seguro entre instancias) y nunca se queda
// muda.
//
// A QUIÉN LE LLEGA CADA MENSAJE
// -----------------------------
// El aviso lleva los DUEÑOS del hilo (coach y atleta) y cada suscriptor filtra
// por el suyo. NO se suscribe a una lista de hilos: esa lista se resolvía al
// conectar y dejaba fuera el caso que más importa — el atleta que escribe por
// primera vez, cuyo hilo NACE después de que el coach abriera la pantalla. Con el
// filtro por dueño, un hilo nuevo entra sin reconectar.

import postgres from 'postgres';
import type { Sql } from '@/lib/db';

// Canal único. El cuerpo lleva SOLO ids: un mensaje puede tener 8000 caracteres
// (~32 KB en UTF-8) y reventaría el tope de 8000 bytes del payload de NOTIFY. El
// stream recompone el DTO completo por id, así que la trama que sale por el cable
// es idéntica a la que devuelve el REST.
const CHANNEL = 'chat_message';

/** A quién pertenece una escucha: un coach ve todo lo de su cohorte, un atleta
 *  solo lo suyo. Los ids son los de `chat_threads` (coaches.id / athletes.id). */
export type ChatScope =
  | { role: 'coach'; id: bigint }
  | { role: 'athlete'; id: bigint };

/** Lo que viaja en el NOTIFY. Claves de una letra porque el payload va justo. */
type NotifyPayload = {
  /** thread_id */ t: string;
  /** message_id */ m: string;
  /** coach_id */ c: string;
  /** athlete_id */ a: string;
};

type LocalSubscriber = {
  scope: ChatScope;
  deliver: (messageId: string, threadId: string) => void;
};

type ListenHandle = { unlisten: () => Promise<void> };

type PubsubState = {
  client: Sql | null; // conexión DIRECTA (sin pooler) dedicada
  clientResolved: boolean; // ya intentamos construirla al menos una vez
  listenHandle: ListenHandle | null;
  starting: Promise<boolean> | null;
  subscribers: Set<LocalSubscriber>;
};

declare global {
  var __fahybrik_chat_pubsub: PubsubState | undefined;
}

// Vive en globalThis para que el HMR de desarrollo no deje conexiones LISTEN
// duplicadas ni conjuntos de suscriptores huérfanos al recargar el módulo.
const state: PubsubState =
  globalThis.__fahybrik_chat_pubsub ??
  (globalThis.__fahybrik_chat_pubsub = {
    client: null,
    clientResolved: false,
    listenHandle: null,
    starting: null,
    subscribers: new Set(),
  });

// El host directo (con sesión) es el agrupado menos el marcador `-pooler`. Si hay
// un DATABASE_URL_UNPOOLED explícito, ese manda. Null cuando no hay ninguna URL
// usable (el llamante cae entonces al sondeo interno).
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
    // 1 conexión transitoria para el NOTIFY; el LISTEN se queda con la suya.
    max: 2,
    idle_timeout: 30,
    // Fallar rápido para que un host directo caído no cuelgue el handler del SSE.
    connect_timeout: 10,
    prepare: false,
    types: { bigint: postgres.BigInt },
  }) as Sql;
  return state.client;
}

/** True cuando este aviso le toca a este suscriptor. */
export function payloadMatchesScope(payload: NotifyPayload, scope: ChatScope): boolean {
  const owner = scope.role === 'coach' ? payload.c : payload.a;
  return owner === scope.id.toString();
}

/** Valida y normaliza el cuerpo del NOTIFY. Null si viene malformado. */
export function parseNotifyPayload(raw: string): NotifyPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  if (
    typeof p.t !== 'string' ||
    typeof p.m !== 'string' ||
    typeof p.c !== 'string' ||
    typeof p.a !== 'string'
  ) {
    return null;
  }
  return { t: p.t, m: p.m, c: p.c, a: p.a };
}

function onNotify(raw: string): void {
  const payload = parseNotifyPayload(raw);
  if (!payload) return;
  for (const sub of state.subscribers) {
    if (!payloadMatchesScope(payload, sub.scope)) continue;
    try {
      sub.deliver(payload.m, payload.t);
    } catch {
      // Fallo del suscriptor — saltar, no tumbar el reparto de los demás.
    }
  }
}

// Establece el LISTEN único de la instancia. postgres.js mantiene una conexión
// dedicada para todos los escuchantes y reemite el LISTEN al reconectar, así que
// una llamada por instancia basta. Idempotente y reintentable: un intento fallido
// se resetea para que el siguiente suscriptor lo vuelva a probar (los cortes
// transitorios de Neon se curan solos).
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

// Publica un mensaje nuevo a todas las instancias. Best-effort: el mensaje ya
// está guardado, y el sondeo de respaldo del SSE / el de iOS lo entregan igual si
// el NOTIFY falla. Va por la conexión directa porque la agrupada no puede NOTIFY.
export async function publishMessage(args: {
  thread_id: string;
  message_id: string;
  coach_id: string;
  athlete_id: string;
}): Promise<void> {
  const client = getDirectClient();
  if (!client) return;
  const payload: NotifyPayload = {
    t: args.thread_id,
    m: args.message_id,
    c: args.coach_id,
    a: args.athlete_id,
  };
  await client.notify(CHANNEL, JSON.stringify(payload));
}

// Suscribe el stream SSE que llama a todo lo que ese principal puede ver.
// Devuelve la función para darse de baja, o null cuando no se pudo establecer el
// transporte LISTEN — la ruta cae entonces al sondeo interno (también seguro
// entre instancias).
export async function subscribe(
  scope: ChatScope,
  deliver: (messageId: string, threadId: string) => void,
): Promise<(() => void) | null> {
  const ok = await ensureListening();
  if (!ok) return null;
  const sub: LocalSubscriber = { scope, deliver };
  state.subscribers.add(sub);
  return () => {
    state.subscribers.delete(sub);
  };
}
