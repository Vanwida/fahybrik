'use client';

// «Reemplazar desde la biblioteca»: pone otro entreno de la biblioteca en el mismo
// día y quita este. Primero crea el nuevo; si eso falla, el viejo sigue en su sitio.

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button, Combobox, ErrorState, Popover, Skeleton, useToast } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { dayLabel } from '@/lib/dashboard/v2/ficha-dates';
import { useFicha } from '../FichaContext';
import { planErrorMessage } from '../plan/use-calendar';
import { useLibrary } from '../plan/use-library';

export function ReplaceFromLibrary({
  icon,
  date,
  sessionId,
  onReplaced,
}: {
  icon: LucideIcon;
  date: string;
  sessionId: string;
  onReplaced: (newId: string) => void;
}) {
  const { shell } = useFicha();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lib = useLibrary(open);
  const base = `/api/coach/athletes/${shell.athlete_id}`;

  const replace = async () => {
    if (!templateId) return;
    setBusy(true);
    let created: string | null = null;
    try {
      const res = await apiJson<{ session: { assignment_id: string } }>(`${base}/sessions`, {
        method: 'POST',
        body: { iso_date: date, template_id: Number(templateId) },
      });
      created = res.session.assignment_id;
      await apiJson(`${base}/plan/day/${date}`, {
        method: 'PATCH',
        body: { kind: 'rest', assignment_id: Number(sessionId) },
      });
      setOpen(false);
      toast({ title: `Entreno del ${dayLabel(date)} reemplazado`, tone: 'ok' });
      onReplaced(created);
    } catch (err) {
      toast({
        title: created ? 'Se añadió el nuevo, pero no se pudo quitar el anterior' : 'No se ha podido reemplazar',
        description: created ? errorMessage(err) : planErrorMessage(err),
        tone: 'danger',
      });
      if (created) onReplaced(created);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      title="Reemplazar por…"
      className="w-80"
      trigger={
        <Button size="sm" icon={icon}>
          Reemplazar…
        </Button>
      }
    >
      {lib.error ? (
        <ErrorState title="No se ha podido cargar la biblioteca" onRetry={lib.retry} />
      ) : lib.rows == null ? (
        <Skeleton className="h-8 w-full" />
      ) : lib.rows.length === 0 ? (
        <p className="t-body-sm text-v2-faint">Tu biblioteca no tiene entrenos todavía.</p>
      ) : (
        <div className="flex items-center gap-2">
          <Combobox
            options={lib.options}
            value={templateId}
            onValueChange={setTemplateId}
            placeholder="Buscar entreno…"
            aria-label="Entreno de la biblioteca"
            className="flex-1"
          />
          <Button variant="primary" disabled={!templateId} loading={busy} onClick={() => void replace()}>
            Reemplazar
          </Button>
        </div>
      )}
    </Popover>
  );
}
