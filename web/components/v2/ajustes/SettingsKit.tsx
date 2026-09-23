'use client';

// Piezas de los paneles de Ajustes: una sección (título + tarjeta con filas),
// una fila (etiqueta · estado de guardado · control · ayuda) y los campos que
// guardan al salir. Todo sobre los primitivos de components/v2/ui.

import { useId, useState, type ReactNode } from 'react';
import { Card, Input, SectionHeader, Textarea } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { SaveStatus, useSaveState, type SaveResult, type SaveState } from './autosave';

/** Una sección de un panel: ceja + tarjeta. Las filas van dentro, separadas por filetes. */
export function SettingsSection({
  title,
  action,
  children,
  className,
  bare = false,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Sin tarjeta (para contenidos que ya son una superficie: una lista, una tabla). */
  bare?: boolean;
}) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <SectionHeader title={title} action={action} />
      {bare ? children : <Card padding="none" className="divide-y divide-v2-border">{children}</Card>}
    </section>
  );
}

/**
 * Una fila de ajuste. `layout="stack"` = etiqueta encima del control (texto
 * largo); `inline` = etiqueta a la izquierda y control corto a la derecha
 * (números, interruptores, desplegables) — en el móvil se apila.
 */
export function SettingRow({
  label,
  hint,
  status,
  error,
  htmlFor,
  hintId,
  layout = 'stack',
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  status?: SaveState;
  error?: string | null;
  htmlFor?: string;
  /** Id de la línea de ayuda, para el aria-describedby del control. */
  hintId?: string;
  layout?: 'stack' | 'inline';
  children: ReactNode;
}) {
  const head = (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <label htmlFor={htmlFor} className="t-body font-medium text-v2-fg">
        {label}
      </label>
      {status ? <SaveStatus state={status} error={error} /> : null}
    </div>
  );
  if (layout === 'inline') {
    return (
      <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {head}
          {hint ? (
            <p id={hintId} className="t-body-sm text-v2-muted">
              {hint}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 px-4 py-3.5">
      {head}
      {children}
      {hint ? (
        <p id={hintId} className="t-meta text-v2-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Campo de texto que guarda al salir. `save` recibe el valor y devuelve el
 * resultado; si falla, el campo conserva lo escrito y la fila dice por qué.
 * Enter confirma (en una línea), Escape vuelve al último valor guardado.
 */
export function TextSetting({
  label,
  hint,
  value,
  save,
  placeholder,
  maxLength,
  multiline = false,
  rows = 3,
  type = 'text',
  required = false,
  autoComplete,
  showCount = false,
  inputClassName,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  save: (next: string) => Promise<SaveResult>;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  rows?: number;
  type?: 'text' | 'email' | 'url';
  required?: boolean;
  autoComplete?: string;
  showCount?: boolean;
  inputClassName?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(value);
  const { state, error, run } = useSaveState();
  const [localError, setLocalError] = useState<string | null>(null);

  const commit = async () => {
    if (draft.trim() === saved.trim()) {
      if (draft !== saved) setDraft(saved);
      return;
    }
    if (required && draft.trim() === '') {
      setLocalError('No puede quedar vacío.');
      return;
    }
    setLocalError(null);
    const ok = await run(() => save(draft));
    if (ok) setSaved(draft.trim());
  };

  const shownError = localError ?? error;
  const invalid = Boolean(localError) || state === 'error';
  const common = {
    id,
    value: draft,
    placeholder,
    maxLength,
    'aria-describedby': hint || showCount ? `${id}-hint` : undefined,
    onChange: (e: { target: { value: string } }) => {
      setDraft(e.target.value);
      if (localError) setLocalError(null);
    },
    onBlur: () => void commit(),
  };

  return (
    <SettingRow
      label={label}
      hint={
        showCount && maxLength ? (
          <span className="flex justify-between gap-3">
            <span>{hint}</span>
            <span className="t-tnum">
              {draft.length}/{maxLength}
            </span>
          </span>
        ) : (
          hint
        )
      }
      status={localError ? 'error' : state}
      error={shownError}
      htmlFor={id}
      hintId={`${id}-hint`}
    >
      {multiline ? (
        <Textarea
          {...common}
          rows={rows}
          invalid={invalid}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setDraft(saved);
          }}
          className={inputClassName}
        />
      ) : (
        <Input
          {...common}
          size="lg"
          type={type}
          autoComplete={autoComplete}
          invalid={invalid}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            if (e.key === 'Escape') setDraft(saved);
          }}
          className={inputClassName}
        />
      )}
    </SettingRow>
  );
}

/** Un dato que no se edita aquí (correo de acceso). */
export function ReadOnlySetting({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3.5">
      <span className="t-body font-medium text-v2-fg">{label}</span>
      <span className="truncate t-body text-v2-muted">{value}</span>
      {hint ? <span className="t-meta text-v2-faint">{hint}</span> : null}
    </div>
  );
}
