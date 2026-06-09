'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Public surface kinds. Aliases (`block_title`, `day_focus`, `week_name`) are
 * accepted by the API and normalised server-side to canonical values.
 */
export type PabloIASurface =
  | 'workout_name'
  | 'block_title'
  | 'block_name'
  | 'coach_note'
  | 'day_focus'
  | 'week_focus'
  | 'week_name'
  | 'template_name';

interface CommonProps {
  value: string;
  onChange: (v: string) => void;
  surface: PabloIASurface;
  context: Record<string, unknown>;
  placeholder?: string;
  className?: string;
  /** Override the input/textarea inner classes. */
  inputClassName?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

type InputOnlyProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'placeholder' | 'className' | 'disabled'
>;

interface TextareaOnlyProps
  extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    'value' | 'onChange' | 'placeholder' | 'className' | 'disabled' | 'rows'
  > {
  rows?: number;
}

const FIELD_INPUT_CLASS =
  'w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] py-2 pl-3 text-sm text-[color:var(--fg)] outline-none transition-colors focus:border-[color:var(--accent)]';

/** Compact brand mark used in the trigger button (Fabrik glyph, no cliché IA icons). */
function PabloIAMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="6" cy="6" r="1.6" fill="currentColor" />
    </svg>
  );
}

interface SuggestionsState {
  loading: boolean;
  error: string | null;
  items: string[];
}

const initialState: SuggestionsState = { loading: false, error: null, items: [] };

interface UsePabloIASuggestArgs {
  surface: PabloIASurface;
  context: Record<string, unknown>;
}

function usePabloIASuggest({ surface, context }: UsePabloIASuggestArgs) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SuggestionsState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel pending request when component unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const fetchSuggestions = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState({ loading: true, error: null, items: [] });
    try {
      const res = await fetch('/api/coach/ai/text-suggest', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surface, context }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as { suggestions?: string[] };
      const items = (json.suggestions ?? []).slice(0, 3);
      setState({ loading: false, error: null, items });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setState({
        loading: false,
        error: err instanceof Error ? err.message : 'No se pudo obtener sugerencias',
        items: [],
      });
    }
  }, [surface, context]);

  const openAndFetch = useCallback(() => {
    setOpen(true);
    void fetchSuggestions();
  }, [fetchSuggestions]);

  const close = useCallback(() => {
    abortRef.current?.abort();
    setOpen(false);
    setState(initialState);
  }, []);

  return { open, state, openAndFetch, regenerate: fetchSuggestions, close };
}

interface PopoverProps {
  state: SuggestionsState;
  onPick: (v: string) => void;
  onRegenerate: () => void;
  onClose: () => void;
}

function PabloIAPopover({ state, onPick, onRegenerate, onClose }: PopoverProps) {
  return (
    <div
      role="dialog"
      aria-label="Sugerencias Pablo IA"
      className="absolute right-0 top-full z-30 mt-1 w-72 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] p-3 shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
          Pablo IA · sugerencias
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar sugerencias"
          className="rounded-[var(--r-sm)] p-1 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container-highest)] hover:text-[color:var(--fg)]"
        >
          ✕
        </button>
      </div>

      {state.loading ? (
        <ul className="space-y-1.5" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-7 animate-pulse rounded-[var(--r-sm)] bg-[color:var(--surface-container-highest)]"
            />
          ))}
        </ul>
      ) : state.error ? (
        <div className="rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] p-2 text-xs text-[color:var(--text-muted)]">
          <p>No se pudieron cargar las sugerencias.</p>
          <button
            type="button"
            onClick={onRegenerate}
            className="mt-2 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] px-2 py-1 text-[11px] font-bold uppercase text-[color:var(--fg)] hover:bg-[color:var(--surface-container-highest)]"
          >
            Reintentar
          </button>
        </div>
      ) : state.items.length === 0 ? (
        <p className="px-1 py-2 text-xs text-[color:var(--text-muted)]">Sin sugerencias.</p>
      ) : (
        <ul className="space-y-1">
          {state.items.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => onPick(s)}
                className="w-full rounded-[var(--r-sm)] border border-transparent px-2 py-1.5 text-left text-xs text-[color:var(--fg)] hover:border-[color:var(--accent)] hover:bg-[color:var(--surface-container-highest)]"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-[color:var(--border-subtle)] pt-2">
        <button
          type="button"
          onClick={onRegenerate}
          disabled={state.loading}
          className="rounded-[var(--r-sm)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--text-muted)] hover:text-[color:var(--fg)] disabled:opacity-40"
        >
          Regenerar
        </button>
        <span className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
          Pablo confirma
        </span>
      </div>
    </div>
  );
}

