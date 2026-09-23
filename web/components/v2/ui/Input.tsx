'use client';

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Campos de texto. Un solo dibujo: fondo de superficie, borde, 6 px, foco con
// el anillo del acento. Tamaños como el botón: sm 28 · md 32 · lg 40 (form).

const FIELD_BASE = [
  'w-full min-w-0 rounded-ctl border border-v2-border bg-v2-surface text-v2-fg',
  'placeholder:text-v2-faint outline-none',
  'transition-[border-color,box-shadow] duration-[var(--v2-dur-fast)]',
  'hover:border-v2-border-strong',
  'focus-visible:border-v2-border-strong focus-visible:shadow-[0_0_0_3px_var(--v2-accent-soft)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-[invalid=true]:border-v2-danger aria-[invalid=true]:focus-visible:shadow-[0_0_0_3px_var(--v2-danger-soft)]',
].join(' ');

const INPUT_SIZE = {
  sm: 'h-7 px-2 text-[13px]',
  md: 'h-8 px-2.5 text-[13px]',
  lg: 'h-10 px-3 text-sm',
} as const;

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  size?: keyof typeof INPUT_SIZE;
  /** Icono dentro, a la izquierda (búsqueda). */
  icon?: LucideIcon;
  /** Algo a la derecha dentro del campo: una unidad («kg»), un Kbd. */
  trailing?: ReactNode;
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', icon: Icon, trailing, invalid, className, ...props },
  ref,
) {
  const input = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        FIELD_BASE,
        INPUT_SIZE[size],
        Icon && (size === 'lg' ? 'pl-9' : 'pl-8'),
        trailing ? 'pr-10' : null,
        !Icon && !trailing && className,
      )}
      {...props}
    />
  );
  if (!Icon && !trailing) return input;
  return (
    <div className={cn('relative flex w-full min-w-0 items-center', className)}>
      {Icon ? (
        <Icon
          aria-hidden
          strokeWidth={1.75}
          className={cn(
            'pointer-events-none absolute text-v2-faint',
            size === 'lg' ? 'left-3 size-4' : 'left-2.5 size-3.5',
          )}
        />
      ) : null}
      {input}
      {trailing ? (
        <span className="pointer-events-none absolute right-2 flex items-center t-meta text-v2-faint">
          {trailing}
        </span>
      ) : null}
    </div>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(FIELD_BASE, 'px-3 py-2 text-sm leading-5 [field-sizing:content] min-h-16 resize-y', className)}
      {...props}
    />
  );
});

/**
 * Etiqueta + control + ayuda/error, con los ids cableados (aria-describedby).
 * El control va como hijo ÚNICO; Field le inyecta `id` y la descripción.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  optional,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactElement;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = error || hint ? hintId : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="t-meta text-v2-muted">
        {label}
        {optional ? <span className="ml-1 font-normal text-v2-faint">(opcional)</span> : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={hintId} className="t-meta text-v2-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="t-meta text-v2-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
