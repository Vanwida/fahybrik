'use client';

// El entreno de un día en un panel lateral que ES el editor (P4, P10): fecha
// humana, su estado, y según toque — editar la prescripción (pendiente) o lo
// prescrito frente a lo hecho (pasado / hecho). Acciones: Mover a…, Duplicar,
// Reemplazar desde la biblioteca y Quitar (con confirmación). No es modal: el
// calendario sigue vivo detrás.

import { useEffect, useState } from 'react';
import { ArrowRightLeft, CalendarArrowUp, CopyPlus, Replace, Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  ErrorState,
  Input,
  Popover,
  Sheet,
  Skeleton,
  StatusBadge,
  useToast,
  type StatusTone,
} from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import type { FichaSessionEditor } from '@/lib/dashboard/v2/ficha-session';
import { dayLabel, dayTitle } from '@/lib/dashboard/v2/ficha-dates';
import { useFicha } from '../FichaContext';
import { planErrorMessage } from '../plan/use-calendar';
import { ReplaceFromLibrary } from './ReplaceFromLibrary';
import { SessionEditorBody } from './SessionEditorBody';
import { SessionResult } from './SessionResult';

const STATUS: Record<FichaSessionEditor['status'], { label: string; tone: StatusTone }> = {
  scheduled: { label: 'Pendiente', tone: 'neutral' },
  completed: { label: 'Hecho', tone: 'ok' },
  partial: { label: 'Hecho a medias', tone: 'warn' },
  missed: { label: 'Sin hacer', tone: 'danger' },
  skipped: { label: 'Saltado', tone: 'neutral' },
};

