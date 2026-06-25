// Card — the base v2 surface panel: themed background, hairline border, soft
// elevation shadow. `interactive` lifts the accent into the border on hover for
// clickable cards. Composable wrapper used by lanes, tiles and lists.

import { cn } from '@/lib/utils';

export function Card({
  children,
  interactive = false,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)]',
        'shadow-[var(--v2-shadow-card)]',
        interactive &&
          'transition-colors hover:border-[color:color-mix(in_srgb,var(--v2-accent)_40%,var(--v2-border))]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
