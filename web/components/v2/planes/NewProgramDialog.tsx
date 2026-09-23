'use client';

// «+ Nuevo programa»: nombre, semanas y nivel OPCIONAL (por defecto «Sin nivel»,
// DECISIONS 2026-08-23 — antes se colaba el primero de la lista en silencio).
// Crea las semanas vacías y abre la rejilla.

import { useState } from 'react';
import { Button, Dialog, Field, Input, Select } from '@/components/v2/ui';

const NO_LEVEL = '__none__';

export function NewProgramDialog({
  levels,
  maxWeeks,
  onClose,
  onCreated,
}: {
  levels: Array<{ id: string; name: string; label: string }>;
  maxWeeks: number;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState('4');
  const [level, setLevel] = useState(NO_LEVEL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ field: 'name' | 'weeks' | 'form'; message: string } | null>(null);

  const create = async () => {
    const n = Number(weeks);
    if (!name.trim()) return setError({ field: 'name', message: 'Ponle un nombre.' });
    if (!Number.isInteger(n) || n < 1 || n > maxWeeks) return setError({ field: 'weeks', message: `Entre 1 y ${maxWeeks} semanas.` });
    setSaving(true);
    const res = await fetch('/api/coach/program-months/create', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), week_count: n, level_id: level === NO_LEVEL ? null : Number(level) }),
    }).catch(() => null);
    const body = res ? ((await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null) : null;
    if (!res?.ok || !body?.id) {
      setSaving(false);
      return setError({ field: 'form', message: body?.error?.message ?? 'No se pudo crear. Vuelve a intentarlo.' });
    }
    onCreated(body.id);
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Nuevo programa"
      footer={
        <>
          {error?.field === 'form' ? <p className="mr-auto t-body-sm text-v2-danger">{error.message}</p> : null}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void create()}>
            Crear y abrir
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Field label="Nombre" hint="Lo ve el atleta en su plan." error={error?.field === 'name' ? error.message : undefined}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} size="lg" autoFocus value={name} maxLength={200} placeholder="Acumulación HYROX" onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Semanas" error={error?.field === 'weeks' ? error.message : undefined}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} aria-describedby={describedBy} invalid={invalid} size="lg" inputMode="numeric" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
            )}
          </Field>
          <Field label="Nivel" optional>
            {({ id }) => (
              <Select
                id={id}
                size="lg"
                value={level}
                onValueChange={setLevel}
                options={[{ value: NO_LEVEL, label: 'Sin nivel' }, ...levels.map((l) => ({ value: l.id, label: l.name }))]}
              />
            )}
          </Field>
        </div>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
