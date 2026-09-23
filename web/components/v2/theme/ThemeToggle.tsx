'use client';

// ThemeToggle — cambia el tema del panel (oscuro ↔ claro), persistido por
// V2ThemeProvider. Solo icono: enseña el icono del tema AL QUE cambia.

import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/v2/ui';
import { useV2Theme } from '@/components/v2/theme/V2ThemeProvider';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useV2Theme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <IconButton
      icon={next === 'light' ? Sun : Moon}
      label={next === 'light' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      tooltipSide="bottom"
      onClick={toggleTheme}
      className={className}
    />
  );
}
