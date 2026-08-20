'use client';

// ThemeToggle — flips the v2 theme (dark ↔ light), persisted via V2ThemeProvider.
// Icon-only with an aria-label; shows the icon of the mode it will switch TO.

import { MIcon } from '@/components/ui/MIcon';
import { useV2Theme } from '@/components/v2/theme/V2ThemeProvider';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useV2Theme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={next === 'light' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={next === 'light' ? 'Tema claro' : 'Tema oscuro'}
      className={cn(
        'v2-focus inline-flex h-9 w-9 items-center justify-center rounded-[var(--v2-r-s)]',
        'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] text-[color:var(--v2-muted)]',
        'transition-colors hover:text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
        className,
      )}
    >
      <MIcon name={next === 'light' ? 'light_mode' : 'dark_mode'} size={20} />
    </button>
  );
}