interface TriggerButtonProps {
  onClick: () => void;
  loading: boolean;
  active: boolean;
  describedById: string;
}

function PabloIATriggerButton({ onClick, loading, active, describedById }: TriggerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={active}
      aria-controls={describedById}
      aria-label="Pedir sugerencias a Pablo IA"
      title="Pablo IA"
      className={cn(
        'inline-flex items-center gap-1 rounded-[var(--r-pill)] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] transition-colors',
        active
          ? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--on-primary-container)]'
          : 'border-[color:var(--accent)]/40 bg-transparent text-[color:var(--accent)] hover:border-[color:var(--accent)] hover:bg-[color:var(--accent)]/10',
      )}
    >
      <PabloIAMark className="h-2.5 w-2.5" />
      <span>{loading ? '…' : 'Pablo IA'}</span>
    </button>
  );
}

/** Click-outside helper bound to a container ref. */
function useClickOutside(ref: React.RefObject<HTMLElement | null>, when: boolean, close: () => void) {
  useEffect(() => {
    if (!when) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, when, close]);
}

// ============================================================================
// PabloIAInput — single-line wrapper
// ============================================================================

export interface PabloIAInputProps extends CommonProps, InputOnlyProps {}

export const PabloIAInput = forwardRef<HTMLInputElement, PabloIAInputProps>(function PabloIAInput(
  {
    value,
    onChange,
    surface,
    context,
    placeholder,
    className,
    inputClassName,
    disabled,
    ...rest
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
  const popoverId = useId();
  const { open, state, openAndFetch, regenerate, close } = usePabloIASuggest({ surface, context });
  useClickOutside(containerRef, open, close);

  return (
    <div ref={containerRef} className={cn('relative', className)} id={popoverId}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(FIELD_INPUT_CLASS, 'pr-[5.5rem]', inputClassName)}
        {...rest}
      />
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
        <PabloIATriggerButton
          onClick={open ? close : openAndFetch}
          loading={state.loading}
          active={open}
          describedById={popoverId}
        />
      </div>
      {open ? (
        <PabloIAPopover
          state={state}
          onRegenerate={regenerate}
          onClose={close}
          onPick={(v) => {
            onChange(v);
            close();
          }}
        />
      ) : null}
    </div>
  );
});

// ============================================================================
// PabloIATextarea — multi-line wrapper
// ============================================================================

export interface PabloIATextareaProps extends CommonProps, TextareaOnlyProps {
  rows?: number;
}

export const PabloIATextarea = forwardRef<HTMLTextAreaElement, PabloIATextareaProps>(function PabloIATextarea(
  {
    value,
    onChange,
    surface,
    context,
    placeholder,
    className,
    inputClassName,
    disabled,
    rows = 3,
    ...rest
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);
  const popoverId = useId();
  const { open, state, openAndFetch, regenerate, close } = usePabloIASuggest({ surface, context });
  useClickOutside(containerRef, open, close);

  return (
    <div ref={containerRef} className={cn('relative', className)} id={popoverId}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={cn(FIELD_INPUT_CLASS, 'resize-none pr-3 pt-2', inputClassName)}
        {...rest}
      />
      <div className="absolute right-2 top-2">
        <PabloIATriggerButton
          onClick={open ? close : openAndFetch}
          loading={state.loading}
          active={open}
          describedById={popoverId}
        />
      </div>
      {open ? (
        <PabloIAPopover
          state={state}
          onRegenerate={regenerate}
          onClose={close}
          onPick={(v) => {
            onChange(v);
            close();
          }}
        />
      ) : null}
    </div>
  );
});
