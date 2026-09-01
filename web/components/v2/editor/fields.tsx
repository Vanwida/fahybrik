'use client';

// fields — v2-native dense inputs for the prescription editor. The legacy
// PrescriptionControls read the v1 `.dark` token names (--accent, --border-
// subtle…); v2 is theme-isolated under `.v2-root[data-theme]`, so we re-skin the
// SAME control logic onto v2 tokens here. The values/formatters still come from
// the shared prescription-model (parseClock/formatClock/metersToKm…) — zero
// duplicated domain rules. One source for the number/clock/select cells used by
// PrescriptionFields and the type-specific item tables.

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/ui/MIcon';
import {
  formatClock,
  kmToMeters,
  metersToKm,
  parseClock,
} from '@/lib/programming/prescription-model';

export const v2FieldCell = cn(
  'v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)]',
  'bg-[color:var(--v2-surface-2)] px-2 py-1.5 text-sm text-[color:var(--v2-fg)]',
  'v2-num placeholder:font-sans placeholder:text-[color:var(--v2-faint)]',
  'outline-none focus:border-[color:var(--v2-border-strong)]',
);

export const v2SelectCell = cn(
  'v2-focus shrink-0 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)]',
  'bg-[color:var(--v2-surface-2)] px-2 py-1.5 text-xs font-semibold text-[color:var(--v2-fg)]',
  'outline-none focus:border-[color:var(--v2-border-strong)]',
);

// Prosa, no cifra: mismo lienzo que `v2FieldCell` pero SIN `v2-num` (una nota se
// escribe en la cara del texto, no en la monoespaciada de datos) y con alto
// ajustable por el coach.
export const v2NoteCell = cn(
  'v2-focus w-full resize-y rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)]',
  'bg-[color:var(--v2-surface-2)] px-2.5 py-2 text-body leading-relaxed text-[color:var(--v2-fg)]',
  'placeholder:text-[color:var(--v2-faint)]',
  'outline-none focus:border-[color:var(--v2-border-strong)]',
);

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="v2-micro">{children}</span>;
}

/**
 * El campo de NOTA del coach — texto libre que el ATLETA leerá en su móvil. Es
 * uno solo para las dos notas que existen (la del entreno, en la cabecera de la
 * sesión; la de una línea prescrita, en el compositor de dosis) para que las dos
 * se escriban y se lean igual.
 *
 * Tres reglas que lleva dentro y no se negocian:
 * - SIEMPRE visible (campo Y botón de ayuda). Nada de aparecer al hover: el
 *   coach edita desde el móvil (CONTRATO-UI §9.3) y un control que solo existe
 *   con ratón no existe.
 * - `maxLength` es el del esquema (constantes de shared/schema): así el cliente
 *   no puede componer un payload que el servidor rechace y perder lo escrito.
 * - La ayuda del modelo PROPONE, no escribe: devuelve borradores, el coach elige
 *   uno y sigue editándolo. Nada entra en el campo sin un clic suyo.
 */
