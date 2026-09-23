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
// Idiom: the panel's Dialog + primitives; a SegmentedControl switches context.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  SegmentedControl,
  SkeletonRows,
  type SegmentItem,
} from '@/components/v2/ui';
import {
  COACH_GUIDANCE_CONTEXTS,
  COACH_GUIDANCE_MAX_ITEMS,
  COACH_GUIDANCE_MAX_ITEM_CHARS,
  type CoachGuidanceContext,
} from '@fahybrid/shared/domain/coach-guidance';
import type { CoachGuidanceResponse } from '@fahybrid/shared/schema/coach-guidance';

const TAB_OPTIONS: SegmentItem<CoachGuidanceContext>[] = [
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
    <Dialog
      open
      onOpenChange={(o) => (o ? null : onClose())}
      size="lg"
      title="Consejos de dobles"
      description="Tácticas que ve la pareja en el tablero de carrera y en la simulación."
      footer={
        current.loading || current.loadError ? (
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        ) : (
          <>
            {current.saveError ? (
              <span className="mr-auto t-body-sm text-v2-danger">{current.saveError}</span>
            ) : current.saved ? (
              <span className="mr-auto t-body-sm text-v2-ok">Guardado</span>
            ) : null}
            <Button variant="ghost" onClick={onClose} disabled={current.saving}>
              Cancelar
            </Button>
            <Button variant="primary" icon={Check} loading={current.saving} onClick={() => void save(active)}>
              Guardar
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl<CoachGuidanceContext>
          aria-label="Dónde se ven"
          items={TAB_OPTIONS}
          value={active}
          onValueChange={setActive}
          size="sm"
          className="self-start"
        />
        {current.loading ? (
          <SkeletonRows rows={4} />
        ) : current.loadError ? (
          <ErrorState title="No se han podido cargar los consejos" description={current.loadError} />
        ) : (
          <div className="flex flex-col gap-2">
            {!current.isCustom ? (
              <p className="t-meta text-v2-faint">Son los consejos de serie: al guardar pasan a ser los tuyos.</p>
            ) : null}
            {current.items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  aria-label={`Consejo ${index + 1}`}
                  size="md"
                  value={item}
                  onChange={(e) => updateItem(active, index, e.target.value)}
                  maxLength={COACH_GUIDANCE_MAX_ITEM_CHARS}
                  placeholder="Escribe un consejo…"
                  trailing={`${item.length}/${COACH_GUIDANCE_MAX_ITEM_CHARS}`}
                  className="min-w-0 flex-1"
                />
                <IconButton icon={X} label={`Quitar consejo ${index + 1}`} size="md" onClick={() => removeItem(active, index)} />
              </div>
            ))}
            {current.items.length === 0 ? <EmptyState title="Sin consejos" description="añade al menos uno" /> : null}
            <div className="flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="ghost"
                icon={Plus}
                className="-ml-2"
                disabled={current.items.length >= COACH_GUIDANCE_MAX_ITEMS}
                onClick={() => addItem(active)}
              >
                Añadir consejo
              </Button>
              <span className="t-meta text-v2-faint t-tnum">
                {current.items.length} de {COACH_GUIDANCE_MAX_ITEMS}
              </span>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
