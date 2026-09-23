'use client';

// Vistas de Atletas como FilterChips: las de serie (Necesitan algo, Todos, Sin
// plan, No ven su semana, Pausados) y las del coach, cada una con su recuento.
// «+ Guardar vista» guarda los filtros y el orden de la URL con un nombre; una
// vista del coach se renombra o se borra desde su menú (···). Borrar se deshace.

import { useState } from 'react';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import type { SavedView } from '@fahybrid/shared/schema/saved-views';
import { BUILTIN_SAVED_VIEWS, SAVED_VIEW_NAME_MAX } from '@fahybrid/shared/schema/saved-views';
import type { RosterRow } from '@/lib/dashboard/athletes/roster';
import { Button, Dialog, Field, FilterChip, IconButton, Input, Menu, useToast } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { countForQuery, sameView, type RosterFilter } from './roster-query';

type Editing = { mode: 'create' } | { mode: 'rename'; view: SavedView } | null;

export function ViewChips({
  rows,
  filter,
  currentViewQuery,
  views,
  onViewsChange,
  onPick,
}: {
  rows: readonly RosterRow[];
  filter: RosterFilter;
  /** Lo que se guardaría ahora (filtros + orden). */
  currentViewQuery: string;
  views: SavedView[];
  onViewsChange: (views: SavedView[]) => void;
  onPick: (query: string) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const matchesAny =
    BUILTIN_SAVED_VIEWS.some((v) => sameView(filter, v.query)) || views.some((v) => sameView(filter, v.query));

  const open = (e: Editing) => {
    setEditing(e);
    setName(e?.mode === 'rename' ? e.view.name : '');
    setError(null);
  };

  const submit = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      if (editing.mode === 'create') {
        const res = await apiJson<{ view: SavedView }>('/api/coach/saved-views', {
          method: 'POST',
          body: { name, query: currentViewQuery },
        });
        onViewsChange([...views, res.view]);
        toast({ title: `Vista «${res.view.name}» guardada`, tone: 'ok' });
      } else {
        const res = await apiJson<{ view: SavedView }>(`/api/coach/saved-views/${editing.view.id}`, {
          method: 'PATCH',
          body: { name },
        });
        onViewsChange(views.map((v) => (v.id === res.view.id ? res.view : v)));
      }
      setEditing(null);
    } catch (err) {
      setError(errorMessage(err, 'No se ha podido guardar la vista.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (view: SavedView) => {
    try {
      await apiJson(`/api/coach/saved-views/${view.id}`, { method: 'DELETE' });
      const rest = views.filter((v) => v.id !== view.id);
      onViewsChange(rest);
      toast({
        title: `Vista «${view.name}» borrada`,
        undo: async () => {
          try {
            const res = await apiJson<{ view: SavedView }>('/api/coach/saved-views', {
              method: 'POST',
              body: { name: view.name, query: view.query, position: view.position },
            });
            onViewsChange([...rest, res.view].sort((a, b) => a.position - b.position));
          } catch (err) {
            toast({ title: 'No se ha podido recuperar la vista', description: errorMessage(err), tone: 'danger' });
          }
        },
      });
    } catch (err) {
      toast({ title: 'No se ha podido borrar la vista', description: errorMessage(err), tone: 'danger' });
    }
  };

  return (
    <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {BUILTIN_SAVED_VIEWS.map((v) => (
        <FilterChip key={v.key} active={sameView(filter, v.query)} count={countForQuery(rows, v.query)} onClick={() => onPick(v.query)}>
          {v.name}
        </FilterChip>
      ))}
      {views.map((v) => {
        const active = sameView(filter, v.query);
        return (
          <span key={v.id} className="inline-flex shrink-0 items-center">
            <FilterChip active={active} count={countForQuery(rows, v.query)} onClick={() => onPick(v.query)}>
              {v.name}
            </FilterChip>
            {active ? (
              <Menu
                align="start"
                trigger={<IconButton icon={MoreHorizontal} label={`Opciones de «${v.name}»`} size="sm" />}
                items={[
                  { label: 'Renombrar…', icon: Pencil, onSelect: () => open({ mode: 'rename', view: v }) },
                  { type: 'separator' },
                  { label: 'Borrar vista', icon: Trash2, danger: true, onSelect: () => void remove(v) },
                ]}
              />
            ) : null}
          </span>
        );
      })}
      {!matchesAny ? (
        <FilterChip variant="add" icon={Plus} onClick={() => open({ mode: 'create' })}>
          Guardar vista
        </FilterChip>
      ) : null}

      <Dialog
        open={editing != null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        size="sm"
        title={editing?.mode === 'rename' ? 'Renombrar vista' : 'Guardar vista'}
        description={editing?.mode === 'create' ? 'Guarda estos filtros y este orden con un nombre.' : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void submit()}>
              Guardar
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Nombre" error={error}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                size="lg"
                autoFocus
                maxLength={SAVED_VIEW_NAME_MAX}
                value={name}
                placeholder="p. ej. Carrera en octubre"
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
        </form>
      </Dialog>
    </div>
  );
}
