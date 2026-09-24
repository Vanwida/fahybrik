'use client';

// «Asignar programa» — UN panel, llamado desde todas partes (§4.6, informe D §4.2):
// el editor de programa, Hoy (sugeridos ya puestos), la selección múltiple de
// Atletas, un grupo y el vistazo de un atleta.
//
//   <AssignSheet
//     open={open}
//     onClose={() => setOpen(false)}
//     programId="2"                       // opcional: si no, se elige aquí
//     athleteIds={['11', '12']}           // opcional: destinatarios ya puestos
//     groupIds={['1']}                    // opcional
//     athletes={[{ id: '11', name: 'Marc Vidal' }]}   // opcional: nombres para los chips
//     onAssigned={(applied) => refresh()} // opcional: tras asignar (y tras deshacer, con null)
//   />
//
// Flujo: cada cambio pide la PREVIA (mismo cuerpo con `dry_run: true`) → el coach
// ve a quién le pasa qué y, si alguno ya tiene plan que se solapa, elige Encadenar
// detrás · Sustituir · Saltar → UN botón «Asignar a N» (el mismo cuerpo sin
// dry_run; un doble envío devuelve el mismo lote) → aviso con «Deshacer», que
// llama a /api/coach/assign/{batch_id}/undo y dice quién no se pudo deshacer.
// Si alguno falla al asignar, el panel se queda abierto con el motivo de cada uno.
// Necesita <PanelProviders> por encima (useToast).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import type {
  AssignApplied,
  AssignResponse,
  AssignUndoResult,
  OnConflict,
  WeekDelivery,
} from '@fahybrid/shared/schema/assign-many';
import {
  Button,
  Combobox,
  ErrorState,
  Field,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  useToast,
  type ComboboxOption,
} from '@/components/v2/ui';
import { apiJson, errorMessage } from './api';
import { AssignPreviewSummary, receivingCount } from './AssignPreview';
import { EntityPicker, type PickerItem } from './EntityPicker';
import { useGroupOptions } from './GroupPicker';
import { searchAthletes } from './pickers';
import { localToday, mondayLabel, shortDate, upcomingMondays } from './format';
import { deliveryLine } from './logic';
import { CONFLICT_ITEMS, DELIVERY_ITEMS, MONDAYS_AHEAD, useProgramsAndSetting } from './assign-sheet-data';

export interface AssignSheetProps {
  open: boolean;
  onClose: () => void;
  programId?: string;
  athleteIds?: string[];
  groupIds?: string[];
  /** Nombres de los atletas ya puestos (si no, salen de la previa). */
  athletes?: Array<{ id: string; name: string; avatar_url?: string | null }>;
  /** Tras asignar (con el lote) y tras deshacer (con null). */
  onAssigned?: (applied: AssignApplied | null) => void;
}

