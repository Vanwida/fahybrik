'use client';

// MultiCombobox — selector MÚLTIPLE con búsqueda sobre el Combobox de Base UI: lo
// elegido son chips dentro del campo (× o Retroceso quitan), las flechas recorren,
// Enter elige, Escape cierra. Las opciones pueden venir ya cargadas (`options`,
// filtradas aquí sin acentos) o de una búsqueda remota (`search`, con retardo y
// cancelación). Genérico: la pantalla dice cómo se llama, se agrupa y se pinta
// cada opción (`getKey`, `getLabel`, `getHint`, `getGroup`, `renderLeading`).
// Lo elegido viaja como los propios objetos, para que un chip nunca adivine un
// nombre. Base de EntityPicker (atletas y grupos).

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Check, LoaderCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OVERLAY_Z, usePanelPortal } from './portal';
import { OPTION_GROUP_LABEL, OPTION_ROW, POPUP_SURFACE } from './styles';

/** Quita acentos y mayúsculas: «Martí» encuentra «marti». */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

interface OptionGroup<T> {
  value: string;
  items: T[];
}

export interface MultiComboboxProps<T> {
  value: T[];
  onValueChange: (next: T[]) => void;
  /** Opciones ya cargadas (se filtran aquí por etiqueta y pista). */
  options?: T[];
  /** Búsqueda remota: se llama con el texto (≥1 carácter) tras 150 ms. */
  search?: (query: string, signal: AbortSignal) => Promise<T[]>;
  /** Identidad estable de una opción. */
  getKey: (o: T) => string;
  getLabel: (o: T) => string;
  /** Texto secundario a la derecha (nivel, «20 atletas»…). */
  getHint?: (o: T) => string | null | undefined;
  /** Grupo de la lista («Grupos», «Atletas»); con más de uno se rotulan. */
  getGroup?: (o: T) => string;
  /** Orden de los grupos (los que no estén, detrás en orden de aparición). */
  groupOrder?: readonly string[];
  /** Icono o avatar delante de la etiqueta (lista y chip). */
  renderLeading?: (o: T, where: 'chip' | 'option') => ReactNode;
  /** ¿El chip enseña también la pista? (por defecto no). */
  chipHint?: (o: T) => boolean;
  placeholder?: string;
  emptyText?: string;
  'aria-label': string;
  id?: string;
  disabled?: boolean;
  /** Error de carga de `options` (se enseña en la lista). */
  loadError?: string | null;
  className?: string;
}

