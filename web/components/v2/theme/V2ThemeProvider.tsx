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

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  V2_THEME_STORAGE_KEY,
  V2_THEME_DEFAULT,
  type V2Theme,
} from './theme-config';

// Re-export the theme config so existing importers (components/v2/index.ts) keep
// working. The plain values live in ./theme-config so the server V2ThemeScript
// can import the real strings (this module is 'use client').
export { V2_THEME_STORAGE_KEY, V2_THEME_DEFAULT } from './theme-config';
export type { V2Theme } from './theme-config';

interface V2ThemeContextValue {
  theme: V2Theme;
  setTheme: (next: V2Theme) => void;
  toggleTheme: () => void;
}

const V2ThemeContext = createContext<V2ThemeContextValue | null>(null);

// ── External store (localStorage + prefers-color-scheme) ──────────────────────

/** Subscribe to cross-tab storage changes so the theme stays in sync. */
function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

/** Client snapshot: stored value → system preference → default. */
function getClientTheme(): V2Theme {
  const stored = window.localStorage.getItem(V2_THEME_STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return V2_THEME_DEFAULT;
}

/** Server snapshot: always the default (deterministic SSR, no mismatch). */
function getServerTheme(): V2Theme {
  return V2_THEME_DEFAULT;
}

export function V2ThemeProvider({
  children,
  accentStyle,
}: {
  children: ReactNode;
  /** Override de --v2-accent* en .v2-root. Vacío = tokens de marca. */
  accentStyle?: CSSProperties;
}) {
  // The store is read-only here; writes (setTheme/toggle) persist to localStorage
  // and dispatch a storage-like update so useSyncExternalStore re-reads.
  const theme = useSyncExternalStore(subscribe, getClientTheme, getServerTheme);

  const persist = useCallback((next: V2Theme) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(V2_THEME_STORAGE_KEY, next);
    // The native 'storage' event only fires in OTHER tabs, so dispatch one here
    // to notify this tab's subscribers and force a snapshot re-read.
    window.dispatchEvent(new StorageEvent('storage', { key: V2_THEME_STORAGE_KEY, newValue: next }));
  }, []);

  const setTheme = useCallback((next: V2Theme) => persist(next), [persist]);
  const toggleTheme = useCallback(
    () => persist(theme === 'dark' ? 'light' : 'dark'),
    [persist, theme],
  );

  return (
    <V2ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {/* The single scoped root — data-theme drives every v2 token. */}
      <div className="v2-root" data-theme={theme} style={accentStyle}>
        {children}
      </div>
    </V2ThemeContext.Provider>
  );
}

/** Access the v2 theme. Throws if used outside the provider (caller error). */
export function useV2Theme(): V2ThemeContextValue {
  const ctx = useContext(V2ThemeContext);
  if (!ctx) throw new Error('useV2Theme must be used within <V2ThemeProvider>');
  return ctx;
}

// V2ThemeScript moved to ./V2ThemeScript.tsx (must be a server component so the
// inline pre-paint <script> actually executes; a 'use client' module can't run it).
