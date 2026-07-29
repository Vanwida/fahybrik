'use client';

// CoachGuidanceEditor — the coach AUTHORS "Consejos de dobles": a short, ordered
// list of tactical tips shown to athletes in TWO contexts — the doubles race
// board (race_doubles) and the doubles simulation (sim_doubles). Backend is
// already live: GET/PUT /api/coach/guidance/{context}, coach-scoped, Zod-
// validated (1..8 items, 1..200 chars each after trim). Until the coach saves
// their own list, the API serves agnostic SYSTEM DEFAULTS (is_custom=false).
//
// The guidance is coach-GLOBAL, not per-pair — one editor, two tabs, each tab
// backed by its own context. Both contexts are fetched on open so switching
// tabs is instant and never drops an in-progress edit on the other tab.
//
// Idiom: same V2 modal shell as DoblesSimulationEditor (fixed inset-0 overlay,
// max-w-2xl card, --v2-* tokens), reusing SegmentedControl for the tab toggle.

import { useCallback, useEffect, useRef, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { SegmentedControl, type SegmentOption } from '@/components/v2/SegmentedControl';
import { cn } from '@/lib/utils';
import {
  COACH_GUIDANCE_CONTEXTS,
  COACH_GUIDANCE_MAX_ITEMS,
  COACH_GUIDANCE_MAX_ITEM_CHARS,
  type CoachGuidanceContext,
} from '@fahybrid/shared/domain/coach-guidance';
import type { CoachGuidanceResponse } from '@fahybrid/shared/schema/coach-guidance';

const BTN_BASE =
  'v2-focus inline-flex items-center justify-center gap-1.5 rounded-[var(--v2-r-s)] px-3 text-body font-semibold transition-colors disabled:opacity-50';

const TAB_OPTIONS: ReadonlyArray<SegmentOption<CoachGuidanceContext>> = [
  { value: 'race_doubles', label: 'Carrera' },
  { value: 'sim_doubles', label: 'Simulación' },
];

// How long the "Guardado" affirmation stays visible before fading back to the
// plain editor state.
const SAVED_FLASH_MS = 2500;

interface TabState {
  items: string[];
  isCustom: boolean;
  updatedAt: string | null;
  loading: boolean;
  loadError: string | null;
  saving: boolean;
  saveError: string | null;
  saved: boolean;
}

function initialTabState(): TabState {
  return {
    items: [],
    isCustom: false,
    updatedAt: null,
    loading: true,
    loadError: null,
    saving: false,
    saveError: null,
    saved: false,
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'No se pudo completar la acción.';
  } catch {
    return 'No se pudo completar la acción.';
  }
}

export function CoachGuidanceEditor({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<CoachGuidanceContext>('race_doubles');
  const [tabs, setTabs] = useState<Record<CoachGuidanceContext, TabState>>({
    race_doubles: initialTabState(),
    sim_doubles: initialTabState(),
  });
  const savedTimers = useRef<Partial<Record<CoachGuidanceContext, ReturnType<typeof setTimeout>>>>({});

  // Fetch BOTH contexts on open, independently, so switching tabs is instant
  // and a slow/failed context never blocks the other.
  useEffect(() => {
    let cancelled = false;
    for (const context of COACH_GUIDANCE_CONTEXTS) {
      (async () => {
        try {
          const res = await fetch(`/api/coach/guidance/${context}`, {
            headers: { accept: 'application/json' },
          });
          if (!res.ok) {
            const message = await readError(res);
            if (!cancelled) {
              setTabs((prev) => ({ ...prev, [context]: { ...prev[context], loading: false, loadError: message } }));
            }
            return;
          }
          const d = (await res.json()) as CoachGuidanceResponse;
          if (cancelled) return;
          setTabs((prev) => ({
            ...prev,
            [context]: {
              ...prev[context],
              items: d.items,
              isCustom: d.is_custom,
              updatedAt: d.updated_at,
              loading: false,
              loadError: null,
            },
          }));
        } catch {
          if (!cancelled) {
            setTabs((prev) => ({
              ...prev,
              [context]: { ...prev[context], loading: false, loadError: 'Error de red al cargar los consejos.' },
            }));
          }
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Escape closes the modal.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Clear any pending "Guardado" flash timers on unmount.
  useEffect(() => {
    const timers = savedTimers.current;
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t);
    };
  }, []);

  const updateItem = useCallback((context: CoachGuidanceContext, index: number, value: string) => {
    setTabs((prev) => {
      const t = prev[context];
      const items = t.items.slice();
      items[index] = value;
      return { ...prev, [context]: { ...t, items, saved: false, saveError: null } };
    });
  }, []);

  const removeItem = useCallback((context: CoachGuidanceContext, index: number) => {
    setTabs((prev) => {
      const t = prev[context];
      const items = t.items.filter((_, i) => i !== index);
      return { ...prev, [context]: { ...t, items, saved: false, saveError: null } };
    });
  }, []);

  const addItem = useCallback((context: CoachGuidanceContext) => {
    setTabs((prev) => {
      const t = prev[context];
      if (t.items.length >= COACH_GUIDANCE_MAX_ITEMS) return prev;
      return { ...prev, [context]: { ...t, items: [...t.items, ''], saved: false, saveError: null } };
    });
  }, []);

  const save = useCallback(async (context: CoachGuidanceContext) => {
    const cleaned = tabs[context].items.map((i) => i.trim()).filter((i) => i.length > 0);

    if (cleaned.length === 0) {
      setTabs((prev) => ({
        ...prev,
        [context]: { ...prev[context], saveError: 'Escribe al menos un consejo.' },
      }));
      return;
    }
    const tooLong = cleaned.some((i) => i.length > COACH_GUIDANCE_MAX_ITEM_CHARS);
    if (tooLong) {
      setTabs((prev) => ({
        ...prev,
        [context]: {
          ...prev[context],
          saveError: `Cada consejo tiene un máximo de ${COACH_GUIDANCE_MAX_ITEM_CHARS} caracteres.`,
        },
      }));
      return;
    }

    setTabs((prev) => ({ ...prev, [context]: { ...prev[context], saving: true, saveError: null } }));
    try {
      const res = await fetch(`/api/coach/guidance/${context}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: cleaned }),
      });
      if (!res.ok) {
        const message = await readError(res);
        setTabs((prev) => ({ ...prev, [context]: { ...prev[context], saving: false, saveError: message } }));
        return;
      }
      const d = (await res.json()) as CoachGuidanceResponse;
      setTabs((prev) => ({
        ...prev,
        [context]: {
          ...prev[context],
          items: d.items,
          isCustom: d.is_custom,
          updatedAt: d.updated_at,
          saving: false,
          saveError: null,
          saved: true,
        },
      }));
      const prevTimer = savedTimers.current[context];
      if (prevTimer) clearTimeout(prevTimer);
      savedTimers.current[context] = setTimeout(() => {
        setTabs((prev) => ({ ...prev, [context]: { ...prev[context], saved: false } }));
      }, SAVED_FLASH_MS);
    } catch {
      setTabs((prev) => ({
        ...prev,
        [context]: { ...prev[context], saving: false, saveError: 'Error de red al guardar los consejos.' },
      }));
    }
  }, [tabs]);

  const current = tabs[active];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[color:var(--v2-scrim)] p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Consejos de dobles"
      onClick={onClose}
    >
      <div
        className="my-4 w-full max-w-2xl rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-bg)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">Consejos de dobles</h2>
            <p className="mt-0.5 text-body text-[color:var(--v2-muted)]">
              Tácticas que ve la pareja en el tablero de carrera y en la simulación.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus shrink-0 rounded-[var(--v2-r-s)] p-1 text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={18} />
          </button>
        </div>

        {/* Tabs — one context per tab, state kept independently. */}
        <div className="mb-4 mt-3">
          <SegmentedControl<CoachGuidanceContext>
            options={TAB_OPTIONS}
            value={active}
            onChange={setActive}
            size="sm"
            ariaLabel="Contexto de los consejos"
          />
        </div>

        {current.loading ? (
          <p className="py-8 text-center text-body text-[color:var(--v2-muted)]">Cargando…</p>
        ) : current.loadError ? (
          <p className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3 text-body text-[color:var(--v2-danger)]">
            {current.loadError}
          </p>
        ) : (
          <>
            {!current.isCustom ? (
              <div className="mb-3 flex items-start gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2.5">
                <MIcon name="info" size={15} className="mt-0.5 shrink-0 text-[color:var(--v2-accent)]" />
                <p className="text-xs leading-snug text-[color:var(--v2-muted)]">
                  Estás viendo los consejos del sistema. Guarda para personalizarlos.
                </p>
              </div>
            ) : null}

            {/* Editable list — one row per tip. */}
            <div className="flex flex-col gap-2">
              {current.items.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <label className="sr-only" htmlFor={`guidance-${active}-${index}`}>
                      Consejo {index + 1}
                    </label>
                    <input
                      id={`guidance-${active}-${index}`}
                      type="text"
                      value={item}
                      onChange={(e) => updateItem(active, index, e.target.value)}
                      maxLength={COACH_GUIDANCE_MAX_ITEM_CHARS}
                      placeholder="Escribe un consejo…"
                      className="v2-focus h-9 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2.5 pr-14 text-body text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-muted)] focus:border-[color:var(--v2-border-strong)]"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-eyebrow font-medium text-[color:var(--v2-muted)]">
                      {item.length}/{COACH_GUIDANCE_MAX_ITEM_CHARS}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(active, index)}
                    aria-label={`Eliminar consejo ${index + 1}`}
                    className="v2-focus shrink-0 rounded-[var(--v2-r-s)] p-1.5 text-[color:var(--v2-muted)] hover:text-[color:var(--v2-danger)]"
                  >
                    <MIcon name="close" size={16} />
                  </button>
                </div>
              ))}
              {current.items.length === 0 ? (
                <p className="rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border)] p-3 text-center text-xs text-[color:var(--v2-muted)]">
                  Sin consejos. Añade al menos uno.
                </p>
              ) : null}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => addItem(active)}
                disabled={current.items.length >= COACH_GUIDANCE_MAX_ITEMS}
                className={cn(
                  BTN_BASE,
                  'h-8 border border-[color:var(--v2-border)] px-2.5 text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
                )}
              >
                <MIcon name="add" size={15} />
                Añadir consejo
              </button>
              <span className="text-label text-[color:var(--v2-muted)]">
                {current.items.length} / {COACH_GUIDANCE_MAX_ITEMS} consejos
              </span>
            </div>

            {current.saveError ? (
              <p className="mt-3 text-xs font-medium text-[color:var(--v2-danger)]">{current.saveError}</p>
            ) : current.saved ? (
              <p className="mt-3 text-xs font-medium text-[color:var(--v2-accent)]">Guardado</p>
            ) : null}

            {/* Footer */}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={current.saving}
                className={cn(
                  BTN_BASE,
                  'h-10 border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
                )}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => save(active)}
                disabled={current.saving}
                className={cn(
                  BTN_BASE,
                  'h-10 bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]',
                )}
              >
                <MIcon name="check" size={16} />
                {current.saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
