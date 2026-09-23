'use client';

// Selector MÚLTIPLE con búsqueda (atletas, grupos o los dos) sobre el Combobox
// de Base UI: lo elegido son chips dentro del campo (× o Retroceso quitan), las
// flechas recorren, Enter elige, Escape cierra. Las opciones pueden venir ya
// cargadas (`options`, filtradas aquí sin acentos) o de una búsqueda remota
// (`search`, con retardo). Lo elegido viaja como objetos {id, label} para que un
// chip nunca tenga que adivinar un nombre.
//
// Base de AthletePicker, GroupPicker y del «Para» de AssignSheet. No se usa suelto
// desde las pantallas: usa los envoltorios.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Check, LoaderCircle, Users, X } from 'lucide-react';
import { Avatar } from '@/components/v2/ui';
import { OVERLAY_Z, usePanelPortal } from '@/components/v2/ui/portal';
import { OPTION_GROUP_LABEL, OPTION_ROW, POPUP_SURFACE } from '@/components/v2/ui/styles';
import { cn } from '@/lib/utils';

export interface PickerItem {
  kind: 'athlete' | 'group';
  id: string;
  label: string;
  /** Texto secundario: nivel del atleta, «20 atletas» del grupo. */
  hint?: string | null;
  avatar_url?: string | null;
}

interface PickerGroup {
  value: string;
  items: PickerItem[];
}

/** Quita acentos y mayúsculas: «Martí» encuentra «marti». */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const keyOf = (i: PickerItem) => `${i.kind}:${i.id}`;
const EMPTY: PickerItem[] = [];
const GROUP_LABEL: Record<PickerItem['kind'], string> = { group: 'Grupos', athlete: 'Atletas' };

export interface EntityPickerProps {
  value: PickerItem[];
  onValueChange: (next: PickerItem[]) => void;
  /** Opciones ya cargadas (se filtran aquí). */
  options?: PickerItem[];
  /** Búsqueda remota: se llama con el texto (≥1 carácter) tras 150 ms. */
  search?: (query: string, signal: AbortSignal) => Promise<PickerItem[]>;
  placeholder?: string;
  emptyText?: string;
  'aria-label': string;
  id?: string;
  disabled?: boolean;
  /** Error de carga de `options` (se enseña en la lista). */
  loadError?: string | null;
  className?: string;
}

export function EntityPicker({
  value,
  onValueChange,
  options,
  search,
  placeholder = 'Buscar…',
  emptyText = 'Nada coincide',
  disabled,
  loadError,
  className,
  id,
  ...aria
}: EntityPickerProps) {
  const { anchor, container } = usePanelPortal();
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<PickerItem[]>([]);
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
  const remoteShown = hasQuery ? remote : EMPTY;
  const searchingShown = hasQuery && searching;
  const visible = useMemo(() => {
    const q = fold(query.trim());
    const local = (options ?? []).filter((o) => !q || fold(`${o.label} ${o.hint ?? ''}`).includes(q));
    const seen = new Set(local.map(keyOf));
    const merged = [...local, ...remoteShown.filter((r) => !seen.has(keyOf(r)))];
    const groups: PickerGroup[] = [];
    for (const kind of ['group', 'athlete'] as const) {
      const items = merged.filter((m) => m.kind === kind);
      if (items.length > 0) groups.push({ value: GROUP_LABEL[kind], items });
    }
    return groups;
  }, [options, remoteShown, query]);

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
      onValueChange={(next) => onValueChange((next ?? []) as PickerItem[])}
      inputValue={query}
      onInputValueChange={(v) => setQuery(v)}
      itemToStringLabel={(o: PickerItem) => o.label}
      itemToStringValue={(o: PickerItem) => keyOf(o)}
      isItemEqualToValue={(a: PickerItem, b: PickerItem) => keyOf(a) === keyOf(b)}
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
        {value.map((item) => (
          <ComboboxPrimitive.Chip
            key={keyOf(item)}
            aria-label={item.label}
            className="inline-flex h-6 max-w-full items-center gap-1 rounded-[4px] bg-v2-surface-2 pr-0.5 pl-1.5 text-[13px] font-medium text-v2-fg outline-none data-[highlighted]:bg-v2-select"
          >
            {item.kind === 'group' ? (
              <Users aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0 text-v2-muted" />
            ) : (
              <Avatar name={item.label} src={item.avatar_url} size="xs" className="-ml-0.5" />
            )}
            <span className="truncate">{item.label}</span>
            {item.hint && item.kind === 'group' ? (
              <span className="t-meta text-v2-faint t-tnum">{item.hint}</span>
            ) : null}
            <ComboboxPrimitive.ChipRemove
              aria-label={`Quitar ${item.label}`}
              className="flex size-5 items-center justify-center rounded-[3px] text-v2-faint outline-none hover:bg-v2-hover hover:text-v2-fg focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]"
            >
              <X aria-hidden strokeWidth={2} className="size-3" />
            </ComboboxPrimitive.ChipRemove>
          </ComboboxPrimitive.Chip>
        ))}
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
              {(group: PickerGroup) => (
                <ComboboxPrimitive.Group key={group.value} items={group.items}>
                  {grouped ? (
                    <ComboboxPrimitive.GroupLabel className={OPTION_GROUP_LABEL}>
                      {group.value}
                    </ComboboxPrimitive.GroupLabel>
                  ) : null}
                  <ComboboxPrimitive.Collection>
                    {(o: PickerItem) => (
                      <ComboboxPrimitive.Item key={keyOf(o)} value={o} className={cn(OPTION_ROW, 'pl-7')}>
                        <ComboboxPrimitive.ItemIndicator className="absolute left-2 flex items-center">
                          <Check className="size-3.5" strokeWidth={2} aria-hidden />
                        </ComboboxPrimitive.ItemIndicator>
                        {o.kind === 'group' ? (
                          <Users aria-hidden strokeWidth={1.75} />
                        ) : (
                          <Avatar name={o.label} src={o.avatar_url} size="xs" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{o.label}</span>
                        {o.hint ? <span className="t-meta text-v2-faint t-tnum">{o.hint}</span> : null}
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
