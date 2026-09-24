'use client';

// «+» en un día del calendario (P3): añadir un entreno de la biblioteca, uno en
// blanco (se abre el panel para escribirlo) o uno redactado con IA (en blanco +
// «Redactar con IA» ya abierto). Cada entreno nace con su copia propia para este
// atleta: la biblioteca no se toca.

import { useState } from 'react';
import { FilePlus2, PenLine, Plus } from 'lucide-react';
import { Button, Combobox, ErrorState, IconButton, Popover, Skeleton, useToast } from '@/components/v2/ui';
import { apiJson } from '@/components/v2/shared/api';
import { useLibrary } from './use-library';
import { dayLabel } from '@/lib/dashboard/v2/ficha-dates';
import { useFicha } from '../FichaContext';
import { planErrorMessage } from './use-calendar';

export function AddSession({ date, compact }: { date: string; compact?: boolean }) {
  const { shell, openSession, bumpCalendar } = useFicha();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'lib' | 'blank' | 'ai'>(null);
  const lib = useLibrary(open);

  const create = async (kind: 'lib' | 'blank' | 'ai') => {
    setBusy(kind);
    try {
      const body =
        kind === 'lib'
          ? { iso_date: date, template_id: Number(templateId) }
          : { iso_date: date, content_source: 'authored', display_title: 'Entreno' };
      const res = await apiJson<{ session: { assignment_id: string } }>(
        `/api/coach/athletes/${shell.athlete_id}/sessions`,
        { method: 'POST', body },
      );
      setOpen(false);
      setTemplateId(null);
      bumpCalendar();
      if (kind === 'lib') {
        const name = lib.rows?.find((r) => r.id === templateId)?.name ?? 'Entreno';
        toast({
          title: `${name} añadido al ${dayLabel(date)}`,
          tone: 'ok',
          action: { label: 'Abrir', onClick: () => openSession(res.session.assignment_id) },
        });
      } else {
        openSession(res.session.assignment_id, { ai: kind === 'ai' });
      }
    } catch (err) {
      toast({ title: 'No se ha podido añadir', description: planErrorMessage(err), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const options = lib.options;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      title={`Añadir · ${dayLabel(date)}`}
      align="start"
      className="w-80"
      trigger={
        <IconButton
          icon={Plus}
          label={`Añadir entreno el ${dayLabel(date)}`}
          size="sm"
          className={compact ? 'size-6' : 'opacity-60 hover:opacity-100 focus-visible:opacity-100'}
        />
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="t-meta text-v2-muted">De tu biblioteca</span>
          {lib.error ? (
            <ErrorState title="No se ha podido cargar la biblioteca" onRetry={lib.retry} />
          ) : lib.rows == null ? (
            <Skeleton className="h-8 w-full" />
          ) : lib.rows.length === 0 ? (
            <p className="t-body-sm text-v2-faint">Tu biblioteca no tiene entrenos todavía.</p>
          ) : (
            <div className="flex items-center gap-2">
              <Combobox
                options={options}
                value={templateId}
                onValueChange={setTemplateId}
                placeholder="Buscar entreno…"
                aria-label="Entreno de la biblioteca"
                className="flex-1"
              />
              <Button size="md" disabled={!templateId} loading={busy === 'lib'} onClick={() => void create('lib')}>
                Añadir
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 border-t border-v2-border pt-3">
          <Button variant="ghost" icon={FilePlus2} className="justify-start" loading={busy === 'blank'} onClick={() => void create('blank')}>
            Entreno en blanco
          </Button>
          <Button variant="ghost" icon={PenLine} className="justify-start" loading={busy === 'ai'} onClick={() => void create('ai')}>
            Redactar con IA
          </Button>
        </div>
      </div>
    </Popover>
  );
}
