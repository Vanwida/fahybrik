'use client';

// Los diálogos de las acciones en bloque de Atletas. Cada uno dice ANTES qué va a
// pasar (previa) y, al hacerlo, lo confirma con un aviso que se puede deshacer
// cuando deshacer tiene sentido (publicar → volver a ocultar; grupo → el lote
// de asignar; pausar → reanudar). Un mensaje enviado no se puede des-enviar: el
// botón «Enviar» es la confirmación.

import { useEffect, useMemo, useState } from 'react';
import type { AssignResponse, OnConflict } from '@fahybrid/shared/schema/assign-many';
import { PAUSE_REASON_LABELS, PAUSE_REASONS, type PauseReason } from '@fahybrid/shared/domain/coach/athlete-lifecycle';
import type { RosterRow } from '@/lib/dashboard/athletes/roster';
import {
  Button,
  Dialog,
  ErrorState,
  Field,
  Input,
  SegmentedControl,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/v2/ui';
import { AssignPreviewSummary, receivingCount } from '@/components/v2/shared/AssignPreview';
import { useGroupOptions } from '@/components/v2/shared/GroupPicker';
import { errorMessage } from '@/components/v2/shared/api';
import { mondayLabel, upcomingMondays, weekdayDate } from '@/components/v2/shared/format';
import { atletas, broadcast, hideWeek, publishWeek, runBulk, skippedLine, undoAssign } from './bulk-api';

interface BulkDialogProps {
  open: boolean;
  onClose: () => void;
  athletes: RosterRow[];
  onDone: () => void;
}

const ids = (rows: RosterRow[]) => rows.map((r) => r.athlete_id);

// ── Publicar semana ───────────────────────────────────────────────────────────

export function PublishWeekDialog({
  open,
  onClose,
  athletes,
  onDone,
  weekStart,
  nextWeekStart,
  today,
}: BulkDialogProps & { weekStart: string; nextWeekStart: string; today: string }) {
  const { toast } = useToast();
  const [week, setWeek] = useState<string>(weekStart);
  const [busy, setBusy] = useState(false);
  const isThis = week === weekStart;
  const visible = athletes.filter((a) => a.week_visibility === 'visible').length;
  const empty = athletes.filter((a) => a.week_visibility === 'sin_plan' || a.week_visibility === 'terminado').length;
  const toPublish = isThis ? athletes.length - visible - empty : athletes.length;

  const run = async () => {
    setBusy(true);
    try {
      const res = await publishWeek(ids(athletes), week);
      const opened = res.results.filter((r) => r.became_visible).map((r) => r.athlete_id);
      toast({
        title: `Semana del ${weekdayDate(week)} publicada a ${atletas(res.published)}`,
        description: res.already_visible > 0 ? `${res.already_visible} ya la veían` : undefined,
        tone: 'ok',
        undo:
          opened.length > 0
            ? async () => {
                const n = await hideWeek(opened, week);
                toast({ title: `Vuelve a estar oculta para ${atletas(n)}` });
                onDone();
              }
            : undefined,
      });
      onClose();
      onDone();
    } catch (err) {
      toast({ title: 'No se ha podido publicar', description: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? null : onClose())}
      title={`Publicar semana · ${atletas(athletes.length)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={toPublish === 0} onClick={() => void run()}>
            {isThis ? `Publicar a ${toPublish}` : 'Publicar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl
          aria-label="Qué semana"
          value={isThis ? 'this' : 'next'}
          onValueChange={(v) => setWeek(v === 'this' ? weekStart : nextWeekStart)}
          items={[
            { value: 'this', label: mondayLabel(weekStart, today) },
            { value: 'next', label: mondayLabel(nextWeekStart, today) },
          ]}
        />
        {isThis ? (
          <ul className="flex flex-col gap-1 t-body-sm text-v2-muted">
            <li>
              <span className="font-semibold text-v2-fg t-tnum">{toPublish}</span> la verán desde ya y les llega un aviso.
            </li>
            {visible > 0 ? <li className="t-tnum">{visible} ya la ven.</li> : null}
            {empty > 0 ? <li className="t-tnum">{empty} no tienen nada programado esa semana.</li> : null}
          </ul>
        ) : (
          <p className="t-body-sm text-v2-muted">
            Quien la tenga oculta la verá desde ya y le llega un aviso. Quien no tenga nada programado, se queda igual.
          </p>
        )}
      </div>
    </Dialog>
  );
}

// ── Mensaje a varios ──────────────────────────────────────────────────────────

/** Tope del envío a varios (el del endpoint de difusión). */
export const BROADCAST_MAX = 100;

export function MessageDialog({ open, onClose, athletes, onDone }: BulkDialogProps) {
  const { toast } = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const tooMany = athletes.length > BROADCAST_MAX;

  const send = async () => {
    setBusy(true);
    try {
      const res = await broadcast(ids(athletes), body.trim());
      const failedNames = athletes.filter((a) => res.failed_ids.includes(a.athlete_id)).map((a) => a.name);
      toast({
        title: `Enviado a ${atletas(res.sent)}`,
        description: failedNames.length > 0 ? `No ha llegado a ${failedNames.join(', ')}` : 'Cada uno lo recibe en su chat.',
        tone: failedNames.length > 0 ? 'warn' : 'ok',
      });
      setBody('');
      onClose();
      onDone();
    } catch (err) {
      toast({ title: 'No se ha podido enviar', description: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? null : onClose())}
      title={`Mensaje a ${atletas(athletes.length)}`}
      description="Le llega a cada uno en su chat, como un mensaje tuyo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={!body.trim() || tooMany} onClick={() => void send()}>
            Enviar a {athletes.length}
          </Button>
        </>
      }
    >
      <Field
        label="Mensaje"
        error={tooMany ? `Como mucho ${BROADCAST_MAX} atletas por envío. Quita ${athletes.length - BROADCAST_MAX}.` : null}
      >
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            rows={5}
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribe el mensaje…"
          />
        )}
      </Field>
    </Dialog>
  );
}

// ── Añadir a grupo ────────────────────────────────────────────────────────────

const CONFLICT_ITEMS: { value: OnConflict; label: string }[] = [
  { value: 'chain', label: 'Detrás de lo suyo' },
  { value: 'replace', label: 'Sustituir' },
  { value: 'skip', label: 'Saltar' },
];

export function GroupDialog({ open, onClose, athletes, onDone, today }: BulkDialogProps & { today: string }) {
  const { toast } = useToast();
  const { groups, error: groupsError } = useGroupOptions();
  const mondays = useMemo(() => upcomingMondays(today, 8), [today]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [start, setStart] = useState<string>(mondays[1] ?? mondays[0]!);
  const [conflict, setConflict] = useState<OnConflict>('chain');
  const [preview, setPreview] = useState<{ key: string; res: AssignResponse | null; error: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const key = `${groupId}|${start}|${conflict}|${athletes.length}`;

  useEffect(() => {
    if (!open || !groupId) return;
    let alive = true;
    runBulk({
      action: 'add_to_group',
      athlete_ids: ids(athletes),
      group_id: groupId,
      start_date: start,
      on_conflict: conflict,
      delivery: 'auto',
      dry_run: true,
    })
      .then((r) => alive && setPreview({ key, res: r.assign ?? null, error: null }))
      .catch((err: unknown) => alive && setPreview({ key, res: null, error: errorMessage(err, 'No se ha podido calcular la previa.') }));
    return () => {
      alive = false;
    };
  }, [open, groupId, start, conflict, athletes, key]);

  const current = preview?.key === key ? preview : null;
  const receiving = current?.res ? receivingCount(current.res.preview) : 0;
  const groupName = groups?.find((g) => g.id === groupId)?.label ?? 'el grupo';

  const apply = async () => {
    if (!groupId) return;
    setBusy(true);
    try {
      const res = await runBulk({
        action: 'add_to_group',
        athlete_ids: ids(athletes),
        group_id: groupId,
        start_date: start,
        on_conflict: conflict,
        delivery: 'auto',
      });
      const batch = res.assign?.applied?.batch_id;
      toast({
        title: `${atletas(res.changed)} en «${groupName}»`,
        description: skippedLine(res),
        tone: 'ok',
        undo: batch
          ? async () => {
              try {
                const u = await undoAssign(batch);
                toast({ title: `Deshecho · ${atletas(u.undone)} vuelven a como estaban` });
              } catch (err) {
                toast({ title: 'No se ha podido deshacer', description: errorMessage(err), tone: 'danger' });
              }
              onDone();
            }
          : undefined,
      });
      onClose();
      onDone();
    } catch (err) {
      toast({ title: 'No se ha podido añadir al grupo', description: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? null : onClose())}
      size="md"
      title={`Añadir a un grupo · ${atletas(athletes.length)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={!current?.res || receiving === 0} onClick={() => void apply()}>
            {receiving > 0 ? `Añadir a ${receiving}` : 'Añadir'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {groupsError ? <ErrorState title="No se han podido cargar tus grupos" description={groupsError} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Grupo">
            {({ id }) => (
              <Select
                id={id}
                size="lg"
                placeholder={groups == null ? 'Cargando…' : groups.length === 0 ? 'Todavía no tienes grupos' : 'Elige un grupo'}
                disabled={!groups || groups.length === 0}
                value={groupId}
                onValueChange={setGroupId}
                options={(groups ?? []).map((g) => ({ value: g.id, label: g.label, hint: g.hint ?? undefined }))}
              />
            )}
          </Field>
          <Field label="Empiezan">
            {({ id }) => (
              <Select
                id={id}
                size="lg"
                value={start}
                onValueChange={setStart}
                options={mondays.map((m) => ({ value: m, label: mondayLabel(m, today) }))}
              />
            )}
          </Field>
        </div>
        <Field label="Si ya tienen programa">
          {() => (
            <SegmentedControl aria-label="Si ya tienen programa" value={conflict} onValueChange={setConflict} items={CONFLICT_ITEMS} />
          )}
        </Field>
        {!groupId ? null : current?.error ? (
          <ErrorState title="No se ha podido calcular la previa" description={current.error} />
        ) : current?.res ? (
          <AssignPreviewSummary preview={current.res.preview} />
        ) : (
          <Skeleton className="h-24 w-full" />
        )}
      </div>
    </Dialog>
  );
}

// ── Pausar / reanudar ─────────────────────────────────────────────────────────

export function PauseDialog({ open, onClose, athletes, onDone }: BulkDialogProps) {
  const { toast } = useToast();
  const active = athletes.filter((a) => a.lifecycle !== 'pausado' && a.lifecycle !== 'baja');
  const [reason, setReason] = useState<PauseReason | null>(null);
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      const res = await runBulk({
        action: 'pause',
        athlete_ids: ids(active),
        reason,
        end_date: until || undefined,
      });
      const paused = res.results.filter((r) => r.ok).map((r) => r.athlete_id);
      toast({
        title: `${atletas(res.changed)} en pausa`,
        description: skippedLine(res),
        undo:
          paused.length > 0
            ? async () => {
                try {
                  const r = await runBulk({ action: 'resume', athlete_ids: paused });
                  toast({ title: `${atletas(r.changed)} vuelven a estar activos` });
                } catch (err) {
                  toast({ title: 'No se ha podido deshacer', description: errorMessage(err), tone: 'danger' });
                }
                onDone();
              }
            : undefined,
      });
      onClose();
      onDone();
    } catch (err) {
      toast({ title: 'No se ha podido pausar', description: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const skipped = athletes.length - active.length;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? null : onClose())}
      size="sm"
      title={`Pausar a ${atletas(active.length)}`}
      description="Dejan de recibir semanas nuevas y avisos hasta que los reanudes."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={!reason || active.length === 0} onClick={() => void run()}>
            Pausar a {active.length}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Motivo">
          {({ id }) => (
            <Select
              id={id}
              size="lg"
              placeholder="Elige el motivo"
              value={reason}
              onValueChange={setReason}
              options={PAUSE_REASONS.map((r) => ({ value: r, label: PAUSE_REASON_LABELS[r] }))}
            />
          )}
        </Field>
        <Field label="Vuelve el" optional>
          {({ id, describedBy }) => (
            <Input id={id} aria-describedby={describedBy} type="date" size="lg" value={until} onChange={(e) => setUntil(e.target.value)} />
          )}
        </Field>
        {skipped > 0 ? <p className="t-meta text-v2-faint t-tnum">{skipped} ya estaban en pausa: se quedan igual.</p> : null}
      </div>
    </Dialog>
  );
}

export function ResumeDialog({ open, onClose, athletes, onDone }: BulkDialogProps) {
  const { toast } = useToast();
  const paused = athletes.filter((a) => a.lifecycle === 'pausado');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await runBulk({ action: 'resume', athlete_ids: ids(paused) });
      toast({ title: `${atletas(res.changed)} vuelven a estar activos`, description: skippedLine(res), tone: 'ok' });
      onClose();
      onDone();
    } catch (err) {
      toast({ title: 'No se ha podido reanudar', description: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? null : onClose())}
      size="sm"
      title={`Reanudar a ${atletas(paused.length)}`}
      description="Vuelven a recibir su plan y sus avisos desde hoy."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={paused.length === 0} onClick={() => void run()}>
            Reanudar
          </Button>
        </>
      }
    />
  );
}
