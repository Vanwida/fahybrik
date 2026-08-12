// Una conversación: su historial, lo que llega en vivo y lo que sale.
//
// Es el único sitio del dashboard donde vive el estado de un hilo. Las dos
// pantallas que enseñan chat (Mensajes y la pestaña de la ficha del atleta) usan
// este hook, así que se comportan igual por construcción y no puede volver a
// pasar lo de antes: una refrescando cada 3s y la otra sin refrescar nunca.
//
// CÓMO SE MANTIENE AL DÍA
// -----------------------
// El canal SSE es la vía principal y no cuesta nada mientras está abierto. El
// sondeo solo arranca cuando el canal está caído, y se para en cuanto vuelve. Y
// en cada (re)conexión se relee el hilo, porque lo que pasó mientras no había
// canal no lo cuenta nadie.
//
// LOS MENSAJES PROPIOS LLEGAN DOS VECES
// -------------------------------------
// Uno por la respuesta del POST y otro por el eco del canal, en cualquier orden.
// Todo se guarda en un mapa por id y el id lo pone el servidor, así que el
// segundo en llegar actualiza en vez de duplicar. La burbuja optimista vive con
// un id local `local:N` y se retira en cuanto se conoce el id real.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChatError,
  deleteMessage,
  fetchMessages,
  markRead,
  sendMessage,
  uploadAttachment,
  type MessageDTO,
  type PendingAttachment,
} from '@/lib/chat/client';
import { useChatLive, useChatLiveMessages } from './ChatLive';

/** Cadencia del sondeo de respaldo, en ms. Solo corre con el canal caído. */
const POLL_INTERVAL_MS = 3000;
/** Cuántos mensajes trae la carga inicial y cada relectura. */
const PAGE_SIZE = 50;

const LOCAL_PREFIX = 'local:';
const isLocal = (id: string) => id.startsWith(LOCAL_PREFIX);

/** Un mensaje tal y como lo pinta la pantalla: el DTO del servidor más lo que
 *  solo existe en este navegador mientras el mensaje está en el aire. */
export type UIMessage = MessageDTO & {
  /** Aún volando (subiendo o enviando). */
  pending?: boolean;
  /** El envío falló; la burbuja se queda visible con opción de reintentar. */
  failed?: boolean;
  /** Vista previa local del adjunto, para verlo mientras sube. */
  local_preview_url?: string;
};

/** Orden de la conversación: por hora, y a igualdad, por id. Los optimistas
 *  llevan la hora de este navegador y se van al final, que es donde toca. */
function byTime(a: UIMessage, b: UIMessage): number {
  const delta = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (delta !== 0) return delta;
  if (isLocal(a.id) !== isLocal(b.id)) return isLocal(a.id) ? 1 : -1;
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}

export interface UseConversationOptions {
  /** El atleta con quien es la conversación. Identifica el hilo. */
  athleteId: string;
  /** Id del hilo, para quedarse solo con lo suyo del canal en vivo. */
  threadId: string;
  /** Primer tramo ya cargado en el servidor. Evita el parpadeo al abrir. */
  initialMessages?: MessageDTO[];
  /** Se dispara con cada mensaje que se asienta en el hilo (propio o del atleta),
   *  para que la lista de conversaciones actualice su vista previa y su orden. */
  onActivity?: (message: MessageDTO) => void;
  /** Si la conversación está realmente A LA VISTA. En móvil el panel vive
   *  montado pero tapado por la lista: lo que nadie ve no se marca leído.
   *  Por defecto true (en md+ el panel siempre está a la vista). */
  visible?: boolean;
}

export interface Conversation {
  messages: UIMessage[];
  /** Cargando el primer tramo. Falso desde el principio si vino del servidor. */
  loading: boolean;
  /** El historial no se pudo cargar. El fallo de un ENVÍO no entra aquí: ese se
   *  ve en su propia burbuja. */
  loadFailed: boolean;
  /** Aviso escrito para pantalla (adjunto rechazado, subida caída…). */
  notice: string | null;
  dismissNotice: () => void;
  live: boolean;
  reload: () => void;
  send: (input: { body?: string; attachment?: PendingAttachment }) => Promise<void>;
  retry: (localId: string) => Promise<void>;
  remove: (messageId: string) => Promise<void>;
}

