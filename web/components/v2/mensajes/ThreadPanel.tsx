// La columna central de Mensajes: la cabecera del atleta y su conversación.
//
// Aquí ya no vive nada del chat. Cargar, refrescar, enviar, adjuntar y borrar son
// de `Conversation`, que es el mismo componente que monta la pestaña de la ficha
// del atleta. Esta pieza solo pone quién es la persona con la que hablas y cómo
// llegar a su ficha.

'use client';

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { Conversation } from '@/components/v2/chat';
import type { MessageDTO } from '@/lib/chat/client';
import type { MensajesThread } from '@/lib/dashboard/v2/mensajes-types';

const ATHLETE_ROUTE = '/atletas';

export function ThreadPanel({
  thread,
  onActivity,
  onOpenContext,
  onBack,
  visible,
}: {
  thread: MensajesThread;
  /** Cada mensaje que se asienta en el hilo, para que la lista de la izquierda
   *  actualice su vista previa y su orden sin recargar la pantalla. */
  onActivity: (message: MessageDTO) => void;
  /** Solo en móvil: abre el panel de contexto (oculto en pantallas pequeñas). */
  onOpenContext?: () => void;
  /** Solo en móvil: vuelve a la lista de conversaciones (en md+ ya está al lado). */
  onBack?: () => void;
  /** Si el panel está realmente a la vista (en móvil vive montado pero tapado
   *  por la lista). Gobierna el acuse de lectura — ver useConversation.visible. */
  visible?: boolean;
}) {
  const ctx = thread.context;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-[color:var(--v2-border)] px-4 py-2.5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver a conversaciones"
            className="v2-focus -ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)] md:hidden"
          >
            <MIcon name="arrow_back" size={20} />
          </button>
        ) : null}
        <AthleteAvatar name={thread.athlete_name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-[color:var(--v2-fg)]">
              {thread.athlete_name}
            </span>
            {ctx ? <LevelBadge level={ctx.level} /> : null}
          </div>
          <span className="truncate text-xs text-[color:var(--v2-muted)]">
            {ctx?.phase_label ?? 'Sin plan activo'}
          </span>
        </div>
        {onOpenContext ? (
          <button
            type="button"
            onClick={onOpenContext}
            aria-label="Ver contexto del atleta"
            className="v2-focus flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)] xl:hidden"
          >
            <MIcon name="info" size={18} />
          </button>
        ) : null}
        <Link
          href={`${ATHLETE_ROUTE}/${thread.athlete_id}`}
          className="v2-focus inline-flex shrink-0 items-center gap-1 rounded-[var(--v2-r-s)] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
        >
          Ver perfil
          <MIcon name="open_in_new" size={13} />
        </Link>
      </div>

      <Conversation
        athleteId={thread.athlete_id}
        threadId={thread.thread_id}
        onActivity={onActivity}
        visible={visible}
        placeholder="Escribe una respuesta…"
        className="min-h-0 flex-1"
      />
    </div>
  );
}
