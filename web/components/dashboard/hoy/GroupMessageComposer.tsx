'use client';

// GroupMessageComposer — the "Mensaje al grupo" cohort op (ACTUAR layer). The
// coach writes ONE message; on send it fans out to each selected athlete's OWN
// 1:1 thread (server-side, /api/coach/messages/broadcast). This is a clean scale
// gesture — one composer, N personal threads — never a group chat.
//
// Rides on the non-modal DetailSidePanel (same chrome as ThreadDrawer) so the
// queue stays visible behind it. Autogrow textarea, ⌘/Ctrl+Enter sends, 2000-char
// guard (the same COACH_MESSAGE_BODY_MAX the 1:1 composer enforces). The actual
// send + toast live in the parent (TriageQueue) so this stays presentational and
// preview-renderable; this owns only the draft + the recipient summary.

import { useEffect, useRef, useState } from 'react';
import { DetailSidePanel } from '@/components/dashboard/ui';
import { MIcon } from '@/components/ui/MIcon';
import { COACH_MESSAGE_BODY_MAX } from '@/lib/dashboard/chat/schema';
import { cn } from '@/lib/utils';

/** Autogrow ceiling for the composer textarea (px) before it scrolls internally. */
const COMPOSER_MAX_HEIGHT_PX = 200;

export interface GroupMessageRecipient {
  athlete_id: string;
  athlete_name: string;
}

export interface GroupMessageComposerProps {
  open: boolean;
  onClose: () => void;
  /** Distinct athletes the message will reach (deduped by the parent). */
  recipients: ReadonlyArray<GroupMessageRecipient>;
  /** Send the body to every recipient; parent does the broadcast + toast. */
  onSend: (body: string) => Promise<void> | void;
  /** True while the broadcast is in flight (disables the send button). */
  sending?: boolean;
}

export function GroupMessageComposer({
  open,
  onClose,
  recipients,
  onSend,
  sending = false,
}: GroupMessageComposerProps) {
  const [draft, setDraft] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Reset the draft each time the composer opens (canonical sync-external-state).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setDraft('');
      requestAnimationFrame(() => textRef.current?.focus());
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Autogrow up to a max, then scroll inside the textarea.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, [draft]);

  const trimmedLen = draft.trim().length;
  const overLimit = draft.length > COACH_MESSAGE_BODY_MAX;
  const canSend = trimmedLen > 0 && !overLimit && !sending && recipients.length > 0;

  const submit = () => {
    if (!canSend) return;
    void onSend(draft.trim());
  };

  const count = recipients.length;
  const names = recipients.map((r) => r.athlete_name);
  const summary =
    count === 0
      ? 'Sin destinatarios'
      : count <= 3
        ? names.join(', ')
        : `${names.slice(0, 2).join(', ')} y ${count - 2} más`;

  return (
    <DetailSidePanel
      open={open}
      onClose={onClose}
      eyebrow="Mensaje al grupo"
      title={`${count} ${count === 1 ? 'atleta' : 'atletas'}`}
      width="md"
    >
      <div className="flex h-full min-h-0 flex-col">
        <p className="mb-3 text-[12.5px] leading-relaxed text-[color:var(--text-muted)]">
          Cada atleta recibe el mensaje en su conversación individual. Llega a:{' '}
          <span className="font-semibold text-[color:var(--fg)]">{summary}</span>.
        </p>

        <textarea
          ref={textRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={4}
          maxLength={COACH_MESSAGE_BODY_MAX + 200}
          placeholder="Escribe un mensaje para el grupo…"
          aria-label="Mensaje para el grupo"
          className="focus-ring min-h-[120px] w-full resize-none rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] px-3 py-2.5 text-[13.5px] leading-snug text-[color:var(--fg)] placeholder:text-[color:var(--text-muted)]"
        />

        <div className="mt-1 flex items-center justify-between px-1">
          {overLimit ? (
            <p className="text-[11px] text-[color:var(--danger)]" role="alert">
              Máx. {COACH_MESSAGE_BODY_MAX} caracteres ({draft.length}).
            </p>
          ) : (
            <span />
          )}
          <span
            className={cn(
              'metric-num text-[11px]',
              overLimit ? 'text-[color:var(--danger)]' : 'text-[color:var(--text-muted)]',
            )}
          >
            {draft.length}/{COACH_MESSAGE_BODY_MAX}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2 border-t border-[color:var(--border-subtle)] pt-3">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring inline-flex items-center rounded-[var(--r-m)] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container)] hover:text-[color:var(--fg)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="focus-ring inline-flex items-center gap-2 rounded-[var(--r-m)] bg-[color:var(--accent)] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MIcon name="send" size={15} filled />
            {sending ? 'Enviando…' : `Enviar a ${count}`}
          </button>
        </div>
      </div>
    </DetailSidePanel>
  );
}
