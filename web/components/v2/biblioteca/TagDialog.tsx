'use client';

// Etiquetar en bloque: añadir etiquetas (separadas por comas) y quitar las que
// ya tienen los seleccionados. Las etiquetas son del coach, sin catálogo impuesto.

import { useState } from 'react';
import { Button, Checkbox, Dialog, Field, Input } from '@/components/v2/ui';

export function TagDialog({
  count,
  noun,
  existing,
  onClose,
  onApply,
}: {
  count: number;
  noun: [string, string];
  existing: string[];
  onClose: () => void;
  onApply: (add: string[], remove: string[]) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [remove, setRemove] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const add = [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 20);
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`Etiquetar ${count} ${count === 1 ? noun[0] : noun[1]}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={add.length === 0 && remove.length === 0}
            onClick={async () => {
              setSaving(true);
              await onApply(add, remove);
              setSaving(false);
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Añadir" hint="Separadas por comas: Fuerza, HYROX, Base.">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} size="lg" autoFocus value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
        {existing.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 t-meta text-v2-muted">Quitar</legend>
            {existing.map((t) => (
              <Checkbox
                key={t}
                label={t}
                checked={remove.includes(t)}
                onCheckedChange={(c) => setRemove((r) => (c ? [...r, t] : r.filter((x) => x !== t)))}
              />
            ))}
          </fieldset>
        ) : null}
      </div>
    </Dialog>
  );
}
