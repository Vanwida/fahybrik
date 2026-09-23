'use client';

// Elegir VARIOS atletas con búsqueda.
//
//   <AthletePicker value={picked} onValueChange={setPicked} />
//   <AthletePicker value={picked} onValueChange={setPicked} athletes={rosterRows.map(toPickerAthlete)} />
//
// Con `athletes` (el roster que la pantalla ya tiene) filtra en local; sin él
// busca en /api/coach/search (máx. 5 por búsqueda). `value` son objetos
// {kind:'athlete', id, label} — el nombre viaja con el id.

import { useCallback } from 'react';
import { EntityPicker, type PickerItem } from './EntityPicker';
import { searchAthletes } from './pickers';

export type PickedAthlete = PickerItem & { kind: 'athlete' };

/** De una fila con nombre (roster, Hoy) a una opción del selector. */
export function toPickerAthlete(a: {
  athlete_id?: string;
  id?: string;
  name: string;
  avatar_url?: string | null;
  level?: { label: string } | string | null;
}): PickedAthlete {
  const level = typeof a.level === 'string' ? a.level : (a.level?.label ?? null);
  return {
    kind: 'athlete',
    id: String(a.athlete_id ?? a.id ?? ''),
    label: a.name,
    hint: level,
    avatar_url: a.avatar_url ?? null,
  };
}

export function AthletePicker({
  value,
  onValueChange,
  athletes,
  placeholder = 'Buscar atleta…',
  id,
  disabled,
  className,
  'aria-label': ariaLabel = 'Atletas',
}: {
  value: PickedAthlete[];
  onValueChange: (next: PickedAthlete[]) => void;
  athletes?: PickedAthlete[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const search = useCallback((q: string, signal: AbortSignal) => searchAthletes(q, signal), []);
  return (
    <EntityPicker
      value={value}
      onValueChange={(next) => onValueChange(next.filter((i): i is PickedAthlete => i.kind === 'athlete'))}
      options={athletes}
      search={athletes ? undefined : search}
      placeholder={placeholder}
      emptyText="Ningún atleta con ese nombre"
      aria-label={ariaLabel}
      id={id}
      disabled={disabled}
      className={className}
    />
  );
}
