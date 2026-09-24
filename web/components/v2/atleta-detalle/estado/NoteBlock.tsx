'use client';

// Nota privada del coach sobre el atleta (R9): editable aquí, fijada arriba de su
// estado. Cada guardado queda como nota nueva (el historial no se pisa); se ve la
// última. El atleta no la ve nunca.

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button, IconButton, Textarea, useToast } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { shortDate } from '@/components/v2/shared/format';
import type { FichaEstado } from '@/lib/dashboard/v2/atleta-detalle-types';
import { useFicha } from '../FichaContext';

const NOTE_MAX = 2000;

export function NoteBlock({ note }: { note: FichaEstado['note'] }) {
  const { shell, refresh } = useFicha();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note?.body ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const body = draft.trim();
    if (!body || body === note?.body) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await apiJson(`/api/coach/athletes/${shell.athlete_id}/notes`, { method: 'POST', body: { body } });
      setEditing(false);
      refresh();
    } catch (err) {
      toast({ title: 'No se ha podido guardar la nota', description: errorMessage(err), tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-v2-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="t-label text-v2-faint">Nota privada</span>
        {!editing ? (
          <IconButton icon={Pencil} label={note ? 'Editar nota' : 'Escribir nota'} size="sm" onClick={() => setEditing(true)} />
        ) : null}
      </div>
      {editing ? (
        <>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={NOTE_MAX}
            rows={3}
            autoFocus
            aria-label="Nota privada"
            placeholder="Solo la ves tú: molestias, contexto, lo que no quieres olvidar…"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void save();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button size="sm" variant="primary" loading={saving} disabled={!draft.trim()} onClick={() => void save()}>
              Guardar
            </Button>
          </div>
        </>
      ) : note ? (
        <>
          <p className="whitespace-pre-line t-body text-v2-fg">{note.body}</p>
          <span className="t-meta text-v2-faint">Editada el {shortDate(note.created_at)}</span>
        </>
      ) : (
        <span className="t-body-sm text-v2-faint">Sin nota · solo la ves tú</span>
      )}
    </div>
  );
}