export function NoteField({
  id,
  label,
  hint,
  value,
  placeholder,
  maxLength,
  rows = 2,
  onChange,
  onSuggest,
}: {
  id: string;
  label: string;
  /** Una línea que dice DÓNDE lo verá el atleta. */
  hint?: string;
  value: string;
  placeholder?: string;
  maxLength: number;
  rows?: number;
  onChange: (v: string) => void;
  /**
   * Pide borradores para ESTE campo. Sin ella no se pinta el botón (un campo de
   * nota sin contexto que mandar no tiene nada que sugerir). Nunca debe lanzar:
   * lista vacía = no hay propuesta y el campo se queda como estaba.
   */
  onSuggest?: () => Promise<string[]>;
}) {
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<string[]>([]);

  const askForDrafts = async () => {
    if (busy || !onSuggest) return;
    setBusy(true);
    setDrafts([]);
    try {
      setDrafts(await onSuggest());
    } catch {
      // Fallo blando: sin propuestas y sin ruido. El campo no se toca.
    } finally {
      setBusy(false);
    }
  };

  const panelId = `${id}-drafts`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="v2-micro block">
          {label}
        </label>
        {onSuggest ? (
          <button
            type="button"
            onClick={askForDrafts}
            disabled={busy}
            aria-expanded={drafts.length > 0}
            aria-controls={panelId}
            title="Propone borradores de esta nota a partir del entreno"
            className="v2-focus inline-flex h-6 shrink-0 items-center gap-1 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] px-2 text-label font-bold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-fg)] hover:text-[color:var(--v2-fg)] disabled:opacity-60"
          >
            <MIcon
              name={busy ? 'progress_activity' : 'lightbulb'}
              size={13}
              className={busy ? 'animate-spin' : undefined}
            />
            {busy ? 'Escribiendo…' : 'Ayuda IA'}
          </button>
        ) : null}
      </div>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={v2NoteCell}
      />
      {drafts.length > 0 ? (
        <div
          id={panelId}
          className="space-y-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] p-1.5"
        >
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="v2-micro">Elige un borrador y edítalo</span>
            <button
              type="button"
              onClick={() => setDrafts([])}
              aria-label="Descartar los borradores"
              className="v2-focus shrink-0 rounded-[var(--v2-r-2xs)] p-0.5 text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="close" size={14} />
            </button>
          </div>
          <ul className="space-y-1">
            {drafts.map((draft) => (
              <li key={draft}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(draft);
                    setDrafts([]);
                  }}
                  className="v2-focus w-full rounded-[var(--v2-r-2xs)] px-1.5 py-1 text-left text-label leading-relaxed text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface)] hover:text-[color:var(--v2-fg)]"
                >
                  {draft}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {hint ? (
        <p className="text-label leading-relaxed text-[color:var(--v2-faint)]">{hint}</p>
      ) : null}
    </div>
  );
}

export function NumberCell({
  value,
  ariaLabel,
  min,
  max,
  step,
  suffix,
  className,
  onChange,
}: {
  value: number | null;
  ariaLabel: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <input
        type="number"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(null);
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          let clamped = n;
          if (min !== undefined && clamped < min) clamped = min;
          if (max !== undefined && clamped > max) clamped = max;
          onChange(clamped);
        }}
        className={cn(v2FieldCell, suffix && 'pr-7')}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-label text-[color:var(--v2-muted)]">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

/** m:ss clock input (pace per unit / a duration). Stores seconds, shows m:ss. */
export function ClockCell({
  seconds,
  ariaLabel,
  placeholder = 'm:ss',
  className,
  onChange,
}: {
  seconds: number | null;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  onChange: (seconds: number | null) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      defaultValue={formatClock(seconds)}
      key={formatClock(seconds)}
      placeholder={placeholder}
      onBlur={(e) => onChange(parseClock(e.target.value))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={cn(v2FieldCell, 'text-center', className)}
    />
  );
}

export function TextCell({
  value,
  ariaLabel,
  placeholder,
  maxLength,
  className,
  onChange,
}: {
  value: string;
  ariaLabel: string;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className={cn(v2FieldCell, 'min-w-0 flex-1', className)}
    />
  );
}

/** Distance input with a m/km editing toggle (storage always meters). */
export function DistanceCell({
  meters,
  ariaPrefix,
  className,
  onChange,
}: {
  meters: number | null;
  ariaPrefix: string;
  className?: string;
  onChange: (meters: number | null) => void;
}) {
  // Default unit: km for ≥1km (runs), m otherwise (erg) — read once per render
  // from the current value so the unit stays stable while typing.
  const unit: 'm' | 'km' = meters != null && meters >= 1000 ? 'km' : 'm';
  const inKm = unit === 'km';
  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      <NumberCell
        value={meters == null ? null : inKm ? metersToKm(meters) : meters}
        ariaLabel={`${ariaPrefix} · distancia`}
        min={0}
        max={inKm ? 100 : 100000}
        step={inKm ? 0.1 : 1}
        suffix={unit}
        className="flex-1"
        onChange={(v) =>
          onChange(v == null ? null : inKm ? kmToMeters(v) : Math.round(v))
        }
      />
    </div>
  );
}

export { formatClock, parseClock };
