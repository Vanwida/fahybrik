'use client';

// La página de un grupo: su plan de un vistazo (programas sobre el calendario,
// volumen planificado por semana y carreras), los programas en orden, la gente y
// la regla automática (opcional). «Asignar…» abre el panel de siempre con el
// grupo ya puesto; «Asignar a nuevos (n)» mete a quien cumple la regla y aún no
// está.

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, UserPlus } from 'lucide-react';
import type { GroupDetail } from '@fahybrid/shared/schema/groups';
import type { AssignResponse } from '@fahybrid/shared/schema/assign-many';
import type { GroupRace, PlanWeekVolume } from '@/lib/dashboard/programming/group-plan';
import { Button, Card, CardHeader, Dialog, Field, IconButton, Input, Menu, PageHeader, useToast } from '@/components/v2/ui';
import { AssignSheet } from '@/components/v2/shared/AssignSheet';
import { AthletePicker, type PickedAthlete } from '@/components/v2/shared/AthletePicker';
import { GroupTimeline } from './GroupTimeline';
import { GroupPrograms } from './GroupPrograms';
import { GroupMembers } from './GroupMembers';
import { GroupRule } from './GroupRule';
import { groupApi } from './group-api';
import { groupPaceLine } from './group-pace';

export function GroupPage({
  group,
  volumes,
  races,
  programs,
  levels,
}: {
  group: GroupDetail;
  volumes: Record<string, PlanWeekVolume[]>;
  races: GroupRace[];
  programs: Array<{ id: string; name: string; weeks: number }>;
  levels: Array<{ id: string; name: string; label: string }>;
}) {
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [assign, setAssign] = useState(false);
  const [adding, setAdding] = useState<PickedAthlete[] | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const addMembers = async (ids: string[]) => {
    setBusy(true);
    const r = await groupApi<AssignResponse>(`/api/coach/groups/${group.id}/members`, 'POST', { athlete_ids: ids, action: 'add' });
    setBusy(false);
    if (!r.ok) return toast({ title: r.error, tone: 'danger' });
    const applied = r.data.applied;
    router.refresh();
    toast({
      title: `${applied?.assigned ?? ids.length} ${applied?.assigned === 1 ? 'atleta entra' : 'atletas entran'} en «${group.display_name}»`,
      description: applied && applied.skipped + applied.failed > 0 ? `${applied.skipped + applied.failed} no: revisa su plan.` : undefined,
      undo: applied?.batch_id
        ? async () => {
            await groupApi(`/api/coach/assign/${applied.batch_id}/undo`, 'POST');
            router.refresh();
          }
        : undefined,
    });
  };

  const subtitle = [
    `${group.member_count} ${group.member_count === 1 ? 'atleta' : 'atletas'}`,
    group.total_weeks ? `plan de ${group.total_weeks} semanas` : 'sin plan',
    group.programs.length > 0 ? (group.end_policy === 'repeat' ? 'se repite' : group.end_policy === 'stop' ? 'termina al acabar' : 'sube de nivel al acabar') : null,
    groupPaceLine(group.members),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: `/${locale}/programar/grupos`, label: 'Grupos' }}
        title={group.display_name}
        subtitle={subtitle}
        actions={
          <>
            {group.rule_candidates.length > 0 ? (
              <Button onClick={() => setAddingNew(true)}>Asignar a nuevos ({group.rule_candidates.length})</Button>
            ) : null}
            <Button icon={UserPlus} onClick={() => setAdding([])}>
              Añadir atletas
            </Button>
            <Button variant="primary" onClick={() => setAssign(true)} disabled={group.member_count === 0}>
              Asignar…
            </Button>
            <Menu
              trigger={<IconButton icon={MoreHorizontal} label="Más acciones del grupo" variant="secondary" />}
              items={[
                { label: 'Cambiar nombre…', onSelect: () => setRenaming(true) },
                { type: 'separator' },
                { label: 'Eliminar grupo…', danger: true, onSelect: () => setDeleting(true) },
              ]}
            />
          </>
        }
      />

      <Card>
        <CardHeader title="Plan" subtitle={group.calendar.items.length > 0 ? `${group.calendar.items.length} ${group.calendar.items.length === 1 ? 'programa' : 'programas'} en fechas` : undefined} />
        <GroupTimeline group={group} volumes={volumes} races={races} />
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-5">
          <GroupPrograms group={group} programs={programs} onChanged={() => router.refresh()} />
          <GroupRule group={group} levels={levels} onChanged={() => router.refresh()} />
        </div>
        <GroupMembers group={group} onChanged={() => router.refresh()} onAdd={() => setAdding([])} />
      </div>

      {assign ? <AssignSheet open onClose={() => setAssign(false)} groupIds={[group.id]} onAssigned={() => router.refresh()} /> : null}

      <Dialog
        open={adding != null}
        onOpenChange={(o) => { if (!o) setAdding(null); }}
        title={`Añadir atletas a «${group.display_name}»`}
        description="Reciben el programa y la semana en que está el grupo el lunes que viene. Quien ya hace un programa de este plan lo conserva."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!adding || adding.length === 0}
              onClick={async () => {
                const ids = (adding ?? []).map((a) => a.id);
                await addMembers(ids);
                setAdding(null);
              }}
            >
              {adding && adding.length > 0 ? `Añadir ${adding.length}` : 'Añadir'}
            </Button>
          </>
        }
      >
        <AthletePicker value={adding ?? []} onValueChange={setAdding} placeholder="Buscar atleta…" />
      </Dialog>

      <Dialog
        open={addingNew}
        onOpenChange={setAddingNew}
        title={`Asignar a nuevos (${group.rule_candidates.length})`}
        description={`Cumplen la regla (${group.level?.name ?? ''} · ${group.days_per_week ?? ''} días) y no están en ningún grupo.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddingNew(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                await addMembers(group.rule_candidates.map((c) => c.athlete_id));
                setAddingNew(false);
              }}
            >
              Añadir {group.rule_candidates.length}
            </Button>
          </>
        }
      >
        <p className="t-body-sm text-v2-muted">{group.rule_candidates.map((c) => c.name).join(', ')}</p>
      </Dialog>

      <RenameDialog open={renaming} current={group.name ?? group.display_name} onClose={() => setRenaming(false)} onSave={async (name) => {
        const r = await groupApi(`/api/coach/groups/${group.id}`, 'PATCH', { name });
        if (!r.ok) return r.error;
        setRenaming(false);
        router.refresh();
        return null;
      }} />

      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        size="sm"
        title={`¿Eliminar «${group.display_name}»?`}
        description="Sus atletas salen del grupo pero conservan el plan que ya tienen asignado. Los programas no se borran."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const r = await groupApi(`/api/coach/groups/${group.id}`, 'DELETE');
                setBusy(false);
                if (!r.ok) return toast({ title: r.error, tone: 'danger' });
                toast({ title: `«${group.display_name}» eliminado` });
                router.push(`/${locale}/programar/grupos`);
              }}
            >
              Eliminar
            </Button>
          </>
        }
      />
    </div>
  );
}

function RenameDialog({ open, current, onClose, onSave }: { open: boolean; current: string; onClose: () => void; onSave: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      size="sm"
      title="Nombre del grupo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={async () => {
              setSaving(true);
              setError(await onSave(name.trim()));
              setSaving(false);
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <GroupNameInput value={name} onChange={setName} error={error} />
    </Dialog>
  );
}


function GroupNameInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error: string | null }) {
  return (
    <Field label="Nombre" error={error}>
      {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} size="lg" autoFocus value={value} maxLength={80} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}
