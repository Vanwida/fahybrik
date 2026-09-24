'use client';

// El estado del shell que comparten la barra superior, la lateral, el móvil y los
// atajos: el ⌘K (abierto, y en qué modo), las acciones de «+ Nuevo» y el
// artículo de ayuda que declara la pantalla en curso.
//
// Una pantalla declara su artículo de la guía con <HelpArticle slug="…" />; el
// «?» de arriba lleva ahí en vez de al índice de la guía.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from '@/i18n/navigation';
import { ACTIONS, type ShellAction } from './destinations';
import { ACTION_HREF, comunicadoHref } from './intents';

/** El ⌘K normal, o eligiendo el atleta de una acción («Mensaje a…»). */
export type PaletteMode = { kind: 'search' } | { kind: 'pick'; action: ShellAction; label: string };

export interface PickedAthlete {
  id: string;
  name: string;
}

interface ShellContextValue {
  negocio: boolean;
  paletteOpen: boolean;
  paletteMode: PaletteMode;
  openPalette: (mode?: PaletteMode) => void;
  closePalette: () => void;
  runAction: (action: ShellAction) => void;
  /** Termina una acción que pedía atleta. */
  runWithAthlete: (action: ShellAction, athlete: PickedAthlete) => void;
  /** Abre la conversación con un atleta (⌘Enter en el ⌘K, «Mensaje a…»). */
  openChat: (athlete: PickedAthlete) => void;
  helpSlug: string | null;
  setHelpSlug: (slug: string | null) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({
  negocio,
  children,
  overlays,
}: {
  negocio: boolean;
  children: ReactNode;
  /**
   * Paneles globales que el shell monta una vez (asignar, conversación). Reciben
   * el estado por `useShellOverlays()`.
   */
  overlays?: ReactNode;
}) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>({ kind: 'search' });
  const [helpSlug, setHelpSlug] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [chatWith, setChatWith] = useState<PickedAthlete | null>(null);

  const openPalette = useCallback((mode: PaletteMode = { kind: 'search' }) => {
    setPaletteMode(mode);
    setPaletteOpen(true);
  }, []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  const openChat = useCallback((athlete: PickedAthlete) => setChatWith(athlete), []);

  const runWithAthlete = useCallback(
    (action: ShellAction, athlete: PickedAthlete) => {
      setPaletteOpen(false);
      if (action === 'mensaje_a') setChatWith(athlete);
      else if (action === 'enviar_comunicado') router.push(comunicadoHref(athlete.id));
    },
    [router],
  );

  const runAction = useCallback(
    (action: ShellAction) => {
      const entry = ACTIONS.find((a) => a.id === action);
      if (entry?.picksAthlete) {
        openPalette({ kind: 'pick', action, label: entry.label });
        return;
      }
      setPaletteOpen(false);
      if (action === 'asignar_programa') {
        setAssignOpen(true);
        return;
      }
      const href = ACTION_HREF[action];
      if (href) router.push(href);
    },
    [openPalette, router],
  );

  const value = useMemo<ShellContextValue>(
    () => ({
      negocio,
      paletteOpen,
      paletteMode,
      openPalette,
      closePalette,
      runAction,
      runWithAthlete,
      openChat,
      helpSlug,
      setHelpSlug,
    }),
    [negocio, paletteOpen, paletteMode, openPalette, closePalette, runAction, runWithAthlete, openChat, helpSlug],
  );

  const overlayState = useMemo<ShellOverlayState>(
    () => ({
      assignOpen,
      closeAssign: () => setAssignOpen(false),
      chatWith,
      closeChat: () => setChatWith(null),
    }),
    [assignOpen, chatWith],
  );

  return (
    <ShellContext.Provider value={value}>
      <ShellOverlayContext.Provider value={overlayState}>
        {children}
        {overlays}
      </ShellOverlayContext.Provider>
    </ShellContext.Provider>
  );
}

export interface ShellOverlayState {
  assignOpen: boolean;
  closeAssign: () => void;
  chatWith: PickedAthlete | null;
  closeChat: () => void;
}

const ShellOverlayContext = createContext<ShellOverlayState | null>(null);

export function useShellOverlays(): ShellOverlayState {
  const ctx = useContext(ShellOverlayContext);
  if (!ctx) throw new Error('useShellOverlays fuera de <ShellProvider>');
  return ctx;
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell fuera de <ShellProvider>');
  return ctx;
}

/**
 * Una pantalla declara su artículo de la guía: el «?» de la barra superior lleva
 * a `/guia/<slug>` mientras esté montada. Sin declararlo, al índice de la guía.
 */
export function HelpArticle({ slug }: { slug: string }) {
  const ctx = useContext(ShellContext);
  const setHelpSlug = ctx?.setHelpSlug;
  useEffect(() => {
    if (!setHelpSlug) return;
    setHelpSlug(slug);
    return () => setHelpSlug(null);
  }, [slug, setHelpSlug]);
  return null;
}
