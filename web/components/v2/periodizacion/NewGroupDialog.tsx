'use client';

// «+ Nuevo grupo»: solo el nombre. La gente, los programas y la regla automática
// (opcional) se ponen en la página del grupo.

import { useState } from 'react';
import { Button, Dialog, Field, Input } from '@/components/v2/ui';

export function NewGroupDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    if (!name.trim()) return setError('Ponle un nombre al grupo.');
    setSaving(true);
    const res = await fetch('/api/coach/groups', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    }).catch(() => null);
    const body = res ? ((await res.json().catch(() => null)) as { group?: { id: string }; error?: { message?: string } } | null) : null;
    if (!res?.ok || !body?.group) {
      setSaving(false);
      return setError(body?.error?.message ?? 'No se pudo crear. Vuelve a intentarlo.');
    }
    onCreated(body.group.id);
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Nuevo grupo"
      footer={
        <>
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
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Field label="Nombre" error={error}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} size="lg" autoFocus value={name} maxLength={80} placeholder="HYROX mañanas" onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
