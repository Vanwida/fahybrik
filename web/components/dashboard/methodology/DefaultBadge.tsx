import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';
import type { FieldState } from '@/lib/dashboard/coach/methodology/rule-vm';

// "default Pablo · confirma" trust badge (spec §6). One per field state so the
// coach can scan what's been confirmed vs. still a prefilled default at a glance.
const STATE_CONFIG: Record<
  FieldState,
  { icon: string; label: string; cls: string }
> = {
  empty: {
    icon: 'circle',
    label: 'vacío',
    cls: 'text-[color:var(--text-muted)] border-[color:var(--border-subtle)]',
  },
  prefilled: {
    icon: 'auto_awesome_motion', // NOT sparkles — neutral "stacked default" glyph
    label: 'default Pablo · confirma',
    cls: 'text-[color:var(--warning)] border-[color:color-mix(in_srgb,var(--warning)_45%,var(--border-subtle))] bg-[color:color-mix(in_srgb,var(--warning)_8%,transparent)]',
  },
  edited: {
    icon: 'check_circle',
    label: 'confirmado',
    cls: 'text-[color:var(--ok)] border-[color:color-mix(in_srgb,var(--ok)_45%,var(--border-subtle))] bg-[color:color-mix(in_srgb,var(--ok)_8%,transparent)]',
  },
  ai_suggested: {
    icon: 'edit_note',
    label: 'sugerido · revisa',
    cls: 'text-[color:var(--z2)] border-[color:color-mix(in_srgb,var(--z2)_45%,var(--border-subtle))] bg-[color:color-mix(in_srgb,var(--z2)_8%,transparent)]',
  },
};

export function DefaultBadge({
  state,
  className,
}: {
  state: FieldState;
  className?: string;
}) {
  const c = STATE_CONFIG[state];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[var(--r-pill)] border px-2 py-0.5',
        'text-[10px] font-bold uppercase tracking-[0.06em]',
        c.cls,
        className,
      )}
    >
      <MIcon name={c.icon} size={12} />
      {c.label}
    </span>
  );
}
