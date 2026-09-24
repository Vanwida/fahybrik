'use client';

// «···» del programa: nombre / nivel / etiquetas, añadir semana, duplicar y
// archivar. Lo que cambia la forma del programa recarga la
// rejilla desde el servidor, así que espera a que no quede nada por guardar.

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Archive, Copy, FileUp, MoreHorizontal, Pencil, Plus } from 'lucide-react';
import type { ProgramRow } from '@/lib/dashboard/programming/programs';
import { IconButton, Menu, useToast } from '@/components/v2/ui';
import { ProgramMetaDialog } from './ProgramMetaDialog';
import { ImportWorkoutsDialog } from './ImportWorkoutsDialog';
import type { MicroWeekRef } from '@/lib/dashboard/v2/import-review';

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  const data = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
  return { ok: !!res?.ok, data };
}

function errorOf(data: Record<string, unknown> | null): string | undefined {
  return (data?.error as { message?: string } | undefined)?.message;
}

export function ProgramMenu({
  program,
  levels,
  weekCount,
  maxWeeks,
  hasPending,
  onChanged,
  importWeeks,
}: {
  program: ProgramRow;
  levels: Array<{ id: string; name: string; label: string; archived?: boolean }>;
  weekCount: number;
  maxWeeks: number;
  hasPending: () => boolean;
  onChanged: () => void;
  /** Semanas para «Importar…» (Excel, texto, foto o IA → celdas). */
  importWeeks: MicroWeekRef[];
}) {
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [meta, setMeta] = useState(false);
  const [importing, setImporting] = useState(false);

  const guard = () => {
    if (!hasPending()) return true;
    toast({ title: 'Espera un momento: aún se está guardando' });
    return false;
  };

  const addWeek = async () => {
    if (!guard()) return;
    const r = await call(`/api/coach/program-months/${program.id}/weeks`, 'POST');
    if (!r.ok) return toast({ title: errorOf(r.data) ?? 'No se pudo añadir la semana', tone: 'danger' });
    toast({ title: `Semana ${weekCount + 1} añadida` });
    onChanged();
  };

  const duplicate = async () => {
    if (!guard()) return;
    const r = await call(`/api/coach/program-months/${program.id}/duplicate`, 'POST');
    if (!r.ok || !r.data?.id) return toast({ title: errorOf(r.data) ?? 'No se pudo duplicar', tone: 'danger' });
    toast({ title: `«${program.name} (copia)» creado` });
    router.push(`/${locale}/programar/programas/${String(r.data.id)}`);
  };

  const archive = async () => {
    if (!guard()) return;
    if (program.archived) {
      const r = await call(`/api/coach/program-months/${program.id}`, 'PATCH', { archived: false });
      if (!r.ok) return toast({ title: errorOf(r.data) ?? 'No se pudo recuperar', tone: 'danger' });
      toast({ title: `«${program.name}» vuelve a la lista` });
      return onChanged();
    }
    const r = await call(`/api/coach/program-months/${program.id}`, 'PATCH', { archived: true });
    if (!r.ok) return toast({ title: errorOf(r.data) ?? 'No se pudo archivar', tone: 'danger' });
    toast({
      title: `«${program.name}» archivado`,
      description: 'Quien ya lo tiene asignado lo sigue haciendo.',
      undo: async () => {
        await call(`/api/coach/program-months/${program.id}`, 'PATCH', { archived: false });
        router.refresh();
      },
    });
    router.push(`/${locale}/programar/programas`);
  };

  return (
    <>
      <Menu
        trigger={<IconButton icon={MoreHorizontal} label="Más acciones del programa" variant="secondary" />}
        items={[
          { label: 'Nombre, nivel y etiquetas…', icon: Pencil, onSelect: () => setMeta(true) },
          { type: 'separator' },
          { label: 'Importar…', icon: FileUp, onSelect: () => { if (guard()) setImporting(true); } },
          { label: 'Añadir semana', icon: Plus, disabled: weekCount >= maxWeeks, onSelect: () => void addWeek() },
          { type: 'separator' },
          { label: 'Duplicar programa', icon: Copy, onSelect: () => void duplicate() },
          { label: program.archived ? 'Recuperar' : 'Archivar', icon: Archive, onSelect: () => void archive() },
        ]}
      />
      {importing ? (
        <ImportWorkoutsDialog
          microcycleId={program.id}
          microWeeks={importWeeks}
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            onChanged();
          }}
        />
      ) : null}
      {meta ? <ProgramMetaDialog program={program} levels={levels} onClose={() => setMeta(false)} onSaved={onChanged} /> : null}
    </>
  );
}