function DatePick({
  label,
  icon,
  min,
  initial,
  confirmLabel,
  onPick,
}: {
  label: string;
  icon: typeof ArrowRightLeft;
  min: string;
  initial: string;
  confirmLabel: string;
  onPick: (date: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      title={label}
      trigger={
        <Button size="sm" icon={icon}>
          {label}
        </Button>
      }
    >
      <div className="flex items-center gap-2">
        <Input type="date" min={min} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Día" />
        <Button
          size="md"
          variant="primary"
          loading={busy}
          disabled={!date || date < min}
          onClick={async () => {
            setBusy(true);
            const ok = await onPick(date);
            setBusy(false);
            if (ok) setOpen(false);
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Popover>
  );
}

export function SessionSheet({
  sessionId,
  startWithAi,
  onClose,
}: {
  sessionId: string;
  startWithAi: boolean;
  onClose: () => void;
}) {
  const { shell, bumpCalendar, openSession } = useFicha();
  const { toast } = useToast();
  const [editor, setEditor] = useState<FichaSessionEditor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const base = `/api/coach/athletes/${shell.athlete_id}`;

  useEffect(() => {
    const ctrl = new AbortController();
    apiJson<{ editor: FichaSessionEditor }>(`${base}/sessions/${sessionId}/editor`, { signal: ctrl.signal })
      .then((r) => {
        setEditor(r.editor);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(errorMessage(err, 'No se ha podido abrir el entreno'));
      });
    return () => ctrl.abort();
  }, [base, sessionId, attempt]);

  const requestClose = () => (dirty ? setConfirmClose(true) : onClose());

  const move = async (to: string) => {
    if (!editor) return false;
    const from = editor.date;
    try {
      await apiJson(`${base}/sessions/${sessionId}/reschedule`, { method: 'POST', body: { to_iso_date: to } });
      setEditor({ ...editor, date: to });
      bumpCalendar();
      toast({
        title: `${editor.title} → ${dayLabel(to)}`,
        undo: async () => {
          await apiJson(`${base}/sessions/${sessionId}/reschedule`, { method: 'POST', body: { to_iso_date: from } }).catch(
            () => undefined,
          );
          bumpCalendar();
        },
      });
      return true;
    } catch (err) {
      toast({ title: 'No se ha podido mover', description: errorMessage(err), tone: 'danger' });
      return false;
    }
  };

  const duplicate = async (to: string) => {
    if (!editor?.model.template_id) return false;
    try {
      const res = await apiJson<{ session: { assignment_id: string } }>(`${base}/sessions`, {
        method: 'POST',
        body: { iso_date: to, template_id: Number(editor.model.template_id), display_title: editor.title },
      });
      bumpCalendar();
      toast({
        title: `${editor.title} duplicado el ${dayLabel(to)}`,
        tone: 'ok',
        action: { label: 'Abrir', onClick: () => openSession(res.session.assignment_id) },
      });
      return true;
    } catch (err) {
      toast({ title: 'No se ha podido duplicar', description: planErrorMessage(err), tone: 'danger' });
      return false;
    }
  };

  const remove = async () => {
    if (!editor) return;
    setRemoving(true);
    try {
      await apiJson(`${base}/plan/day/${editor.date}`, {
        method: 'PATCH',
        body: { kind: 'rest', assignment_id: Number(sessionId) },
      });
      toast({ title: `${editor.title} quitado del ${dayLabel(editor.date)}` });
      bumpCalendar();
      onClose();
    } catch (err) {
      toast({ title: 'No se ha podido quitar', description: errorMessage(err), tone: 'danger' });
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  };

  const st = editor ? STATUS[editor.done && editor.status === 'scheduled' ? 'completed' : editor.status] : null;

  return (
    <>
      <Sheet
        open
        modal={false}
        onOpenChange={(o) => !o && requestClose()}
        size="lg"
        title={editor ? dayTitle(editor.date) : 'Entreno'}
        description={
          editor ? (
            <span className="inline-flex items-center gap-2">
              {st ? <StatusBadge tone={st.tone} label={st.label} size="sm" /> : null}
              <span className="truncate">{editor.title}</span>
            </span>
          ) : undefined
        }
      >
        {error ? (
          <ErrorState title={error} onRetry={() => setAttempt((a) => a + 1)} />
        ) : !editor ? (
          <div role="status" aria-label="Cargando el entreno" className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {editor.editable ? (
              <div className="flex flex-wrap items-center gap-2">
                <DatePick label="Mover a…" icon={ArrowRightLeft} min={shell.today} initial={editor.date} confirmLabel="Mover" onPick={move} />
                <DatePick label="Duplicar…" icon={CopyPlus} min={shell.today} initial={editor.date} confirmLabel="Duplicar" onPick={duplicate} />
                <ReplaceFromLibrary
                  icon={Replace}
                  date={editor.date}
                  sessionId={sessionId}
                  onReplaced={(newId) => {
                    bumpCalendar();
                    openSession(newId);
                  }}
                />
                <Button size="sm" variant="ghost" icon={Trash2} className="text-v2-danger" onClick={() => setConfirmRemove(true)}>
                  Quitar
                </Button>
              </div>
            ) : editor.status === 'scheduled' && editor.date < shell.today ? (
              <DatePick label="Pasarlo a otro día" icon={CalendarArrowUp} min={shell.today} initial={shell.today} confirmLabel="Mover" onPick={move} />
            ) : null}

            {editor.editable && editor.date >= shell.today ? (
              <SessionEditorBody
                editor={editor}
                startWithAi={startWithAi}
                onDirtyChange={setDirty}
                onSaved={() => bumpCalendar()}
              />
            ) : (
              <SessionResult athleteId={shell.athlete_id} sessionId={sessionId} />
            )}
          </div>
        )}
      </Sheet>

      <Dialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="¿Quitar este entreno?"
        description={editor ? `${editor.title} · ${dayLabel(editor.date)}. Los otros entrenos del día se quedan.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" loading={removing} onClick={() => void remove()}>
              Quitar
            </Button>
          </>
        }
      />

      <Dialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Tienes cambios sin guardar"
        description="Si cierras, se pierden."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClose(false)}>
              Seguir editando
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmClose(false);
                onClose();
              }}
            >
              Cerrar sin guardar
            </Button>
          </>
        }
      />
    </>
  );
}
