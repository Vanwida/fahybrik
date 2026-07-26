// El canal en vivo del chat, para toda la pantalla.
//
// UNA sola conexión SSE por pantalla, no una por conversación: el servidor
// suscribe al coach a todo lo suyo y cada mensaje trae su `thread_id`, así que
// abrir N conexiones para filtrar lo mismo N veces sería puro desperdicio. Cuelga
// de un contexto para que tanto la lista de conversaciones como el hilo abierto
// beban del mismo sitio.
//
// LA RECONEXIÓN NO ES GRATIS
// --------------------------
// El stream solo emite lo que nace DESPUÉS de conectar: el histórico lo carga el
// REST. Si la conexión se cae y vuelve, lo que pasó durante el hueco no lo cuenta
// nadie. Por eso el contexto expone `generation`, que sube cada vez que el canal
// se declara vivo — quien escucha usa ese número para releer y cerrar el hueco.

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MessageDTO } from '@/lib/chat/client';

const STREAM_PATH = '/api/chat/stream';

type Listener = (message: MessageDTO) => void;

interface ChatLiveValue {
  /** El canal está abierto y confirmado. Cuando es false, quien escucha sondea. */
  live: boolean;
  /** Sube en cada (re)conexión. Cambiar → releer para cubrir el hueco. */
  generation: number;
  subscribe: (listener: Listener) => () => void;
}

const ChatLiveContext = createContext<ChatLiveValue | null>(null);

export function ChatLiveProvider({ children }: { children: React.ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const [live, setLive] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    // La sesión del coach va en la cookie y EventSource la manda sola en el mismo
    // origen — por eso el canal en vivo del dashboard no necesita cabecera de
    // autorización (que EventSource, además, no admite).
    const source = new EventSource(STREAM_PATH);

    const onReady = () => {
      setLive(true);
      setGeneration((g) => g + 1);
    };
    const onMessage = (event: MessageEvent<string>) => {
      let dto: MessageDTO;
      try {
        dto = JSON.parse(event.data) as MessageDTO;
      } catch {
        return;
      }
      if (!dto?.id || !dto.thread_id) return;
      for (const listener of listeners.current) {
        try {
          listener(dto);
        } catch {
          // Un oyente roto no puede tumbar a los demás.
        }
      }
    };
    // EventSource reintenta solo; aquí únicamente marcamos que ahora mismo no hay
    // canal, que es lo que dispara el sondeo de respaldo.
    const onError = () => setLive(false);

    source.addEventListener('ready', onReady);
    source.addEventListener('message', onMessage as EventListener);
    source.addEventListener('error', onError);

    return () => {
      source.removeEventListener('ready', onReady);
      source.removeEventListener('message', onMessage as EventListener);
      source.removeEventListener('error', onError);
      source.close();
    };
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo<ChatLiveValue>(
    () => ({ live, generation, subscribe }),
    [live, generation, subscribe],
  );

  return <ChatLiveContext.Provider value={value}>{children}</ChatLiveContext.Provider>;
}

/**
 * El canal en vivo. Fuera del proveedor devuelve un canal apagado en vez de
 * reventar: una conversación montada sin proveedor sigue funcionando, solo que
 * sondeando. Es la degradación correcta para algo que es una mejora, no un
 * requisito.
 */
export function useChatLive(): ChatLiveValue {
  return useContext(ChatLiveContext) ?? OFFLINE;
}

const OFFLINE: ChatLiveValue = {
  live: false,
  generation: 0,
  subscribe: () => () => undefined,
};

/** Escucha los mensajes que llegan por el canal.
 *
 *  El oyente se guarda en una ref y se refresca en un efecto, no durante el
 *  render: escribir en una ref mientras se renderiza rompe con el render
 *  concurrente, que puede descartar un render a medias. Gracias a la ref, el
 *  oyente ve siempre estado fresco sin tener que re-suscribirse en cada render
 *  del padre. */
export function useChatLiveMessages(listener: Listener): void {
  const { subscribe } = useChatLive();
  const ref = useRef(listener);
  useEffect(() => {
    ref.current = listener;
  });
  useEffect(() => subscribe((m) => ref.current(m)), [subscribe]);
}
