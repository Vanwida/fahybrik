'use client';

// La barra de la selección en Hoy: Hecho · Posponer ▾ · Mensaje a N · Asignar
// programa… «Mensaje a N» escribe UNA vez y lo manda a cada uno en su conversación.

import { useState } from 'react';
import { Check, ChevronDown, Clock, MessageCircle, UserPlus } from 'lucide-react';
import { CHAT_BODY_MAX } from '@/lib/chat/client';
import { BulkBar, Button, Dialog, Field, Menu, Textarea } from '@/components/v2/ui';
import type { SnoozeUntil } from '@/components/v2/shared/SnoozeMenu';
import { SNOOZE_OPTIONS } from './InboxRow';

export function HoyBulkBar({
  count,
  names,
  onClear,
  onDone,
  onSnooze,
  onAssign,
  onBroadcast,
}: {
  count: number;
  /** Los nombres seleccionados (para decir a quién se escribe). */
  names: string[];
  onClear: () => void;
  onDone: () => void;
  onSnooze: (until: SnoozeUntil) => void;
  onAssign: () => void;
  onBroadcast: (body: string) => Promise<boolean>;
}) {
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const to =
    names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} y ${names.length - 3} más`;

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    const ok = await onBroadcast(text);
    setSending(false);
    if (ok) {
      setBody('');
      setWriting(false);
    }
  };

  return (
    <>
      <BulkBar count={count} onClear={onClear}>
        <Button size="sm" variant="ghost" icon={Check} onClick={onDone}>
          Hecho
        </Button>
        <Menu
          side="top"
          align="center"
          width="min-w-44"
          trigger={
            <Button size="sm" variant="ghost" icon={Clock} iconEnd={ChevronDown}>
              Posponer
            </Button>
          }
          items={SNOOZE_OPTIONS.map((o) => ({ label: o.label, onSelect: () => onSnooze(o.until) }))}
        />
        <Button size="sm" variant="ghost" icon={MessageCircle} onClick={() => setWriting(true)}>
          {count === 1 ? 'Mensaje' : `Mensaje a ${count}`}
        </Button>
        <Button size="sm" variant="ghost" icon={UserPlus} onClick={onAssign}>
          Asignar programa…
        </Button>
      </BulkBar>
      <Dialog
        open={writing}
        onOpenChange={(o) => {
          if (!sending) setWriting(o);
        }}
        title={count === 1 ? 'Mensaje' : `Mensaje a ${count} atletas`}
        description={`Le llega a cada uno en su conversación: ${to}.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setWriting(false)} disabled={sending}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void send()} loading={sending} disabled={body.trim().length === 0}>
              {count === 1 ? 'Enviar' : `Enviar a ${count}`}
            </Button>
          </>
        }
      >
        <Field label="Mensaje">
          {({ id }) => (
          <Textarea
            id={id}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={CHAT_BODY_MAX}
            rows={5}
            autoFocus
            placeholder="Escribe una vez; cada atleta lo recibe a su nombre."
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void send();
              }
            }}
          />
          )}
        </Field>
      </Dialog>
    </>
  );
}
