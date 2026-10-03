import 'server-only';

import {
  claimsAttention,
  communicationState,
  type CommunicationKind,
  type CommunicationStatus,
} from '@fahybrid/shared/domain/coach-communications';
import type { Sql } from '@/lib/db';

interface RecipientAttention {
  kind: CommunicationKind;
  status: CommunicationStatus;
  seen_at: string | null;
  done_at: string | null;
  answered_at: string | null;
}

/** Cuenta entregas vivas con la misma verdad de estado que la bandeja del atleta. */
export function countPendingCommunications(recipients: readonly RecipientAttention[]): number {
  return recipients.reduce((count, recipient) => (
    recipient.status === 'published' && claimsAttention(recipient.kind, communicationState(recipient))
      ? count + 1
      : count
  ), 0);
}

/** Sin límite de historial: solo publicaciones del coach a un atleta de su roster. */
export async function loadPendingCommunicationCount(params: {
  coach_id: number;
  athlete_id: number;
  client: Sql;
}): Promise<number> {
  const { coach_id, athlete_id, client } = params;
  const recipients = await client<RecipientAttention[]>`
    select c.kind, c.status,
      r.seen_at::text as seen_at, r.done_at::text as done_at, r.answered_at::text as answered_at
    from coach_communication_recipients r
    join coach_communications c on c.id = r.communication_id
    join athletes a on a.id = r.athlete_id
    where r.athlete_id = ${athlete_id}
      and a.coach_id = ${coach_id} and c.coach_id = ${coach_id}
      and c.status = 'published'
  `;
  return countPendingCommunications(recipients);
}
