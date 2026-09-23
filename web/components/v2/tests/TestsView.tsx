'use client';

// Programar › Tests: la batería de calibración del coach (lo que fija el punto
// de partida real de cada atleta). Lista ordenable; abrir un test enseña lo que
// hará el atleta; «Aplicar» lo programa a varios; «Usar la batería por defecto»
// la (re)pone. Crear/editar es montar un entreno, así que ocupa el ancho entero.
//
//   · Crear  → POST   /api/coach/tests        · Editar → PATCH  /api/coach/tests/[id]
//   · Quitar → DELETE /api/coach/tests/[id]   · Orden  → POST   /api/coach/tests/reorder
//   · Batería por defecto → POST /api/coach/tests/restore-defaults

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, MoreHorizontal, Plus } from 'lucide-react';
import type { CoachCalibrationTest } from '@/lib/coach/coach-tests';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';
import { saveGateFor } from '@/lib/dashboard/v2/item-validity';
import { useListReorderMove } from '@/lib/ui/use-list-reorder-move';
import { blockAthleteLine } from '@/components/v2/editor/AthletePreviewLine';
import { Button, Dialog, EmptyState, IconButton, Menu, PageHeader, StatusBadge, Tag, useToast } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { TestEditorPanel } from './TestEditorPanel';
import { AplicarTestSheet, type ApplyRosterEntry } from './AplicarTestSheet';
import { type TestDraft, emptyTestDraft, testToDraft, draftContentToInput } from './draft';

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

function agendaSummary(t: CoachCalibrationTest): string {
  const on = t.schedules.filter((s) => s.enabled);
  if (on.length === 0) return 'Sin agenda';
  return on
    .slice()
    .sort((a, b) => a.week_offset - b.week_offset || a.day_of_week - b.day_of_week)
    .map((s) => `Sem ${s.week_offset} · ${DOW[s.day_of_week - 1] ?? '?'}`)
    .join(', ');
}

function apiErrorMessage(json: unknown, fallback: string): string {
  const msg = (json as { error?: { message?: string } } | null)?.error?.message;
  return typeof msg === 'string' && msg ? msg : fallback;
}

