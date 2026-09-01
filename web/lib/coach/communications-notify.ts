import 'server-only';

// Comunicado publicado → aviso al atleta. Aparte del servicio (igual que
// `lib/chat/notify.ts`) para que la publicación no arrastre el módulo de push
// dentro de su transacción.
//
// El aviso es CORTESÍA: la bandeja del atleta es el canal durable. Si el push
// falla, el comunicado sigue publicado y aparece igual al abrir la app — que es
// justo lo que hoy no pasa cuando el mensaje viaja por el chat y el push se
// pierde.

import type { Sql } from '@/lib/db';
import { notifyAthlete } from '@/lib/notifications/dispatch';
import type { CommunicationKind } from '@fahybrid/shared/domain/coach-communications';

const PREVIEW_MAX_CHARS = 140;

/** Lo que se lee en la pantalla de bloqueo cuando el comunicado no trae cuerpo.
 *  Una línea por tipo, en la voz del atleta: nada de «protocolo publicado». */
const FALLBACK_BODY: Record<CommunicationKind, string> = {
  protocol: 'Tu coach te ha dejado un protocolo para seguir paso a paso.',
  question: 'Tu coach necesita que elijas una opción.',
  task: 'Tienes algo que hacer con fecha.',
  note: 'Tu coach te ha dejado una nota.',
  focus: 'Tu coach te ha marcado un foco.',
};

function preview(text: string | null, kind: CommunicationKind): string {
  const trimmed = text?.trim();
  if (!trimmed) return FALLBACK_BODY[kind];
  return trimmed.length > PREVIEW_MAX_CHARS
    ? `${trimmed.slice(0, PREVIEW_MAX_CHARS - 1)}…`
    : trimmed;
}

export async function notifyCommunicationPublished(args: {
  sql: Sql;
  communication_id: string;
  kind: CommunicationKind;
  title: string;
  body: string | null;
  athlete_ids: number[];
}): Promise<void> {
  const { sql, communication_id, kind, title, body } = args;
  const message = preview(body, kind);

  for (const athlete_id of args.athlete_ids) {
    await notifyAthlete({
      sql,
      athlete_id: BigInt(athlete_id),
      type: 'coach_communication',
      payload: { communication_id, kind },
      push: {
        // El título del comunicado ES el título del aviso: el atleta reconoce
        // de qué le hablan antes de abrir.
        title,
        body: message,
        deeplink: { kind: 'communication', communication_id },
      },
    });
  }
}
