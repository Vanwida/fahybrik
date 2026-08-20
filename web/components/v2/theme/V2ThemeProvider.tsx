'use client';

// V2ThemeProvider — owns the v2 theme state (dark|light) for the SCOPED v2 root.
//
// Theme isolation contract: we set `data-theme` on the `.v2-root` wrapper element
// ONLY — never a class on <html> (that would bleed into the legacy dark-only app).
//
// The theme persists in localStorage. We read it with useSyncExternalStore so the
// SSR snapshot is the deterministic default (no hydration mismatch) while the
// client snapshot reflects the stored value, and a storage subscription keeps the
// theme in sync across tabs. The inline V2ThemeScript additionally sets the
// attribute pre-paint so there is no flash before hydration.
//
// El acento es la piel del club (familia clara u oscura según el tema), no el
// naranja de sistema. Vacío = el cromo FLEXR neutro del CSS.

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { clubAccentCssVars } from '@fahybrid/shared/domain/coach/club-skin';
import { cn } from '@/lib/utils';
import {
  V2_THEME_STORAGE_KEY,
  V2_THEME_DEFAULT,
  resolveV2Theme,
  type V2Theme,
} from './theme-config';

export { V2_THEME_STORAGE_KEY, V2_THEME_DEFAULT, resolveV2Theme } from './theme-config';
export type { V2Theme } from './theme-config';

interface V2ThemeContextValue {
  theme: V2Theme;
  setTheme: (next: V2Theme) => void;
  toggleTheme: () => void;
}

const V2ThemeContext = createContext<V2ThemeContextValue | null>(null);

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

function getClientTheme(): V2Theme {
  const stored = window.localStorage.getItem(V2_THEME_STORAGE_KEY);
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  return resolveV2Theme(stored, prefersDark);
}

function getServerTheme(): V2Theme {
  return V2_THEME_DEFAULT;
}

export function V2ThemeProvider({
  children,
  className,
  accentHex,
}: {
  children: ReactNode;
  className?: string;
  accentHex?: string | null;
}) {
  const theme = useSyncExternalStore(subscribe, getClientTheme, getServerTheme);

  const persist = useCallback((next: V2Theme) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(V2_THEME_STORAGE_KEY, next);
    window.dispatchEvent(new StorageEvent('storage', { key: V2_THEME_STORAGE_KEY, newValue: next }));
  }, []);

  const setTheme = useCallback((next: V2Theme) => persist(next), [persist]);
  const toggleTheme = useCallback(
    () => persist(theme === 'dark' ? 'light' : 'dark'),
    [persist, theme],
  );

  // La piel del club sirve las DOS familias (clara y oscura) y es `v2-theme.css`
  // quien elige según `data-theme`. Así el acento correcto está pintado ya en el
  // primer fotograma, sin depender de que React sepa el tema: en servidor el tema
  // aún no se conoce, y elegirlo aquí dejaba un parpadeo al hidratar.
  const accentStyle = clubAccentCssVars(accentHex) as CSSProperties;

  return (
    <V2ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <div className={cn('v2-root', className)} data-theme={theme} style={accentStyle}>
        {children}
      </div>
    </V2ThemeContext.Provider>
  );
}

export function useV2Theme(): V2ThemeContextValue {
  const ctx = useContext(V2ThemeContext);
  if (!ctx) throw new Error('useV2Theme must be used within <V2ThemeProvider>');
  return ctx;
}
