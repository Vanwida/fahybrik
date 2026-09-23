'use client';

import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OVERLAY_Z, usePanelPortal } from './portal';
import { OPTION_GROUP_LABEL, OPTION_ROW, POPUP_SURFACE } from './styles';

export interface SelectOption<V> {
  value: V;
  label: string;
  disabled?: boolean;
  /** Texto secundario a la derecha (un recuento, un detalle). */
  hint?: string;
}
export interface SelectGroup<V> {
  label: string;
  options: SelectOption<V>[];
}

export const TRIGGER_BASE = [
  'inline-flex min-w-0 items-center justify-between gap-2 rounded-ctl border border-v2-border bg-v2-surface',
  'text-left text-v2-fg outline-none transition-[border-color,box-shadow] duration-[var(--v2-dur-fast)]',
  'hover:border-v2-border-strong data-[popup-open]:border-v2-border-strong',
  'focus-visible:shadow-[0_0_0_2px_var(--v2-bg),0_0_0_4px_var(--v2-accent)]',
  'data-[placeholder]:text-v2-faint disabled:opacity-50',
].join(' ');

export const TRIGGER_SIZE = {
  sm: 'h-7 px-2 text-[13px]',
  md: 'h-8 px-2.5 text-[13px]',
  lg: 'h-10 px-3 text-sm',
} as const;

export interface SelectProps<V> {
  options: SelectOption<V>[] | SelectGroup<V>[];
  value: V | null;
  onValueChange: (value: V) => void;
  placeholder?: string;
  size?: keyof typeof TRIGGER_SIZE;
  /** Nombre accesible si no hay <label> asociado. */
  'aria-label'?: string;
  id?: string;
  disabled?: boolean;
  name?: string;
  className?: string;
}

function isGrouped<V>(o: SelectOption<V>[] | SelectGroup<V>[]): o is SelectGroup<V>[] {
  return o.length > 0 && 'options' in o[0];
}

function Option<V>({ option }: { option: SelectOption<V> }) {
  return (
    <SelectPrimitive.Item value={option.value} disabled={option.disabled} className={cn(OPTION_ROW, 'pl-7')}>
      <SelectPrimitive.ItemIndicator className="absolute left-2 flex items-center text-v2-fg">
        <Check className="size-3.5" strokeWidth={2} aria-hidden />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">{option.label}</SelectPrimitive.ItemText>
      {option.hint ? <span className="t-meta text-v2-faint t-tnum">{option.hint}</span> : null}
    </SelectPrimitive.Item>
  );
}

/** Desplegable de una opción. Teclado y lector de pantalla de Base UI. */
export function Select<V>({
  options,
  value,
  onValueChange,
  placeholder = 'Elegir…',
  size = 'md',
  disabled,
  name,
  className,
  id,
  ...aria
}: SelectProps<V>) {
  const { anchor, container } = usePanelPortal();
  const flat = isGrouped(options) ? options.flatMap((g) => g.options) : options;
  return (
    <SelectPrimitive.Root
      items={flat.map((o) => ({ value: o.value, label: o.label }))}
      value={value}
      onValueChange={(next) => onValueChange(next as V)}
      disabled={disabled}
      name={name}
    >
      <SelectPrimitive.Trigger
        ref={anchor}
        id={id}
        aria-label={aria['aria-label']}
        className={cn(TRIGGER_BASE, TRIGGER_SIZE[size], className)}
      >
        <SelectPrimitive.Value className="truncate" placeholder={placeholder} />
        <SelectPrimitive.Icon className="flex shrink-0 text-v2-faint">
          <ChevronDown className="size-3.5" strokeWidth={2} aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={container}>
        <SelectPrimitive.Positioner sideOffset={4} alignItemWithTrigger={false} className={OVERLAY_Z}>
          <SelectPrimitive.Popup
            className={cn(
              POPUP_SURFACE,
              'min-w-[var(--anchor-width)] max-w-[min(var(--available-width),22rem)]',
              'max-h-[min(var(--available-height),22rem)] overflow-y-auto overscroll-contain p-1',
            )}
          >
            <SelectPrimitive.List>
              {isGrouped(options)
                ? options.map((g) => (
                    <SelectPrimitive.Group key={g.label}>
                      <SelectPrimitive.GroupLabel className={OPTION_GROUP_LABEL}>{g.label}</SelectPrimitive.GroupLabel>
                      {g.options.map((o) => (
                        <Option key={String(o.value)} option={o} />
                      ))}
                    </SelectPrimitive.Group>
                  ))
                : options.map((o) => <Option key={String(o.value)} option={o} />)}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
