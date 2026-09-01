'use client';

// dose-controls — las piezas compartidas del compositor de dosis (rediseño del
// editor de microciclos, docs/design/microciclos-editor-rediseno-mockup.html):
// los chips de descanso con «otro» de teclado, el tempo plegado y las marcas de
// «propuesto» del importador. Valores frecuentes a un toque; el teclado SIEMPRE
// queda como alternativa (accesibilidad), nunca como único camino. Cero reglas
// de dominio: todo escribe campos del `Prescription` compartido.

import { useState } from 'react';
import { formatDuration } from '@fahybrid/shared/domain/prescription';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';
import { cn } from '@/lib/utils';
import { ClockCell, TextCell } from './fields';

/** Reps frecuentes de fuerza (mock aprobado). El teclado cubre el resto. */
export const REPS_CHIP_VALUES = [3, 4, 5, 8, 10, 12] as const;

/** Banda de %RM del compositor: 50-95 de 5 en 5 (mock aprobado). */
export const PCT_TICK_VALUES = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95] as const;

/** Descansos frecuentes entre series de fuerza (mock aprobado). */
export const STRENGTH_REST_VALUES = [45, 60, 90, 120, 180] as const;

/** Descansos frecuentes entre rondas de un circuito (mock aprobado). */
export const ROUND_REST_VALUES = [60, 90, 120, 180] as const;

// Valores centinela de los chips especiales (nunca son segundos reales).
const REST_NONE = -2;
const REST_OTHER = -1;

/**
 * Chips de descanso + «otro» (teclado). `allowNone` añade el «—» honesto:
 * sin descanso marcado (el dato se quita, no se inventa un cero).
 */
export function RestChips({
  seconds,
  values,
  allowNone = false,
  ariaLabel,
  onChange,
}: {
  seconds: number | null;
  values: readonly number[];
  allowNone?: boolean;
  ariaLabel: string;
  onChange: (seconds: number | null) => void;
}) {
  // «otro» se mantiene abierto mientras el coach teclea, y se abre solo cuando
  // el valor guardado no está entre los chips (así nunca se esconde un dato).
  const [otherOpen, setOtherOpen] = useState(false);
  const inChips = seconds != null && values.includes(seconds);
  const showClock = otherOpen || (seconds != null && !inChips);

  const options: { value: number; label: string; hint?: string }[] = [
    ...(allowNone ? [{ value: REST_NONE, label: '—', hint: 'sin descanso' }] : []),
    ...values.map((v) => ({ value: v, label: formatDuration(v) })),
    { value: REST_OTHER, label: 'otro' },
  ];

  const selected = showClock
    ? REST_OTHER
    : seconds == null
      ? allowNone
        ? REST_NONE
        : null
      : seconds;

  return (
    <div className="space-y-1.5">
      <ChipGroup
        options={options}
        value={selected}
        ariaLabel={ariaLabel}
        onChange={(v) => {
          if (v === REST_OTHER) return setOtherOpen(true);
          setOtherOpen(false);
          onChange(v === REST_NONE ? null : v);
        }}
      />
      {showClock ? (
        <ClockCell
          seconds={seconds}
          ariaLabel={`${ariaLabel} (m:ss)`}
          className="max-w-[7rem]"
          onChange={(s) => onChange(s)}
        />
      ) : null}
    </div>
  );
}

/**
 * Tempo plegado tras «＋ tempo (3-1-1)»: casi nadie lo toca, así que no ocupa
 * sitio hasta que hace falta. Con valor guardado se muestra abierto siempre.
 */
export function TempoDisclosure({
  tempo,
  onChange,
}: {
  tempo: string;
  onChange: (tempo: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open && !tempo) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="v2-focus inline-flex h-[34px] items-center gap-1.5 self-start rounded-[var(--v2-r-pill)] border border-dashed border-[color:var(--v2-border)] px-3.5 text-body font-bold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
      >
        ＋ tempo (3-1-1)
      </button>
    );
  }
  return (
    <TextCell
      value={tempo}
      ariaLabel="Tempo"
      placeholder="3-1-1"
      maxLength={20}
      className="max-w-[9rem]"
      onChange={onChange}
    />
  );
}

/**
 * Un valor que NO escribió el coach: lo propuso el importador porque la fuente
 * no lo enseñaba. Trazo discontinuo ámbar, el mismo lenguaje que la revisión —
 * y es FORMA además de color, así que se distingue sin ver el ámbar. Se
 * acompaña siempre de «, propuesto» en la etiqueta accesible del campo: un
 * lector de pantalla no ve el trazo.
 */
export const PROPOSED_CELL =
  'rounded-[var(--v2-r-2xs)] outline outline-1 outline-dashed outline-offset-1 outline-[color:var(--v2-warn)]';

/** La etiqueta accesible de un campo propuesto. */
export function proposedAria(label: string, proposed: boolean): string {
  return proposed ? `${label}, propuesto` : label;
}

/** Un control del compositor: micro-etiqueta arriba, control debajo, y la
 *  marca «propuesto» del importador cuando toca. */
export function Control({
  label,
  hint,
  proposed = false,
  children,
}: {
  label: string;
  hint?: string;
  proposed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', proposed && `${PROPOSED_CELL} p-1`)}>
      <span className="v2-micro flex items-baseline gap-2">
        {label}
        {hint ? (
          <span className="font-medium normal-case tracking-normal text-[color:var(--v2-faint)]">
            {hint}
          </span>
        ) : null}
      </span>
      {children}
    </div>
  );
}
