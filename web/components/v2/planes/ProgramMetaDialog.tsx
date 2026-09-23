'use client';

// Nombre (lo ve el atleta), nivel (opcional: «Sin nivel» por defecto —
// DECISIONS 2026-08-23) y etiquetas del coach para encontrarlo en la lista.

import { useState } from 'react';
import type { ProgramRow } from '@/lib/dashboard/programming/programs';
import { Button, Dialog, Field, Input, Select, useToast } from '@/components/v2/ui';
import { useLevelAxisLabel } from '@/components/v2/controls/useLevelAxisLabel';

const NO_LEVEL = '__none__';

export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 20);
}

export function ProgramMetaDialog({
  program,
  levels,
  onClose,
  onSaved,
}: {
  program: ProgramRow;
  levels: Array<{ id: string; name: string; label: string; archived?: boolean }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const axisLabel = useLevelAxisLabel();
  const [name, setName] = useState(program.name);
  const [level, setLevel] = useState<string>(program.level?.id ?? NO_LEVEL);
  const [tags, setTags] = useState(program.tags.join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return setError('Ponle un nombre.');
    setSaving(true);
    const res = await fetch(`/api/coach/program-months/${program.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), level_id: level === NO_LEVEL ? null : level, tags: parseTags(tags) }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = res ? ((await res.json().catch(() => null)) as { error?: { message?: string } } | null) : null;
      return setError(body?.error?.message ?? 'No se pudo guardar.');
    }
    toast({ title: 'Programa guardado' });
    onSaved();
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Nombre, nivel y etiquetas"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Nombre" hint="Lo ve el atleta." error={error}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} size="lg" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
        <Field label={axisLabel} optional>
          {({ id }) => (
            <Select
              id={id}
              size="lg"
              value={level}
              onValueChange={setLevel}
              options={[{ value: NO_LEVEL, label: 'Sin nivel' }, ...levels.map((l) => ({ value: l.id, label: `${l.label && l.label !== l.name ? `${l.name} · ${l.label}` : l.name}${l.archived ? ' (retirado)' : ''}` }))]}
            />
          )}
        </Field>
        <Field label="Etiquetas" optional hint="Separadas por comas: HYROX, Base, Mañanas.">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} size="lg" value={tags} onChange={(e) => setTags(e.target.value)} />}
        </Field>
      </form>
    </Dialog>
  );
}
