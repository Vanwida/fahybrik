'use client';

// v2 · SCREEN 7 · MICROCICLO — the UNIFIED canvas orchestrator. ONE canvas, two
// zoom levels driven by the `?dia=N` query param (resolved server-side into
// `dayModel`):
//   · no day (SEMANA) — a SegmentedControl toggles between two WEEK views over
//     the SAME real microcycle data:
//       · "Editor · semana en foco" (default) — one week expanded into 7 full-
//         height day columns (weekly calendar) under a week-step header.
//       · "Vista general · N semanas" — the week×day grid.
//     Day cells link to `/microciclos/[id]?dia=idx` (in-place, no navigation).
//   · with day (DÍA) — the SAME canvas reflows to MASTER-DETAIL inside the week
//     calendar: the open day's COLUMN grows to host the editor inline while the
//     other six SHRINK to a thin clickable rail (the week IS the editor). The
//     column-grow animates; "← Semana completa" clears `?dia`.

import { useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import { InlineSaveBadge, useInlineSave } from '@/components/v2/InlineSave';
import type { DayModalityInfo } from '@/lib/dashboard/v2/planes-model';
import type { DayEditorModel } from '@/lib/dashboard/v2/editor-types';
import { MicrocicloV2 } from '@/components/v2/planes/MicrocicloV2';
import { MicrocicloV1 } from '@/components/v2/planes/MicrocicloV1';
import { ImportWorkoutsDialog } from '@/components/v2/planes/ImportWorkoutsDialog';

export interface MicroWeek {
  id: string;
  index: number;
  name: string;
  focus: string | null;
  /** Short etiqueta (focus / "Semana k"). */
  label: string;
  session_count: number;
  /** Always 7 entries, Mon→Sun. */
  days: DayModalityInfo[];
}

type ViewMode = 'foco' | 'general';

// Week count is the coach's choice (a microciclo can be 2, 3, 5, 6… weeks) —
// derive the label from the real data, never hardcode it.
const viewOptions = (weekCount: number) => [
  { value: 'foco' as const, label: 'Editor · semana en foco' },
  {
    value: 'general' as const,
    label: `Vista general · ${weekCount} ${weekCount === 1 ? 'semana' : 'semanas'}`,
  },
];

// The microciclo NAME is athlete-facing: it surfaces as the phase label on the
// athlete's Inicio (`/api/athlete/plan/week` → microcicloName). The coach renames
// it in place from the editor header — click the title (or its pencil) → an inline
// field styled as the heading → saves on blur / Enter via PUT /api/coach/program-
// months/[id]. Optimistic: the new name shows immediately and reverts on error;
// Escape cancels without saving. Mirrors WeekFocusInput's save quality (shared
// useInlineSave + InlineSaveBadge), adding the display↔edit toggle a page title needs.
function MicrocicloNameEditor({
  microcycleId,
  initialName,
  level,
}: {
  microcycleId: string;
  initialName: string;
  level: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialName);
  // Escape sets this so the blur it triggers cancels instead of committing.
  const cancelRef = useRef(false);

  // Adopt server truth when it changes (e.g. after router.refresh()) without an
  // effect — React's reset-state-on-prop-change pattern. The optimistic `name`
  // already matches on a successful save, so this is a no-op there (no flicker)
  // and the "Guardado" badge survives the refresh.
  const [syncedName, setSyncedName] = useState(initialName);
  if (initialName !== syncedName) {
    setSyncedName(initialName);
    setName(initialName);
  }

  const { status, setStatus, save } = useInlineSave(async (next) => {
    const previous = name;
    setName(next); // optimistic
    try {
      const res = await fetch(`/api/coach/program-months/${microcycleId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        setName(previous); // revert
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setName(previous);
      return false;
    }
  });

  const startEdit = () => {
    setDraft(name);
    setStatus('idle');
    setEditing(true);
  };

  // Leave edit mode. On commit, the name is required (min 1) — an empty draft is
  // ignored and the current name kept; otherwise persist (no-op if unchanged).
  const finishEdit = (commit: boolean) => {
    setEditing(false);
    if (!commit) {
      setDraft(name);
      return;
    }
    const next = draft.trim();
    if (next.length === 0) return;
    void save(next, name.trim());
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="v2-display flex min-w-0 items-baseline text-3xl sm:text-4xl">
          <span className="shrink-0 text-[color:var(--v2-muted)]">Microciclo&nbsp;·&nbsp;</span>
          {editing ? (
            <input
              autoFocus
              type="text"
              value={draft}
              maxLength={200}
              aria-label="Nombre del microciclo"
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                setDraft(e.target.value);
                if (status !== 'idle') setStatus('idle');
              }}
              onBlur={() => {
                const commit = !cancelRef.current;
                cancelRef.current = false;
                finishEdit(commit);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  cancelRef.current = true;
                  e.currentTarget.blur();
                }
              }}
              className="v2-display v2-focus min-w-0 flex-1 border-b-2 border-[color:var(--v2-accent)] bg-transparent text-3xl text-[color:var(--v2-fg)] outline-none sm:text-4xl"
            />
          ) : (
            <button
              type="button"
              onClick={startEdit}
              title="Renombrar microciclo · lo ve el atleta"
              className="v2-focus group inline-flex min-w-0 items-baseline gap-2 rounded-[var(--v2-r-s)] text-left"
            >
              <span className="truncate text-[color:var(--v2-fg)]">«{name}»</span>
              <MIcon
                name="edit"
                size={18}
                className="shrink-0 self-center text-[color:var(--v2-faint)] opacity-0 transition-opacity group-hover:opacity-100"
              />
            </button>
          )}
        </h1>
        <InlineSaveBadge status={status} />
      </div>
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-[color:var(--v2-muted)]">
        {level ? <span>{level}</span> : null}
        {level ? (
          <span aria-hidden className="text-[color:var(--v2-faint)]">
            ·
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1 text-[color:var(--v2-faint)]">
          <MIcon name="visibility" size={13} />
          El atleta ve este nombre como su fase
        </span>
      </p>
    </div>
  );
}

/** Whose personal plan this is (0164). null = a library microciclo. */
export interface MicrocicloOwner {
  athlete_id: string;
  athlete_name: string;
}

export function MicrocicloEditor({
  microcycle_id,
  name,
  level,
  weeks,
  dayModel,
  owner = null,
}: {
  microcycle_id: string;
  name: string;
  level: string;
  weeks: MicroWeek[];
  /** DÍA zoom level: present iff `?dia=N` resolved to a real day server-side. */
  dayModel?: DayEditorModel | null;
  owner?: MicrocicloOwner | null;
}) {
  const [view, setView] = useState<ViewMode>('foco');
  const [importOpen, setImportOpen] = useState(false);

  // DÍA zoom level lives ON the week grid: MicrocicloV2 reflows to master-detail
  // (the open day's column grows into the editor, the rest become a thin rail) —
  // "the week IS the editor". So when a day is open we force the week-calendar
  // view (the matrix has no master-detail) and let MicrocicloV2 expand a column.
  // Switching `?dia` is a soft, in-place navigation, so the column-grow animates.
  const effectiveView: ViewMode = dayModel ? 'foco' : view;

  return (
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col">
      {/* Top bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <MicrocicloNameEditor microcycleId={microcycle_id} initialName={name} level={level} />
        {/* The view toggle is a full-week affordance; while a day is open the
            canvas is locked to the master-detail week calendar. The "Importar"
            entry point (#28) lives here too, at the SEMANA level. */}
        {dayModel ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3.5 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
            >
              <MIcon name="upload_file" size={16} />
              Importar del Excel
            </button>
            <SegmentedControl
              options={viewOptions(weeks.length)}
              value={view}
              onChange={setView}
              ariaLabel="Vista del microciclo"
            />
          </div>
        )}
      </div>

      <div className="mt-4">
        {effectiveView === 'foco' ? (
          <MicrocicloV2
            microcycle_id={microcycle_id}
            name={name}
            weeks={weeks}
            dayModel={dayModel}
            owner={owner}
          />
        ) : (
          <MicrocicloV1 microcycle_id={microcycle_id} weeks={weeks} />
        )}
      </div>

      {importOpen ? (
        <ImportWorkoutsDialog
          microcycleId={microcycle_id}
          microWeeks={weeks.map((w) => ({
            id: w.id,
            index: w.index,
            label: w.label,
            session_count: w.session_count,
          }))}
          onClose={() => setImportOpen(false)}
          onDone={() => setImportOpen(false)}
        />
      ) : null}
    </div>
  );
}
