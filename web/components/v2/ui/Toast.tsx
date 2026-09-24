'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Kbd } from './Kbd';

// Avisos efímeros con «Deshacer». Cada acción reversible del panel (hecho,
// posponer, borrar, asignar) confirma aquí y ofrece deshacerla durante unos
// segundos; ⌘Z / Ctrl+Z deshace el último mientras está a la vista.

export type ToastTone = 'neutral' | 'ok' | 'info' | 'warn' | 'danger';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Si está, sale «Deshacer» (y ⌘Z). Se llama una vez y el aviso se va. */
  undo?: () => void | Promise<void>;
  /** Otra acción (p. ej. «Ver»). */
  action?: { label: string; onClick: () => void };
  /** ms en pantalla. Por defecto 5 s (8 s si se puede deshacer). 0 = fijo. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastApi {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE: Record<ToastTone, { icon: LucideIcon | null; cls: string }> = {
  neutral: { icon: null, cls: '' },
  ok: { icon: CircleCheck, cls: 'text-v2-ok' },
  info: { icon: Info, cls: 'text-v2-info' },
  warn: { icon: TriangleAlert, cls: 'text-v2-warn' },
  danger: { icon: CircleAlert, cls: 'text-v2-danger' },
};

const MAX_VISIBLE = 3;

/**
 * Marca de una barra de acciones pegada abajo (barra de selección, pie fijo de
 * un formulario, «Guardar» del editor). Los avisos se levantan por encima de
 * cualquier barra marcada que esté a la vista: un aviso nunca tapa el botón que
 * el coach acaba de pulsar ni el siguiente. `<div {...{ [BOTTOM_BAR_ATTR]: '' }}>`.
 */
export const BOTTOM_BAR_ATTR = 'data-v2-bottom-bar';

/** Una barra solo levanta los avisos si está pegada a la parte baja de la pantalla. */
const BOTTOM_ZONE_PX = 200;

/**
 * Cuánto hay que levantar los avisos (px desde el borde inferior de la ventana)
 * para quedar por encima de las barras marcadas. Pura: recibe los rectángulos.
 */
export function bottomBarLift(rects: ReadonlyArray<{ top: number; bottom: number; height: number }>, viewportH: number): number {
  let lift = 0;
  for (const r of rects) {
    if (r.height === 0) continue;
    // Fuera de la pantalla o lejos del borde de abajo: no estorba.
    if (r.top >= viewportH || r.bottom < viewportH - BOTTOM_ZONE_PX) continue;
    lift = Math.max(lift, Math.ceil(viewportH - r.top));
  }
  return lift;
}

/** Sigue las barras marcadas (aparecen, cambian de tamaño, se despegan al hacer scroll). */
function useBottomBarLift(active: boolean): number {
  const [lift, setLift] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bars = document.querySelectorAll<HTMLElement>(`[${BOTTOM_BAR_ATTR}]`);
        setLift(bottomBarLift([...bars].map((b) => b.getBoundingClientRect()), window.innerHeight));
      });
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active]);
  return active ? lift : 0;
}

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const duration = item.duration ?? (item.undo ? 8000 : 5000);
  const remaining = useRef(duration);
  const startedAt = useRef(0);

  useEffect(() => {
    if (duration === 0 || paused) return;
    startedAt.current = Date.now();
    const t = window.setTimeout(() => onDismiss(item.id), remaining.current);
    return () => {
      window.clearTimeout(t);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, duration, item.id, onDismiss]);

  const runUndo = async () => {
    if (!item.undo || undoing) return;
    setUndoing(true);
    try {
      await item.undo();
    } finally {
      onDismiss(item.id);
    }
  };

  const { icon: Icon, cls } = TONE[item.tone ?? 'neutral'];
  return (
    <div
      role={item.tone === 'danger' ? 'alert' : 'status'}
      data-toast-id={item.id}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-panel border border-v2-border bg-v2-elevated py-3 pr-2 pl-3.5 text-v2-fg shadow-pop',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none',
      )}
    >
      {Icon ? <Icon aria-hidden strokeWidth={2} className={cn('mt-0.5 size-4 shrink-0', cls)} /> : null}
      <div className="min-w-0 flex-1 py-px">
        <p className="t-body font-medium">{item.title}</p>
        {item.description ? <p className="mt-0.5 t-body-sm text-v2-muted">{item.description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.action ? (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              onDismiss(item.id);
            }}
            className="h-7 rounded-ctl px-2 text-[13px] font-semibold text-v2-fg outline-none hover:bg-v2-hover focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]"
          >
            {item.action.label}
          </button>
        ) : null}
        {item.undo ? (
          <button
            type="button"
            data-undo-button=""
            onClick={runUndo}
            disabled={undoing}
            className="inline-flex h-7 items-center gap-1.5 rounded-ctl px-2 text-[13px] font-semibold text-v2-fg outline-none hover:bg-v2-hover focus-visible:shadow-[0_0_0_2px_var(--v2-accent)] disabled:opacity-50"
          >
            Deshacer
            <Kbd className="hidden sm:inline-flex">⌘Z</Kbd>
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={() => onDismiss(item.id)}
          className="flex size-7 items-center justify-center rounded-ctl text-v2-faint outline-none hover:bg-v2-hover hover:text-v2-fg focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]"
        >
          <X aria-hidden className="size-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

/** Monta la zona de avisos. Va dentro de `.v2-root` (lo hace PanelProviders). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const toast = useCallback((options: ToastOptions) => {
    seq.current += 1;
    const id = `t${seq.current}`;
    setItems((list) => [...list, { ...options, id }].slice(-MAX_VISIBLE));
    return id;
  }, []);

  // ⌘Z / Ctrl+Z deshace el aviso más reciente que lo permita (fuera de campos de texto).
  const latestUndo = [...items].reverse().find((t) => t.undo);
  useEffect(() => {
    if (!latestUndo) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      if (isTyping(document.activeElement)) return;
      e.preventDefault();
      const btn = document.querySelector<HTMLButtonElement>(`[data-toast-id="${latestUndo.id}"] [data-undo-button]`);
      btn?.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [latestUndo]);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  // Solo se mide mientras hay avisos a la vista.
  const lift = useBottomBarLift(items.length > 0);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <section
        aria-label="Avisos"
        style={{ ['--v2-toast-lift' as string]: `${lift}px` }}
        className={cn(
          'pointer-events-none fixed inset-x-3 z-[95] flex flex-col items-stretch gap-2',
          // Encima de la barra de pestañas y de cualquier barra de acciones marcada.
          'bottom-[max(calc(var(--v2-tabbar-h)+12px),calc(var(--v2-toast-lift)+12px))]',
          'lg:inset-x-auto lg:right-5 lg:bottom-[max(20px,calc(var(--v2-toast-lift)+12px))] lg:w-[380px]',
        )}
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

/** `const { toast } = useToast(); toast({ title: 'Hecho', undo: () => … })`. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast necesita <PanelProviders> (o <ToastProvider>) por encima');
  return ctx;
}