export function MultiCombobox<T>({
  value,
  onValueChange,
  options,
  search,
  getKey,
  getLabel,
  getHint,
  getGroup,
  groupOrder = [],
  renderLeading,
  chipHint,
  placeholder = 'Buscar…',
  emptyText = 'Nada coincide',
  disabled,
  loadError,
  className,
  id,
  ...aria
}: MultiComboboxProps<T>) {
  const { anchor, container } = usePanelPortal();
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Búsqueda remota con retardo y cancelación de la anterior.
  useEffect(() => {
    if (!search) return;
    const q = query.trim();
    if (!q) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setSearching(true);
      search(q, ctrl.signal)
        .then((items) => {
          setRemote(items);
          setSearchError(false);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setSearchError(true);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setSearching(false);
        });
    }, 150);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [query, search]);

  // Sin texto no hay resultados remotos que enseñar (se derivan, no se borran).
  const hasQuery = query.trim().length > 0;
  const searchingShown = hasQuery && searching;
  const visible = useMemo(() => {
    const remoteShown = hasQuery ? remote : [];
    const q = fold(query.trim());
    const local = (options ?? []).filter((o) => !q || fold(`${getLabel(o)} ${getHint?.(o) ?? ''}`).includes(q));
    const seen = new Set(local.map(getKey));
    const merged = [...local, ...remoteShown.filter((r) => !seen.has(getKey(r)))];
    if (!getGroup) return merged.length > 0 ? [{ value: '', items: merged }] : [];
    const names = [...new Set([...groupOrder, ...merged.map(getGroup)])];
    const groups: OptionGroup<T>[] = [];
    for (const name of names) {
      const items = merged.filter((m) => getGroup(m) === name);
      if (items.length > 0) groups.push({ value: name, items });
    }
    return groups;
  }, [options, remote, hasQuery, query, getKey, getLabel, getHint, getGroup, groupOrder]);

  const grouped = visible.length > 1;
  const status =
    loadError ??
    (searchError
      ? 'No se ha podido buscar'
      : searchingShown
        ? null
        : query.trim() || !search
          ? emptyText
          : 'Escribe para buscar');

  return (
    <ComboboxPrimitive.Root
      multiple
      items={visible}
      filter={null}
      value={value}
      onValueChange={(next) => onValueChange((next ?? []) as T[])}
      inputValue={query}
      onInputValueChange={(v) => setQuery(v)}
      itemToStringLabel={(o: T) => getLabel(o)}
      itemToStringValue={(o: T) => getKey(o)}
      isItemEqualToValue={(a: T, b: T) => getKey(a) === getKey(b)}
      disabled={disabled}
    >
      <ComboboxPrimitive.Chips
        ref={anchor}
        className={cn(
          'flex min-h-10 w-full flex-wrap items-center gap-1 rounded-ctl border border-v2-border bg-v2-surface px-1.5 py-1',
          'hover:border-v2-border-strong focus-within:border-v2-border-strong focus-within:shadow-[0_0_0_3px_var(--v2-accent-soft)]',
          disabled && 'pointer-events-none opacity-50',
          className,
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((item) => {
          const hint = chipHint?.(item) ? getHint?.(item) : null;
          return (
            <ComboboxPrimitive.Chip
              key={getKey(item)}
              aria-label={getLabel(item)}
              className="inline-flex h-6 max-w-full items-center gap-1 rounded-[4px] bg-v2-surface-2 pr-0.5 pl-1.5 text-[13px] font-medium text-v2-fg outline-none data-[highlighted]:bg-v2-select"
            >
              {renderLeading?.(item, 'chip')}
              <span className="truncate">{getLabel(item)}</span>
              {hint ? <span className="t-meta text-v2-faint t-tnum">{hint}</span> : null}
              <ComboboxPrimitive.ChipRemove
                aria-label={`Quitar ${getLabel(item)}`}
                className="flex size-5 items-center justify-center rounded-[3px] text-v2-faint outline-none hover:bg-v2-hover hover:text-v2-fg focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]"
              >
                <X aria-hidden strokeWidth={2} className="size-3" />
              </ComboboxPrimitive.ChipRemove>
            </ComboboxPrimitive.Chip>
          );
        })}
        <ComboboxPrimitive.Input
          ref={inputRef}
          id={id}
          aria-label={aria['aria-label']}
          placeholder={value.length > 0 ? 'Añadir…' : placeholder}
          className="h-7 min-w-24 flex-1 bg-transparent px-1.5 text-[13px] text-v2-fg outline-none placeholder:text-v2-faint"
        />
        {searchingShown ? (
          <LoaderCircle aria-hidden className="mr-1 size-3.5 shrink-0 animate-spin text-v2-faint" />
        ) : null}
      </ComboboxPrimitive.Chips>
      <ComboboxPrimitive.Portal container={container}>
        <ComboboxPrimitive.Positioner sideOffset={4} className={OVERLAY_Z}>
          <ComboboxPrimitive.Popup
            className={cn(
              POPUP_SURFACE,
              'w-[var(--anchor-width)] min-w-64 max-h-[min(var(--available-height),20rem)] overflow-y-auto overscroll-contain p-1',
            )}
          >
            <ComboboxPrimitive.Empty className="px-2 py-2 t-body-sm text-v2-faint empty:hidden">
              {status}
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List>
              {(group: OptionGroup<T>) => (
                <ComboboxPrimitive.Group key={group.value} items={group.items}>
                  {grouped ? (
                    <ComboboxPrimitive.GroupLabel className={OPTION_GROUP_LABEL}>
                      {group.value}
                    </ComboboxPrimitive.GroupLabel>
                  ) : null}
                  <ComboboxPrimitive.Collection>
                    {(o: T) => (
                      <ComboboxPrimitive.Item key={getKey(o)} value={o} className={cn(OPTION_ROW, 'pl-7')}>
                        <ComboboxPrimitive.ItemIndicator className="absolute left-2 flex items-center">
                          <Check className="size-3.5" strokeWidth={2} aria-hidden />
                        </ComboboxPrimitive.ItemIndicator>
                        {renderLeading?.(o, 'option')}
                        <span className="min-w-0 flex-1 truncate">{getLabel(o)}</span>
                        {getHint?.(o) ? <span className="t-meta text-v2-faint t-tnum">{getHint(o)}</span> : null}
                      </ComboboxPrimitive.Item>
                    )}
                  </ComboboxPrimitive.Collection>
                </ComboboxPrimitive.Group>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
}
