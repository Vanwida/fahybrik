'use client';

// «Enviar a varios»: un mensaje que llega a cada atleta en SU conversación
// (nunca un chat de grupo). Se eligen atletas y/o grupos; el servidor resuelve
// los grupos a sus miembros activos, quita repetidos y valida que todo es del
// coach antes de mandar nada.

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button, Dialog, Field, Kbd, Textarea, useToast } from '@/components/v2/ui';
import { AthletePicker, GroupPicker, type PickedAthlete, type PickedGroup } from '@/components/v2/shared';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { CHAT_BODY_MAX } from '@/lib/chat/client';

interface BroadcastResult {
  recipients: number;
  sent: number;
  failed: number;
  failed_ids: string[];
}

export function BroadcastDialog({
  open,
  onOpenChange,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tras enviar (la bandeja se relee: esas conversaciones pasan a «al día»). */
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [athletes, setAthletes] = useState<PickedAthlete[]>([]);
  const [groups, setGroups] = useState<PickedGroup[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasTarget = athletes.length + groups.length > 0;
  const canSend = hasTarget && body.trim().length > 0 && !sending;

  const reset = () => {
    setAthletes([]);
    setGroups([]);
    setBody('');
    setError(null);
  };

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiJson<BroadcastResult>('/api/coach/messages/broadcast', {
        method: 'POST',
        body: {
          athlete_ids: athletes.map((a) => a.id),
          group_ids: groups.map((g) => g.id),
          body: body.trim(),
        },
      });
      onSent();
      if (res.failed > 0) {
        const byId = new Map(athletes.map((a) => [a.id, a.label]));
        const names = res.failed_ids.map((id) => byId.get(id)).filter(Boolean);
        toast({
          title: `Enviado a ${res.sent} de ${res.recipients}`,
          description: names.length ? `No llegó a ${names.join(', ')}` : `${res.failed} no se pudieron enviar`,
          tone: 'danger',
        });
      } else {
        toast({ title: `Enviado a ${res.sent} ${res.sent === 1 ? 'atleta' : 'atletas'}`, description: 'cada uno en su conversación', tone: 'ok' });
      }
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, 'No se ha podido enviar. Vuelve a probar.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!sending) onOpenChange(next);
      }}
      title="Enviar a varios"
      description="Cada atleta lo recibe en su conversación contigo."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button variant="primary" icon={Send} loading={sending} disabled={!canSend} onClick={() => void send()}>
            Enviar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Atletas">
          {({ id }) => <AthletePicker id={id} value={athletes} onValueChange={setAthletes} />}
        </Field>
        <Field label="Grupos" optional>
          {({ id }) => <GroupPicker id={id} value={groups} onValueChange={setGroups} />}
        </Field>
        <Field label="Mensaje" error={error ?? undefined} hint={<span className="inline-flex items-center gap-1"><Kbd>⌘</Kbd><Kbd>Enter</Kbd> envía</span>}>
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, CHAT_BODY_MAX))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Escribe el mensaje…"
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
