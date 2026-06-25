// ChatBubble — one message in a v2 chat thread. Three visual variants drive the
// athlete↔coach conversation:
//   • athlete-left   → incoming, neutral surface, aligned left.
//   • coach-right    → outgoing, accent-soft fill, aligned right.
//   • attachment-dashed → a non-text payload (session attached, file): a dashed
//     outlined chip with an icon + label, alignment follows the sender.
// Pure presentational: alignment, fill and timestamp position are all derived
// from `role` + `variant`. Themed via v2 tokens; AA in both light and dark.

import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export type ChatBubbleRole = 'athlete' | 'coach';
export type ChatBubbleVariant = 'text' | 'attachment';

export interface ChatBubbleProps {
  role: ChatBubbleRole;
  /** Message body. For attachments, this is the human label (e.g. file name). */
  body: string;
  /** "text" = normal bubble; "attachment" = dashed payload chip. */
  variant?: ChatBubbleVariant;
  /** Localised time string already formatted by the caller (e.g. "14:32"). */
  time?: string | null;
  /** Optional icon (Material Symbols name) for an attachment chip. */
  attachment_icon?: string;
  /** True while an optimistic message is still in flight (dims + "enviando"). */
  pending?: boolean;
  className?: string;
}

export function ChatBubble({
  role,
  body,
  variant = 'text',
  time,
  attachment_icon = 'attach_file',
  pending = false,
  className,
}: ChatBubbleProps) {
  const isCoach = role === 'coach';

  return (
    <div
      className={cn('flex w-full', isCoach ? 'justify-end' : 'justify-start', className)}
    >
      <div className={cn('flex max-w-[78%] flex-col gap-0.5', isCoach ? 'items-end' : 'items-start')}>
        {variant === 'attachment' ? (
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-[var(--v2-r-m)] border border-dashed px-3 py-2 text-[13px] font-medium',
              'border-[color:var(--v2-border-strong)] text-[color:var(--v2-fg)] bg-[color:var(--v2-surface-2)]',
              pending && 'opacity-60',
            )}
          >
            <MIcon name={attachment_icon} size={17} className="text-[color:var(--v2-muted)]" />
            <span className="truncate">{body}</span>
          </span>
        ) : (
          <span
            className={cn(
              'rounded-[var(--v2-r-m)] px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words',
              isCoach
                ? 'bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-fg)] rounded-br-[var(--v2-r-xs)]'
                : 'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-fg)] rounded-bl-[var(--v2-r-xs)]',
              pending && 'opacity-60',
            )}
          >
            {body}
          </span>
        )}

        {(time || pending) && (
          <span className="v2-num px-1 text-[10px] text-[color:var(--v2-faint)]">
            {pending ? 'enviando…' : time}
          </span>
        )}
      </div>
    </div>
  );
}
