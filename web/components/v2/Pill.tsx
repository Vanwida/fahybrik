// Pill / Chip — small rounded label for filters, tags, counts and statuses.
// `tone` maps to a semantic token; `variant` switches outline vs solid vs soft.
// One component covers filter chips, status chips and count chips across v2.

import { cn } from '@/lib/utils';

export type PillTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info';
export type PillVariant = 'outline' | 'soft' | 'solid';

const TONE_VARS: Record<PillTone, { color: string; soft: string }> = {
  neutral: { color: '--v2-muted', soft: '--v2-surface-2' },
  accent: { color: '--v2-accent', soft: '--v2-accent-soft' },
  ok: { color: '--v2-ok', soft: '--v2-ok-soft' },
  warn: { color: '--v2-warn', soft: '--v2-warn-soft' },
  danger: { color: '--v2-danger', soft: '--v2-danger-soft' },
  info: { color: '--v2-info', soft: '--v2-info-soft' },
};

export function Pill({
  children,
  tone = 'neutral',
  variant = 'soft',
  className,
}: {
  children: React.ReactNode;
  tone?: PillTone;
  variant?: PillVariant;
  className?: string;
}) {
  const vars = TONE_VARS[tone];
  const base =
    'inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap';

  if (variant === 'solid') {
    return (
      <span
        className={cn(base, className)}
        style={{
          background: `var(${vars.color})`,
          color: tone === 'accent' ? 'var(--v2-accent-fg)' : 'var(--v2-bg)',
        }}
      >
        {children}
      </span>
    );
  }
  if (variant === 'outline') {
    return (
      <span
        className={cn(base, 'border', className)}
        style={{ borderColor: `var(${vars.color})`, color: `var(${vars.color})` }}
      >
        {children}
      </span>
    );
  }
  // soft (default)
  return (
    <span
      className={cn(base, className)}
      style={{ background: `var(${vars.soft})`, color: `var(${vars.color})` }}
    >
      {children}
    </span>
  );
}