export function AssignSheet({
  open,
  onClose,
  programId,
  athleteIds,
  groupIds,
  athletes,
  onAssigned,
}: AssignSheetProps) {
  const { toast } = useToast();
  const today = localToday();
  const mondays = useMemo(() => upcomingMondays(today, MONDAYS_AHEAD), [today]);
  const { programs, days, error: loadError, retry } = useProgramsAndSetting(open);
  const { groups } = useGroupOptions();

  const [program, setProgram] = useState<string | null>(programId ?? null);
  const [recipients, setRecipients] = useState<PickerItem[]>([]);
  const [start, setStart] = useState<string>(mondays[1] ?? mondays[0]!);
  const [startWeek, setStartWeek] = useState(1);
  const [delivery, setDelivery] = useState<WeekDelivery>('auto');
  const [onConflict, setOnConflict] = useState<OnConflict>('chain');
  const [previewState, setPreview] = useState<AssignResponse['preview'] | null>(null);
  const [previewErrorState, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState<AssignApplied | null>(null);

  // Al abrir: parte de lo que trae la pantalla.
  const seeded = useRef(false);
  const groupsSeeded = useRef(false);
  useEffect(() => {
    if (!open) {
      seeded.current = false;
      groupsSeeded.current = false;
      return;
    }
    if (seeded.current) return;
    seeded.current = true;
    const names = new Map((athletes ?? []).map((a) => [a.id, a]));
    setProgram(programId ?? null);
    setRecipients(
      (athleteIds ?? []).map((id) => ({
        kind: 'athlete' as const,
        id,
        label: names.get(id)?.name ?? `Atleta ${id}`,
        avatar_url: names.get(id)?.avatar_url ?? null,
      })),
    );
    setStart(mondays[1] ?? mondays[0]!);
    setStartWeek(1);
    setDelivery('auto');
    setOnConflict('chain');
    setPreview(null);
    setFailed(null);
  }, [open, programId, athleteIds, athletes, mondays]);

  // Los grupos preseleccionados, con su nombre, en cuanto llega la lista.
  useEffect(() => {
    if (!open || !groups || !groupIds?.length || groupsSeeded.current) return;
    groupsSeeded.current = true;
    setRecipients((cur) => {
      const have = new Set(cur.filter((c) => c.kind === 'group').map((c) => c.id));
      const add = groups.filter((g) => groupIds.includes(g.id) && !have.has(g.id));
      return add.length ? [...add, ...cur] : cur;
    });
  }, [open, groups, groupIds]);

  const selectedProgram = programs?.find((p) => p.id === program) ?? null;
  const athleteSel = recipients.filter((r) => r.kind === 'athlete').map((r) => r.id);
  const groupSel = recipients.filter((r) => r.kind === 'group').map((r) => r.id);

  const body = useMemo(
    () =>
      program && recipients.length > 0
        ? {
            program_id: program,
            athlete_ids: athleteSel,
            group_ids: groupSel,
            start_date: start,
            start_week: startWeek,
            delivery,
            on_conflict: onConflict,
          }
        : null,
    // athleteSel/groupSel derivan de recipients
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [program, recipients, start, startWeek, delivery, onConflict],
  );

  // La previa: se pide sola con cada cambio (250 ms de calma).
  useEffect(() => {
    // Sin cuerpo no hay previa: se deriva abajo (`shown`), no se borra aquí.
    if (!open || !body) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setPreviewing(true);
      apiJson<AssignResponse>('/api/coach/assign', {
        method: 'POST',
        body: { ...body, dry_run: true },
        signal: ctrl.signal,
      })
        .then((res) => {
          setPreview(res.preview);
          setPreviewError(null);
          // Los chips con «Atleta 11» toman su nombre de la previa.
          const names = new Map(res.preview.athletes.map((a) => [a.id, a.name]));
          setRecipients((cur) =>
            cur.some((c) => c.kind === 'athlete' && c.label.startsWith('Atleta ') && names.has(c.id))
              ? cur.map((c) => (c.kind === 'athlete' && names.has(c.id) ? { ...c, label: names.get(c.id)! } : c))
              : cur,
          );
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setPreview(null);
          setPreviewError(errorMessage(err, 'No se ha podido calcular la previa'));
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setPreviewing(false);
        });
    }, 250);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [open, body]);

  const undo = useCallback(
    async (batch_id: string) => {
      try {
        const res = await apiJson<AssignUndoResult>(`/api/coach/assign/${batch_id}/undo`, { method: 'POST' });
        onAssigned?.(null);
        const failedOnes = res.results.filter((r) => r.status === 'failed');
        toast({
          title: res.already_undone
            ? 'Ya estaba deshecho'
            : `Deshecho · ${res.undone} ${res.undone === 1 ? 'atleta vuelve' : 'atletas vuelven'} a como estaban`,
          description:
            failedOnes.length > 0
              ? `${failedOnes.length} no: ${failedOnes[0]!.reason ?? 'ya había entrenado'}${failedOnes.length > 1 ? '…' : ''}`
              : undefined,
          tone: failedOnes.length > 0 ? 'warn' : 'neutral',
        });
      } catch (err) {
        toast({ title: 'No se ha podido deshacer', description: errorMessage(err), tone: 'danger' });
      }
    },
    [onAssigned, toast],
  );

  const submit = async () => {
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiJson<AssignResponse>('/api/coach/assign', { method: 'POST', body });
      const applied = res.applied;
      if (!applied) throw new Error('sin lote');
      onAssigned?.(applied);
      const name = selectedProgram?.name ?? res.preview.program?.name ?? 'Programa';
      toast({
        title: `«${name}» asignado a ${applied.assigned}`,
        description:
          applied.failed > 0
            ? `${applied.failed} no se ${applied.failed === 1 ? 'pudo' : 'pudieron'} asignar`
            : applied.skipped > 0
              ? `${applied.skipped} saltados`
              : undefined,
        tone: applied.failed > 0 ? 'warn' : 'ok',
        undo: applied.assigned > 0 ? () => undo(applied.batch_id) : undefined,
      });
      if (applied.failed > 0) setFailed(applied);
      else onClose();
    } catch (err) {
      toast({ title: 'No se ha podido asignar', description: errorMessage(err), tone: 'danger' });
    } finally {
      setSubmitting(false);
    }
  };

  // Sin destinatarios o sin programa no hay previa que enseñar (aunque quede una vieja en memoria).
  const preview = body ? previewState : null;
  const previewError = body ? previewErrorState : null;
  const conflicts =
    preview?.athletes.filter((a) => a.conflict != null && a.action !== 'blocked' && a.action !== 'adopt') ?? [];
  const n = preview ? receivingCount(preview) : 0;
  const programOptions: ComboboxOption<string>[] = (programs ?? []).map((p) => ({
    value: p.id,
    label: p.name,
    hint: `${p.week_count} sem${p.level ? ` · ${p.level}` : ''}`,
  }));
  const weeks = selectedProgram?.week_count ?? preview?.program?.weeks ?? 1;
  const nameById = new Map((preview?.athletes ?? []).map((a) => [a.id, a.name]));

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="lg"
      title={selectedProgram ? `Asignar «${selectedProgram.name}»` : 'Asignar programa'}
      footer={
        failed ? (
          <Button variant="primary" onClick={onClose}>
            Entendido
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={submitting}
              disabled={!preview || n === 0 || previewing}
              onClick={() => void submit()}
            >
              {preview ? `Asignar a ${n}` : 'Asignar'}
            </Button>
          </>
        )
      }
    >
      {failed ? (
        <div className="flex flex-col gap-3">
          <p className="t-body text-v2-fg">
            Asignado a {failed.assigned}. {failed.failed} no se {failed.failed === 1 ? 'pudo' : 'pudieron'}:
          </p>
          <ul className="flex flex-col gap-1.5">
            {failed.results
              .filter((r) => r.status === 'failed')
              .map((r) => (
                <li key={r.athlete_id} className="flex items-baseline gap-2 t-body-sm">
                  <CircleAlert
                    aria-hidden
                    className="size-3.5 shrink-0 translate-y-0.5 text-v2-danger"
                    strokeWidth={2}
                  />
                  <span className="font-medium text-v2-fg">
                    {nameById.get(r.athlete_id) ?? `Atleta ${r.athlete_id}`}
                  </span>
                  <span className="text-v2-muted">{r.reason ?? 'Error al asignar'}</span>
                </li>
              ))}
          </ul>
        </div>
      ) : loadError ? (
        <ErrorState title="No se han podido cargar tus programas" description={loadError} onRetry={retry} />
      ) : (
        <div className="flex flex-col gap-5">
          <Field label="Para">
            {({ id }) => (
              <EntityPicker
                id={id}
                aria-label="Atletas y grupos"
                value={recipients}
                onValueChange={setRecipients}
                options={groups ?? []}
                search={searchAthletes}
                placeholder="Añadir atleta o grupo…"
                emptyText="Ningún atleta ni grupo con ese nombre"
              />
            )}
          </Field>

          {!programId ? (
            <Field label="Programa">
              {({ id }) =>
                programs == null ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Combobox
                    id={id}
                    size="lg"
                    options={programOptions}
                    value={program}
                    onValueChange={(v) => {
                      setProgram(v);
                      setStartWeek(1);
                    }}
                    placeholder="Buscar programa…"
                    emptyText={programs.length === 0 ? 'Todavía no tienes programas' : 'Ningún programa con ese nombre'}
                  />
                )
              }
            </Field>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Empieza el lunes">
              {({ id }) => (
                <Select
                  id={id}
                  aria-label="Lunes de inicio"
                  size="lg"
                  value={start}
                  onValueChange={setStart}
                  options={mondays.map((m) => ({ value: m, label: mondayLabel(m, today) }))}
                  className="w-full"
                />
              )}
            </Field>
            <Field label="Entra en">
              {({ id }) => (
                <Select
                  id={id}
                  size="lg"
                  value={startWeek}
                  onValueChange={setStartWeek}
                  options={Array.from({ length: Math.max(1, weeks) }, (_, i) => ({
                    value: i + 1,
                    label: i === 0 ? 'Semana 1 (desde el principio)' : `Semana ${i + 1}`,
                  }))}
                  className="w-full"
                />
              )}
            </Field>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="t-meta text-v2-muted">Entrega</span>
            <SegmentedControl
              aria-label="Entrega"
              items={DELIVERY_ITEMS}
              value={delivery}
              onValueChange={setDelivery}
              className="w-fit"
            />
            <span className="t-body-sm text-v2-faint">{deliveryLine(delivery, days)}</span>
          </div>

          {groupSel.length > 0 && conflicts.length > 0 ? (
            // Un grupo no es una promoción: cada miembro puede ir por una semana
            // distinta de su programa. Se elige en sus palabras si el nuevo llega
            // a cada uno al acabar lo suyo (encadenar) o si todos arrancan juntos
            // ese lunes (sustituir desde ahí; lo ya entrenado no se toca).
            <Field label={`${conflicts.length} ${conflicts.length === 1 ? 'va' : 'van'} a mitad de un programa`}>
              {({ id }) => (
                <div className="flex flex-col gap-1.5">
                  <Select
                    id={id}
                    size="lg"
                    value={onConflict}
                    onValueChange={setOnConflict}
                    options={[
                      { value: 'chain' as OnConflict, label: 'Cada uno sigue en su semana' },
                      { value: 'replace' as OnConflict, label: `Empiezan todos el lunes ${shortDate(start)}` },
                      { value: 'skip' as OnConflict, label: 'Solo a quien no tiene programa' },
                    ]}
                    className="w-full"
                  />
                  <span className="t-body-sm text-v2-faint">
                    {onConflict === 'chain'
                      ? 'Terminan lo que hacen y el programa nuevo les llega detrás, a cada uno en su fecha.'
                      : onConflict === 'replace'
                        ? `Todos empiezan juntos el ${shortDate(start)}; lo que ya han entrenado no se toca.`
                        : 'Quien va a mitad de un programa se queda como está.'}
                  </span>
                </div>
              )}
            </Field>
          ) : conflicts.length > 0 || onConflict !== 'chain' ? (
            <div className="flex flex-col gap-1.5">
              <span className="t-meta text-v2-muted">
                {conflicts.length > 0
                  ? `${conflicts.length} ya ${conflicts.length === 1 ? 'tiene' : 'tienen'} un programa que se solapa`
                  : 'Si alguno ya tiene programa'}
              </span>
              <SegmentedControl
                aria-label="Si ya tiene programa"
                items={CONFLICT_ITEMS}
                value={onConflict}
                onValueChange={setOnConflict}
                className="w-fit"
              />
            </div>
          ) : null}

          {!body ? (
            <p className="t-body-sm text-v2-faint">
              {recipients.length === 0
                ? 'Añade atletas o un grupo para ver a quién le llega.'
                : 'Elige el programa para ver la previa.'}
            </p>
          ) : previewError ? (
            <ErrorState title="No se ha podido calcular la previa" description={previewError} />
          ) : preview ? (
            <AssignPreviewSummary preview={preview} className={previewing ? 'opacity-60' : undefined} />
          ) : (
            <div
              role="status"
              aria-label="Calculando la previa"
              className="flex flex-col gap-2 rounded-panel bg-v2-surface-2 px-3.5 py-3"
            >
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
