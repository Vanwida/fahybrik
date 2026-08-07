'use client';

// #34 · TESTS — the coach's calibration battery. A reorderable list of tests with
// a right side-panel for create/edit and a soft-delete confirm, persisted against
// /api/coach/tests. Each test: nombre + resultado(s) (what it calibrates) + agenda
// (which week(s)/day). "Restaurar batería por defecto" (re)seeds the default battery.
//
//   · Create  → POST   /api/coach/tests
//   · Edit    → PATCH  /api/coach/tests/[id]
//   · Delete  → DELETE /api/coach/tests/[id]   (soft-archive)
//   · Reorder → POST   /api/coach/tests/reorder
//   · Restore → POST   /api/coach/tests/restore-defaults

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import type { CoachCalibrationTest } from '@/lib/coach/coach-tests';
import { ReorderRow, RowIconButton } from '@/components/v2/periodizacion/ReorderRow';
import { PanelButton, DialogScrim, ErrorBanner } from './chrome';
import { TestEditorPanel } from './TestEditorPanel';
import { AplicarTestSheet, type ApplyRosterEntry } from './AplicarTestSheet';
import {
  type TestDraft,
  emptyTestDraft,
  testToDraft,
  draftResultToInput,
} from './draft';

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

const MODALITY_ICON: Record<string, string> = {
  run: 'directions_run',
  row: 'rowing',
  ski: 'downhill_skiing',
  bike: 'directions_bike',
  strength: 'fitness_center',
  hyrox: 'sports_score',
};

