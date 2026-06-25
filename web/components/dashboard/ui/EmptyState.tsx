// EmptyState — the explicit "nothing here, and that's fine" surface that makes
// the triage queue's tend-to-zero goal legible (SPEC §1/§4). Three variants:
//   • inbox-zero  → "Todo revisado." (the win state, big display headline)
//   • first-run   → "Nuevo atleta" (0 athletes → invite/onboard)
//   • filtered    → a lens/filter returned nothing (offer to clear)
// Presentational: copy + optional action are props so /hoy supplies context.

import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

export type EmptyStateVariant = 'inbox-zero' | 'first-run' | 'filtered';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: string;
}

export interface EmptyStateProps {
  variant?: EmptyStateVariant;
  /** Headline; defaults per variant. */
  title?: string;
  /** Supporting line under the headline. */
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

interface VariantPreset {
  icon: string;
  iconColor: string;
  defaultTitle: string;
  /** inbox-zero gets the oversized display headline (the celebratory win). */
  display: boolean;
}

const PRESETS: Record<EmptyStateVariant, VariantPreset> = {
  'inbox-zero': {
    icon: 'check_circle',
    iconColor: 'var(--ok)',
    defaultTitle: 'Todo revisado',
    display: true,
  },
  'first-run': {
    icon: 'person_add',
    iconColor: 'var(--text-muted)',
    defaultTitle: 'Aún no tienes atletas',
    display: false,
  },
  filtered: {
    icon: 'filter_alt_off',
    iconColor: 'var(--text-muted)',
    defaultTitle: 'Nada con este filtro',
    display: false,
  },
};

export function EmptyState({
  variant = 'inbox-zero',
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const preset = PRESETS[variant];
  const heading = title ?? preset.defaultTitle;

  return (
    <section
      aria-label={heading}
      className={cn(
        'card-elevated flex flex-col items-center px-6 py-12 text-center hover:border-[color:var(--border-subtle)]',
        className,
      )}
    >
      <MIcon
        name={preset.icon}
        filled
        size={28}
        className="mb-4"
        style={{ color: preset.iconColor }}
      />
      {preset.display ? (
        <h2 className="font-display text-[44px] font-black uppercase italic leading-[1.05] tracking-tight text-[color:var(--fg)]">
          {heading}
          <span className="text-[color:var(--accent)]">.</span>
        </h2>
      ) : (
        <h2 className="text-lg font-semibold text-[color:var(--fg)]">{heading}</h2>
      )}
      {description ? (
        <p className="mt-3 max-w-[44ch] text-sm text-[color:var(--text-muted)]">{description}</p>
      ) : null}
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className={cn(
            'focus-ring mt-5 inline-flex items-center gap-2 rounded-[var(--r-m)] px-4 py-2.5',
            'bg-[color:var(--accent)] text-[color:var(--accent-on)] hover:bg-[color:var(--accent-press)]',
            'text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
          )}
        >
          {action.icon ? <MIcon name={action.icon} size={15} /> : null}
          {action.label}
        </button>
      ) : null}
    </section>
  );
}
