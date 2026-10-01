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
import type { ProgramCopyAction } from './use-program-copy';
import { athleteStructureHref } from './program-context-link';

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
  copy,
  prepare,
  returnHref,
}: {
  program: ProgramRow;
  levels: Array<{ id: string; name: string; label: string; archived?: boolean }>;
  weekCount: number;
  maxWeeks: number;
  hasPending: () => boolean;
  onChanged: () => void;
  /** Semanas para «Importar…» (Excel, texto, foto o IA → celdas). */
  importWeeks: MicroWeekRef[];
  copy: ProgramCopyAction;
  prepare: () => Promise<boolean>;
  returnHref: string | null;
}) {
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [meta, setMeta] = useState(false);
  const [importing, setImporting] = useState(false);
  const structureLocked = Boolean(program.personal) || Boolean(program.structure_locked);

  const guard = () => {
    if (!hasPending()) return true;
    toast({ title: 'Espera un momento: aún se está guardando' });
    return false;
  };

  const addWeek = async () => {
    if (!guard()) return;
    const r = await call(`/api/coach/program-months/${program.id}/weeks`, 'POST');
    if (!r.ok) {
      const assigned = (r.data?.error as { code?: string } | undefined)?.code === 'assigned_structure';
      if (assigned) onChanged();
      return toast({ title: errorOf(r.data) ?? 'No se pudo añadir la semana', tone: 'danger',
        ...(assigned ? { action: { label: 'Crear copia', onClick: () => void copy.create() } } : {}) });
    }
    toast({ title: `Semana ${weekCount + 1} añadida` });
    onChanged();
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
          ...(program.personal ? [{ label: 'Estructura y nombre del plan…', icon: Pencil, onSelect: () => { void prepare().then((ready) => { if (ready) router.push(`/${locale}${athleteStructureHref(program.personal!.athlete_id, returnHref, locale)}`); }); } }] : [{ label: 'Nombre, nivel y etiquetas…', icon: Pencil, onSelect: () => setMeta(true) }]),
          { type: 'separator' },
          { label: 'Importar…', icon: FileUp, onSelect: () => { if (guard()) setImporting(true); } },
          { label: 'Añadir semana', icon: Plus, disabled: structureLocked || weekCount >= maxWeeks, onSelect: () => void addWeek() },
          { type: 'separator' },
          ...(!program.personal ? [{ label: 'Duplicar programa', icon: Copy, disabled: copy.busy, onSelect: () => void copy.create() }] : []),
          ...(!program.personal ? [{ label: program.archived ? 'Recuperar' : 'Archivar', icon: Archive, onSelect: () => void archive() }] : []),
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