function agendaSummary(t: CoachCalibrationTest): string {
  const on = t.schedules.filter((s) => s.enabled);
  if (on.length === 0) return 'Sin agenda';
  return on
    .slice()
    .sort((a, b) => a.week_offset - b.week_offset || a.day_of_week - b.day_of_week)
    .map((s) => `S${s.week_offset}·${DOW[s.day_of_week - 1] ?? '?'}`)
    .join('  ');
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
  /** test id → how many athletes actually have it, and how far they got. */
  reach?: Record<string, { athletes: number; done: number; pending: number }>;
  roster?: ApplyRosterEntry[];
}) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [tests, setTests] = useState<CoachCalibrationTest[]>(initialTests);
  const [applying, setApplying] = useState<CoachCalibrationTest | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<TestDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CoachCalibrationTest | null>(null);
  const [restoring, setRestoring] = useState(false);

  // ── Reorder (adjacent swap, persisted as the full order) ──────────────────
  const move = useCallback(
    (index: number, delta: -1 | 1) => {
      const target = index + delta;
      if (target < 0 || target >= tests.length) return;
      const next = tests.slice();
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      setTests(next);
      void fetch('/api/coach/tests/reorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ordered_ids: next.map((t) => t.id) }),
      }).catch(() => setError('No se pudo guardar el orden · Reintenta.'));
    },
    [tests],
  );

  // ── Save (create or edit) ─────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (draft.results.length === 0) {
      setError('Añade al menos un resultado.');
      return;
    }
    setSaving(true);
    setError(null);

    const isCreate = draft.id === null;
    const body = {
      name,
      protocol: draft.protocol.trim() || null,
      format: draft.format,
      enabled: draft.enabled,
      results: draft.results.map(draftResultToInput),
      schedule: draft.schedule.map((s) => ({
        week_offset: s.week_offset,
        day_of_week: s.day_of_week,
        enabled: true,
        rest_days_after: s.rest_days_after ?? 0,
      })),
    };
    const url = isCreate ? '/api/coach/tests' : `/api/coach/tests/${draft.id}`;

    try {
      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { test?: CoachCalibrationTest } | null;
      if (!res.ok || !json?.test) {
        setError(apiErrorMessage(json, 'No se pudo guardar · Reintenta.'));
        return;
      }
      const saved = json.test;
      setTests((prev) =>
        isCreate ? [...prev, saved] : prev.map((t) => (t.id === saved.id ? saved : t)),
      );
      setDraft(null);
    } catch {
      setError('No se pudo guardar · Reintenta.');
    } finally {
      setSaving(false);
    }
  }, [draft]);

  // ── Delete (soft) ─────────────────────────────────────────────────────────
  const doDelete = useCallback(
    async (t: CoachCalibrationTest) => {
      setError(null);
      try {
        const res = await fetch(`/api/coach/tests/${t.id}`, { method: 'DELETE' });
        if (!res.ok) {
          setError('No se pudo eliminar · Reintenta.');
          return;
        }
        setTests((prev) => prev.filter((x) => x.id !== t.id));
        setConfirmDelete(null);
        if (draft?.id === t.id) setDraft(null);
      } catch {
        setError('No se pudo eliminar · Reintenta.');
      }
    },
    [draft],
  );

  // ── Restore the default calibration battery ───────────────────────────────
  const restore = useCallback(async () => {
    setRestoring(true);
    setError(null);
    try {
      const res = await fetch('/api/coach/tests/restore-defaults', { method: 'POST' });
      const json = (await res.json().catch(() => null)) as { tests?: CoachCalibrationTest[] } | null;
      if (!res.ok || !json?.tests) {
        setError('No se pudo restaurar la batería por defecto · Reintenta.');
        return;
      }
      setTests(json.tests);
    } catch {
      setError('No se pudo restaurar la batería por defecto · Reintenta.');
    } finally {
      setRestoring(false);
    }
  }, []);

  const isEmpty = tests.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="v2-display text-3xl sm:text-4xl">
            <span className="text-[color:var(--v2-fg)]">Tests</span>{' '}
            <span className="text-[color:var(--v2-muted)]">· calibración</span>
          </h1>
          <p className="text-sm text-[color:var(--v2-muted)]">
            La batería que fija el punto de partida real del atleta. Se programa sola en su plan y
            calibra sus zonas y 1RM.
          </p>
        </div>
        {!isEmpty ? (
          <button
            type="button"
            onClick={() => {
              setDraft(emptyTestDraft());
              setError(null);
            }}
            className="v2-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="add" size={18} /> Nuevo test
          </button>
        ) : null}
      </div>

      <div className="mt-5">{error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}</div>

      {isEmpty && !draft ? (
        <EmptyTests onCreate={() => setDraft(emptyTestDraft())} onRestore={restore} restoring={restoring} />
      ) : (
        <div className={cn('grid items-start gap-4', draft ? 'lg:grid-cols-[1fr_360px]' : 'grid-cols-1')}>
          {/* list */}
          <div className={cn('flex flex-col gap-2', draft ? 'hidden lg:flex' : undefined)}>
            {tests.map((t, i) => (
              <ReorderRow
                key={t.id}
                index={i}
                total={tests.length}
                onMove={move}
                selected={draft?.id === t.id}
                actions={
                  <>
                    <RowIconButton
                      icon="edit"
                      label="Editar test"
                      onClick={() => {
                        setDraft(testToDraft(t));
                        setError(null);
                      }}
                    />
                    <RowIconButton
                      icon="delete"
                      label="Quitar test"
                      danger
                      onClick={() => setConfirmDelete(t)}
                    />
                  </>
                }
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--v2-r-s)]"
                    style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent)' }}
                    aria-hidden
                  >
                    <MIcon name={MODALITY_ICON[t.primary_modality ?? ''] ?? 'timer'} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-reading font-bold text-[color:var(--v2-fg)]">
                        {t.name}
                      </span>
                      {!t.enabled ? (
                        <span className="rounded-[var(--v2-r-pill)] bg-[color:var(--v2-surface-2)] px-1.5 py-0.5 text-eyebrow font-bold uppercase tracking-wide text-[color:var(--v2-faint)]">
                          en pausa
                        </span>
                      ) : null}
                    </div>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[color:var(--v2-muted)]">
                      <span className="truncate">
                        {t.results.map((r) => r.label).join(' · ') || 'Sin resultados'}
                      </span>
                      <span className="text-[color:var(--v2-faint)]">·</span>
                      <span className="v2-num inline-flex items-center gap-1 whitespace-nowrap text-[color:var(--v2-faint)]">
                        <MIcon name="event" size={12} /> {agendaSummary(t)}
                      </span>
                      <span className="text-[color:var(--v2-faint)]">·</span>
                      <ReachChip reach={reach[String(t.id)]} />
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setApplying(t);
                    }}
                    className="v2-focus shrink-0 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:bg-[color:var(--v2-elevated)]"
                  >
                    Aplicar
                  </button>
                </div>
              </ReorderRow>
            ))}

            <PurposeStrip onRestore={restore} restoring={restoring} />
          </div>

          {/* side panel (create/edit) */}
          {draft ? (
            <TestEditorPanel
              draft={draft}
              onChange={setDraft}
              onSave={() => void save()}
              onClose={() => setDraft(null)}
              saving={saving}
            />
          ) : null}
        </div>
      )}

      {applying ? (
        <AplicarTestSheet
          test={{ id: String(applying.id), name: applying.name }}
          roster={roster}
          onClose={() => setApplying(null)}
          onApplied={(summary) => {
            setToast(summary);
            // Pull the fresh reach + roster down from the server component: without
            // this the screen keeps yesterday's truth and the coach re-applies blind.
            startRefresh(() => router.refresh());
          }}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-40 flex max-w-[90vw] -translate-x-1/2 items-center gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-elevated)] px-4 py-2.5 text-body text-[color:var(--v2-fg)] shadow-lg"
        >
          <MIcon name="event_available" size={16} className="text-[color:var(--v2-accent)]" />
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Cerrar aviso"
            className="v2-focus text-[color:var(--v2-faint)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={15} />
          </button>
        </div>
      ) : null}

      {confirmDelete ? (
        <ConfirmDeleteDialog
          test={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void doDelete(confirmDelete)}
        />
      ) : null}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Who actually HAS this test. The column whose absence is what let a battery that
 *  had reached nobody look exactly like one that was working — "Nadie todavía" is
 *  the state this chip exists to make impossible to miss. */