export function useConversation(options: UseConversationOptions): Conversation {
  const { athleteId, threadId, initialMessages, onActivity, visible = true } = options;
  const { live, generation } = useChatLive();

  const [messages, setMessages] = useState<UIMessage[]>(() =>
    (initialMessages ?? []).slice().sort(byTime),
  );
  const [loading, setLoading] = useState(initialMessages == null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Callback en una ref: cambia de identidad en cada render del padre y no debe
  // arrastrar los efectos con él. Se refresca en un efecto, nunca durante el
  // render (escribir refs mientras se renderiza rompe con el render concurrente).
  const onActivityRef = useRef(onActivity);
  useEffect(() => {
    onActivityRef.current = onActivity;
  });

  // Contador de burbujas optimistas + lo que hace falta para reintentar una que
  // falló (el fichero elegido no está en el DTO y sin él no hay reintento).
  const localSeq = useRef(0);
  const retryable = useRef(new Map<string, { body?: string; attachment?: PendingAttachment }>());

  /** Mete o actualiza mensajes del servidor sin tirar los que están volando. */
  const ingest = useCallback((incoming: MessageDTO[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m] as const));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort(byTime);
    });
  }, []);

  // Marca que alguna vez llegó a haber historial. Distingue "se cayó la red un
  // momento" de "esto nunca ha cargado", que es la única situación en la que hay
  // que enseñar un error en vez de callarse.
  const everLoaded = useRef(initialMessages != null);

  const reload = useCallback(async () => {
    try {
      const { messages: page } = await fetchMessages(athleteId, { limit: PAGE_SIZE });
      ingest(page);
      everLoaded.current = true;
      setLoadFailed(false);
    } catch {
      // Un fallo suelto de red no vacía la conversación: se conserva lo último
      // bueno y el siguiente ciclo lo reintenta.
      if (!everLoaded.current) setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [athleteId, ingest]);

  // Carga inicial + relectura en cada (re)conexión del canal, para cubrir el
  // hueco en el que no había quien contara lo que pasaba.
  useEffect(() => {
    // Dentro de una función asíncrona a propósito: así ningún `setState` de
    // `reload` corre de forma síncrona al montar, que es lo que encadena renders.
    void (async () => {
      await reload();
    })();
  }, [reload, generation]);

  // Lo que llega en vivo. Se filtra por hilo: la conexión es de toda la pantalla.
  useChatLiveMessages((dto) => {
    if (dto.thread_id !== threadId) return;
    ingest([dto]);
    onActivityRef.current?.(dto);
  });

  // Sondeo de respaldo. Solo con el canal caído — con el canal vivo no se toca la
  // red en absoluto.
  useEffect(() => {
    if (live) return;
    const id = setInterval(() => void reload(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [live, reload]);

  // Acuse de lectura: al abrir y con cada mensaje del atleta que entra estando la
  // pantalla delante. Se manda solo cuando cambia el último mensaje del atleta,
  // no en cada render.
  const lastReadRef = useRef<string | null>(null);
  const newestIncomingId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i]!;
      if (m.sender_role === 'athlete') return m.id;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (!visible) return;
    if (!newestIncomingId || lastReadRef.current === newestIncomingId) return;
    lastReadRef.current = newestIncomingId;
    void markRead(athleteId, newestIncomingId);
  }, [athleteId, newestIncomingId, visible]);

  /** El envío de verdad, compartido por `send` y por `retry`. */
  const deliver = useCallback(
    async (localId: string, input: { body?: string; attachment?: PendingAttachment }) => {
      try {
        let attachmentUrl: string | undefined;
        let meta = input.attachment?.meta;
        if (input.attachment) {
          const uploaded = await uploadAttachment(athleteId, input.attachment);
          attachmentUrl = uploaded.url;
          meta = { ...meta, size_bytes: uploaded.size_bytes, mime_type: uploaded.mime_type };
        }
        const saved = await sendMessage(athleteId, {
          body: input.body,
          attachment_url: attachmentUrl,
          attachment_kind: input.attachment?.kind,
          attachment_meta: meta,
        });
        retryable.current.delete(localId);
        // Se retira la burbuja optimista y entra la real. Si el eco del canal se
        // adelantó, `ingest` actualiza en su sitio en vez de duplicar.
        setMessages((prev) => {
          const byId = new Map(prev.filter((m) => m.id !== localId).map((m) => [m.id, m] as const));
          byId.set(saved.id, saved);
          return [...byId.values()].sort(byTime);
        });
        onActivityRef.current?.(saved);
      } catch (err) {
        retryable.current.set(localId, input);
        setMessages((prev) =>
          prev.map((m) => (m.id === localId ? { ...m, pending: false, failed: true } : m)),
        );
        if (err instanceof ChatError && err.code !== 'internal') setNotice(err.message);
      }
    },
    [athleteId],
  );

  const send = useCallback(
    async (input: { body?: string; attachment?: PendingAttachment }) => {
      const trimmed = input.body?.trim();
      if (!trimmed && !input.attachment) return;
      localSeq.current += 1;
      const localId = `${LOCAL_PREFIX}${localSeq.current}`;
      const optimistic: UIMessage = {
        id: localId,
        thread_id: threadId,
        sender_user_id: 'self',
        sender_role: 'coach',
        body: trimmed ?? null,
        attachment_url: input.attachment ? input.attachment.preview_url : null,
        attachment_kind: input.attachment?.kind ?? null,
        attachment_meta: input.attachment?.meta ?? null,
        // Sin selector de contexto en el compositor del coach todavía — la
        // burbuja optimista nunca lleva uno; el real (si lo hubiera) llega en
        // el eco del servidor.
        context: null,
        created_at: new Date().toISOString(),
        read_at: null,
        edited_at: null,
        pending: true,
        local_preview_url: input.attachment?.preview_url,
      };
      setMessages((prev) => [...prev, optimistic].sort(byTime));
      await deliver(localId, { body: trimmed, attachment: input.attachment });
    },
    [threadId, deliver],
  );

  const retry = useCallback(
    async (localId: string) => {
      const input = retryable.current.get(localId);
      if (!input) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === localId ? { ...m, pending: true, failed: false } : m)),
      );
      await deliver(localId, input);
    },
    [deliver],
  );

  const remove = useCallback(
    async (messageId: string) => {
      // Una burbuja que nunca llegó a salir se descarta aquí y ya está.
      if (isLocal(messageId)) {
        retryable.current.delete(messageId);
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        return;
      }
      const previous = messages;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      try {
        await deleteMessage(athleteId, messageId);
      } catch (err) {
        setMessages(previous);
        setNotice(err instanceof ChatError ? err.message : 'No se pudo borrar el mensaje.');
      }
    },
    [athleteId, messages],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);
  const reloadNow = useCallback(() => void reload(), [reload]);

  return {
    messages,
    loading,
    loadFailed,
    notice,
    dismissNotice,
    live,
    reload: reloadNow,
    send,
    retry,
    remove,
  };
}
