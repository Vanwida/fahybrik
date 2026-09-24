'use client';

// Los paneles globales del shell, montados una vez: «Asignar programa…» (la hoja
// de asignar a varios, con sus propios selectores de atletas y grupos) y la
// conversación con un atleta («Mensaje a…», ⌘Enter sobre un atleta en el ⌘K).
// Tras asignar o deshacer se refresca la ruta: las cifras de la barra cambian.

import { useRouter } from '@/i18n/navigation';
import { AssignSheet, ChatDrawer } from '@/components/v2/shared';
import type { ShellAction } from './destinations';
import { useShellOverlays } from './ShellContext';

/** Acciones cuyo panel aún no está montado → deshabilitadas. Hoy, ninguna. */
export const PENDING_ACTIONS: ReadonlySet<ShellAction> = new Set<ShellAction>();

/** ¿Hay conversación en panel? (⌘Enter en un atleta del ⌘K). */
export const CHAT_READY = !PENDING_ACTIONS.has('mensaje_a');

export function ShellOverlays() {
  const { assignOpen, closeAssign, chatWith, closeChat } = useShellOverlays();
  const router = useRouter();
  return (
    <>
      {assignOpen ? <AssignSheet open onClose={closeAssign} onAssigned={() => router.refresh()} /> : null}
      {chatWith ? (
        <ChatDrawer
          key={chatWith.id}
          open
          onOpenChange={(open) => {
            if (!open) closeChat();
          }}
          athleteId={chatWith.id}
          athleteName={chatWith.name}
        />
      ) : null}
    </>
  );
}
