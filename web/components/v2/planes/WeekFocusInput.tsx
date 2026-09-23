'use client';

// El foco de la semana («Base», «Descarga»): lo lee el atleta en su plan. Se
// guarda al salir del campo (Enter también), sin botón.

import { useState } from 'react';
import { Input, useToast } from '@/components/v2/ui';
import { cn } from '@/lib/utils';

export function WeekFocusInput({
  weekId,
  value,
  onSaved,
}: {
  weekId: string;
  value: string | null;
  onSaved: (weekId: string, focus: string | null) => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next = text.trim() || null;
    if (next === (value ?? null)) return;
    setSaving(true);
    const res = await fetch(`/api/coach/program-weeks/${weekId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ focus: next }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      toast({ title: 'No se pudo guardar el foco de la semana', tone: 'danger' });
      setText(value ?? '');
      return;
    }
    onSaved(weekId, next);
  };

  return (
    <Input
      size="sm"
      value={text}
      maxLength={200}
      placeholder="Foco…"
      aria-label="Foco de la semana"
      title={text || undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(value ?? '');
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn('border-transparent bg-transparent px-1 text-v2-muted focus-visible:bg-v2-surface focus-visible:text-v2-fg', saving && 'opacity-60')}
    />
  );
}
