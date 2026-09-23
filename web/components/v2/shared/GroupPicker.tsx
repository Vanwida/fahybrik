'use client';

// Elegir VARIOS grupos del coach (se cargan una vez de /api/coach/groups y se
// filtran en local; un coach tiene decenas, no miles).
//
//   <GroupPicker value={groups} onValueChange={setGroups} />
//
// `value` son objetos {kind:'group', id, label, hint:'20 atletas'}.

import { useEffect, useState } from 'react';
import { EntityPicker, type PickerItem } from './EntityPicker';
import { groupItem, loadGroups } from './pickers';
import { errorMessage } from './api';

export type PickedGroup = PickerItem & { kind: 'group' };

/** Carga los grupos del coach como opciones (compartido con AssignSheet). */
export function useGroupOptions(): { groups: PickedGroup[] | null; error: string | null } {
  const [groups, setGroups] = useState<PickedGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    loadGroups(ctrl.signal)
      .then((gs) => setGroups(gs.map((g) => groupItem(g) as PickedGroup)))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(errorMessage(err, 'No se han podido cargar los grupos'));
      });
    return () => ctrl.abort();
  }, []);
  return { groups, error };
}

export function GroupPicker({
  value,
  onValueChange,
  placeholder = 'Buscar grupo…',
  id,
  disabled,
  className,
  'aria-label': ariaLabel = 'Grupos',
}: {
  value: PickedGroup[];
  onValueChange: (next: PickedGroup[]) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const { groups, error } = useGroupOptions();
  return (
    <EntityPicker
      value={value}
      onValueChange={(next) => onValueChange(next.filter((i): i is PickedGroup => i.kind === 'group'))}
      options={groups ?? []}
      loadError={
        error ?? (groups == null ? 'Cargando grupos…' : groups.length === 0 ? 'Todavía no tienes grupos' : null)
      }
      placeholder={placeholder}
      emptyText="Ningún grupo con ese nombre"
      aria-label={ariaLabel}
      id={id}
      disabled={disabled}
      className={className}
    />
  );
}