function ReachChip({ reach }: { reach?: { athletes: number; done: number; pending: number } }) {
  if (!reach || reach.athletes === 0) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-[color:var(--v2-warn)]">
        <MIcon name="person_off" size={12} /> Nadie todavía
      </span>
    );
  }
  const detail = reach.pending > 0 ? `${reach.done} hechos · ${reach.pending} pendientes` : `${reach.done} hechos`;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[color:var(--v2-muted)]">
      <MIcon name="group" size={12} /> {reach.athletes} {reach.athletes === 1 ? 'atleta' : 'atletas'}
      <span className="text-[color:var(--v2-faint)]">· {detail}</span>
    </span>
  );
}

function PurposeStrip({ onRestore, restoring }: { onRestore: () => void; restoring: boolean }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] px-4 py-3 text-xs text-[color:var(--v2-muted)]">
      <span className="shrink-0 text-[color:var(--v2-accent)]">
        <MIcon name="my_location" size={18} />
      </span>
      <span className="flex-1">
        Tú defines la batería: <b className="text-[color:var(--v2-fg)]">qué tests hay</b> y en qué <b className="text-[color:var(--v2-fg)]">semana y día</b> se
        programan en el plan del atleta. Con sus resultados se <b className="text-[color:var(--v2-fg)]">calibran zonas y 1RM</b>.
      </span>
      <button
        type="button"
        onClick={onRestore}
        disabled={restoring}
        className="v2-focus inline-flex shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2.5 py-1 text-label font-bold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)] disabled:opacity-50"
      >
        <MIcon name="restart_alt" size={14} /> {restoring ? 'Restaurando…' : 'Restaurar batería por defecto'}
      </button>
    </div>
  );
}

function EmptyTests({
  onCreate,
  onRestore,
  restoring,
}: {
  onCreate: () => void;
  onRestore: () => void;
  restoring: boolean;
}) {
  return (
    <div className="mt-1 flex flex-col items-center rounded-[var(--v2-r-l)] border border-dashed border-[color:var(--v2-border)] px-5 py-11 text-center">
      <span
        className="mb-3.5 flex h-13 w-13 items-center justify-center rounded-[var(--v2-r-m)] p-3"
        style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent)' }}
      >
        <MIcon name="timer" size={26} />
      </span>
      <p className="text-base font-bold text-[color:var(--v2-fg)]">No tienes tests de calibración</p>
      <p className="mx-auto mt-1.5 max-w-[420px] text-body leading-relaxed text-[color:var(--v2-muted)]">
        Sin tests, la primera semana del atleta no fija su punto de partida real: sus zonas y 1RM se
        quedan en la estimación del onboarding. Restaura la batería por defecto o crea el tuyo.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2.5">
        <button
          type="button"
          onClick={onRestore}
          disabled={restoring}
          className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3.5 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
        >
          <MIcon name="restart_alt" size={16} /> {restoring ? 'Restaurando…' : 'Restaurar batería por defecto'}
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3.5 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="add" size={16} /> Crear un test
        </button>
      </div>
    </div>
  );
}

function ConfirmDeleteDialog({
  test,
  onCancel,
  onConfirm,
}: {
  test: CoachCalibrationTest;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogScrim onClose={onCancel}>
      <div className="max-w-[420px] rounded-[var(--v2-r-m)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] p-5">
        <p className="text-reading font-bold text-[color:var(--v2-fg)]">¿Quitar «{test.name}» de la batería?</p>
        <p className="mt-1.5 text-body leading-relaxed text-[color:var(--v2-muted)]">
          Dejará de programarse en los planes nuevos. Los tests ya asignados a un atleta y sus
          resultados capturados se conservan.
        </p>
        <div className="mt-4 flex gap-2">
          <PanelButton variant="danger" onClick={onConfirm}>
            <MIcon name="delete" size={15} /> Quitar
          </PanelButton>
          <PanelButton variant="ghost" onClick={onCancel}>
            Cancelar
          </PanelButton>
        </div>
      </div>
    </DialogScrim>
  );
}
