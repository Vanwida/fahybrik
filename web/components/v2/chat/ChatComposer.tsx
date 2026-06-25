// ChatComposer — the message input row: attach button (📎) + auto-growing
// textarea + "Enviar". Controlled internally; emits the trimmed body via
// `onSend`. Enter submits, Shift+Enter inserts a newline. Enforces the coach
// body cap (single source: COACH_MESSAGE_BODY_MAX) and disables Enviar when the
// field is empty or a send is in flight. Themed + keyboard-navigable; the attach
// button carries an aria-label (icon-only). Reused by the Mensajes screen and the
// athlete-detalle Mensajes subtab.

'use client';

import { useRef, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { COACH_MESSAGE_BODY_MAX } from '@/lib/dashboard/chat/schema';
import { cn } from '@/lib/utils';

export interface ChatComposerProps {
  /** Sends the trimmed body. May be async; the field clears optimistically and
   *  the composer locks until the promise settles. */
  onSend: (body: string) => void | Promise<void>;
  /** Optional attach handler — when omitted the 📎 button is hidden. */
  onAttach?: () => void;
  placeholder?: string;
  /** External disable (e.g. thread still loading). */
  disabled?: boolean;
  className?: string;
}

export function ChatComposer({
  onSend,
  onAttach,
  placeholder = 'Escribe un mensaje…',
  disabled = false,
  className,
}: ChatComposerProps) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !sending && !disabled;

  async function submit() {
    if (!canSend) return;
    const body = trimmed;
    setSending(true);
    setValue('');
    // Reset the auto-grown height after clearing.
    if (taRef.current) taRef.current.style.height = 'auto';
    try {
      await onSend(body);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value.slice(0, COACH_MESSAGE_BODY_MAX);
    setValue(next);
    // Auto-grow up to ~5 rows.
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }

  return (
    <div
      className={cn(
        'flex items-end gap-2 border-t border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2.5',
        className,
      )}
    >
      {onAttach ? (
        <button
          type="button"
          onClick={onAttach}
          disabled={disabled}
          aria-label="Adjuntar"
          title="Adjuntar"
          className={cn(
            'v2-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--v2-r-s)]',
            'text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]',
            'disabled:opacity-50',
          )}
        >
          <MIcon name="attach_file" size={19} />
        </button>
      ) : null}

      <textarea
        ref={taRef}
        rows={1}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Mensaje"
        className={cn(
          'v2-focus min-h-9 flex-1 resize-none rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-bg)] px-3 py-2 text-[13px]',
          'text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)]',
          'focus:border-[color:var(--v2-border-strong)] disabled:opacity-50',
        )}
      />

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!canSend}
        className={cn(
          'v2-focus flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] px-3 text-[13px] font-semibold transition-colors',
          'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        <MIcon name="send" size={16} filled />
        Enviar
      </button>
    </div>
  );
}
