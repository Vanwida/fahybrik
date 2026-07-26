// Puerta única al chat del dashboard.
//
// `Conversation` es lo que monta una pantalla; el resto son sus piezas y no se
// usan sueltas. `ChatLiveProvider` va POR ENCIMA de todo lo que enseñe chat en
// una pantalla: abre una sola conexión en vivo y la reparte.

export { Conversation, type ConversationProps } from './Conversation';
export { ChatLiveProvider, useChatLive, useChatLiveMessages } from './ChatLive';
export { useConversation, type UIMessage } from './useConversation';