export function TestsView({
  initialTests,
  reach = {},
  roster = [],
}: {
  initialTests: CoachCalibrationTest[];
  reach?: Record<string, { athletes: number; done: number; pending: number }>;
  roster?: ApplyRosterEntry[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startRefresh] = useTransition();
  const [tests, setTests] = useState<CoachCalibrationTest[]>(initialTests);
  const [applying, setApplying] = useState<CoachCalibrationTest | null>(null);
  const [draft, setDraft] = useState<TestDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CoachCalibrationTest | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, EditorBlock[] | 'cargando'>>({});

  const fail = (title: string) => toast({ title, tone: 'danger' });

  const toggle = useCallback(
    (t: CoachCalibrationTest) => {
      setOpen((prev) => (prev === t.id ? null : t.id));
      if (preview[t.id] !== undefined || !t.template_id) return;
      setPreview((p) => ({ ...p, [t.id]: 'cargando' }));
      void fetch(`/api/coach/tests/${t.id}`)
        .then((r) => r.json())
        .then((json: { content?: EditorBlock[] }) => setPreview((p) => ({ ...p, [t.id]: json?.content ?? [] })))
        .catch(() => setPreview((p) => ({ ...p, [t.id]: [] })));
    },
    [preview],
  );

  const openEdit = useCallback((t: CoachCalibrationTest) => {
    setDraft(testToDraft(t));
    if (!t.template_id) return;
    setContentLoading(true);
    void fetch(`/api/coach/tests/${t.id}`)
      .then((r) => r.json())
      .then((json: { content?: EditorBlock[] }) => {
        if (json?.content) setDraft((prev) => (prev && prev.id === t.id ? { ...prev, content: json.content! } : prev));
      })
      .catch(() => undefined)
      .finally(() => setContentLoading(false));
  }, []);

  const commitOrder = useCallback(
    (next: readonly CoachCalibrationTest[]) => {
      void fetch('/api/coach/tests/reorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ordered_ids: next.map((t) => t.id) }),
      }).catch(() => fail('No se pudo guardar el orden'));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fail` solo avisa
    [],
  );
  const move = useListReorderMove(tests, setTests, commitOrder);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return fail('Ponle un nombre al test.');
    const gate = saveGateFor(draft.content);
    if (!gate.ok) return fail(gate.reason!);
    setSaving(true);
    const isCreate = draft.id === null;
    const body = {
      name,
      protocol: draft.protocol.trim() || null,
      format: draft.format,
      enabled: draft.enabled,
      content: draftContentToInput(draft.content),
      schedule: draft.schedule.map((s) => ({ week_offset: s.week_offset, day_of_week: s.day_of_week, enabled: true, rest_days_after: s.rest_days_after ?? 0 })),
    };
    const res = await fetch(isCreate ? '/api/coach/tests' : `/api/coach/tests/${draft.id}`, {
      method: isCreate ? 'POST' : 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as { test?: CoachCalibrationTest } | null) : null;
    setSaving(false);
    if (!res?.ok || !json?.test) return fail(apiErrorMessage(json, 'No se pudo guardar el test'));
    const saved = json.test;
    setTests((prev) => (isCreate ? [...prev, saved] : prev.map((t) => (t.id === saved.id ? saved : t))));
    setDraft(null);
    toast({ title: `«${saved.name}» guardado` });
  };

  const doDelete = async (t: CoachCalibrationTest) => {
    const res = await fetch(`/api/coach/tests/${t.id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) return fail('No se pudo quitar el test');
    setTests((prev) => prev.filter((x) => x.id !== t.id));
    setConfirmDelete(null);
    toast({ title: `«${t.name}» quitado de la batería` });
  };

  const applyDefaults = async () => {
    setRestoring(true);
    const res = await fetch('/api/coach/tests/restore-defaults', { method: 'POST' }).catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as { tests?: CoachCalibrationTest[] } | null) : null;
    setRestoring(false);
    if (!res?.ok || !json?.tests) return fail('No se pudo poner la batería por defecto');
    setTests(json.tests);
    toast({ title: 'Batería por defecto puesta' });
  };

  if (draft) {
    return (
      <div className="mx-auto w-full max-w-[880px]">
        <TestEditorPanel draft={draft} onChange={setDraft} onSave={() => void save()} onClose={() => setDraft(null)} saving={saving} contentLoading={contentLoading} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Tests"
        count={tests.length || null}
        subtitle="Fijan el punto de partida de cada atleta: sus zonas y sus máximos."
        actions={
          <>
            <Button loading={restoring} onClick={() => void applyDefaults()}>
              Usar la batería por defecto
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setDraft(emptyTestDraft())}>
              Nuevo test
            </Button>
          </>
        }
      />
      {tests.length === 0 ? (
        <EmptyState
          variant="page"
          title="No tienes tests"
          description="Empieza con la batería por defecto y ajústala, o crea el tuyo."
          action={
            <Button variant="primary" loading={restoring} onClick={() => void applyDefaults()}>
              Usar la batería por defecto
            </Button>
          }
        />
      ) : (
        <ol className="flex flex-col overflow-hidden rounded-panel border border-v2-border bg-v2-surface" aria-label="Batería de tests">
          {tests.map((t, i) => {
            const r = reach[String(t.id)];
            const isOpen = open === t.id;
            return (
              <li key={t.id} className="border-b border-v2-border last:border-b-0">
                <div className="flex min-h-12 items-center gap-3 px-3 py-2 sm:px-4">
                  <IconButton icon={isOpen ? ChevronUp : ChevronDown} label={isOpen ? 'Ocultar el test' : 'Ver el test'} size="sm" onClick={() => toggle(t)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate t-body font-medium text-v2-fg">{t.name}</span>
                      {!t.enabled ? <Tag>en pausa</Tag> : null}
                    </div>
                    <p className="truncate t-body-sm text-v2-muted">
                      {(t.results.map((x) => x.label).join(' · ') || 'Sin resultados') + ' · ' + agendaSummary(t)}
                    </p>
                  </div>
                  <span className="hidden shrink-0 sm:inline">
                    {!r || r.athletes === 0 ? (
                      <StatusBadge tone="neutral" label="Nadie todavía" />
                    ) : (
                      <span className="t-meta text-v2-muted t-tnum">
                        {r.athletes} {r.athletes === 1 ? 'atleta' : 'atletas'} · {r.done} hechos
                      </span>
                    )}
                  </span>
                  <Button size="sm" onClick={() => setApplying(t)}>
                    Aplicar
                  </Button>
                  <div className="hidden items-center sm:flex">
                    <IconButton icon={ArrowUp} label="Subir" size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
                    <IconButton icon={ArrowDown} label="Bajar" size="sm" disabled={i === tests.length - 1} onClick={() => move(i, 1)} />
                  </div>
                  <Menu
                    trigger={<IconButton icon={MoreHorizontal} label={`Acciones de ${t.name}`} size="sm" />}
                    items={[
                      { label: 'Editar', onSelect: () => openEdit(t) },
                      { type: 'separator' },
                      { label: 'Quitar de la batería…', danger: true, onSelect: () => setConfirmDelete(t) },
                    ]}
                  />
                </div>
                {isOpen ? <TestPreview blocks={preview[t.id]} note={t.protocol} /> : null}
              </li>
            );
          })}
        </ol>
      )}

      {applying ? (
        <AplicarTestSheet
          test={{ id: String(applying.id), name: applying.name }}
          roster={roster}
          onClose={() => setApplying(null)}
          onApplied={(summary) => {
            toast({ title: summary, tone: 'ok' });
            startRefresh(() => router.refresh());
          }}
        />
      ) : null}

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        size="sm"
        title={confirmDelete ? `¿Quitar «${confirmDelete.name}»?` : ''}
        description="Deja de programarse a los atletas nuevos. Los resultados que ya hay se conservan."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => confirmDelete && void doDelete(confirmDelete)}>
              Quitar
            </Button>
          </>
        }
      />
    </div>
  );
}

/** Lo que hará el atleta, con la misma frase que compone el editor. */
function TestPreview({ blocks, note }: { blocks: EditorBlock[] | 'cargando' | undefined; note: string | null }) {
  return (
    <div className={cn('border-t border-v2-border bg-v2-surface-2/40 px-4 py-3 sm:pl-14')}>
      {note ? <p className="mb-2 t-body-sm text-v2-muted">{note}</p> : null}
      {blocks === 'cargando' ? (
        <p className="t-meta text-v2-faint">Cargando…</p>
      ) : !blocks || blocks.length === 0 ? (
        <p className="t-body-sm text-v2-faint">Sin sesión guiada: el atleta lo hace por su cuenta y anota el resultado.</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {blocks.map((b, i) => (
            <li key={b.uid} className="flex gap-2 t-body-sm">
              <span className="shrink-0 text-v2-faint t-tnum">{i + 1}.</span>
              <span className="min-w-0 text-v2-fg">{blockAthleteLine(b) || b.title}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
