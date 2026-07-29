'use client';

// NivelesPanel — the Niveles area of Periodización. A reorderable list of the
// coach's capacity levels with a right side-panel for create/edit/delete, all
// persisted against the existing /api/coach/levels endpoints.
//
//   · Create  → POST   /api/coach/levels
//   · Edit    → PATCH  /api/coach/levels/[id]
//   · Delete  → DELETE /api/coach/levels/[id]   (409 when athletes hold it → blocked)
//   · Reorder → PATCH each moved row's sort_order
//
// Level = código (chip) + etiqueta (label) + descripción (the criterion, incl.
// classification thresholds as free text — a confirmed product decision). AGNOSTIC:
// N1–N5 are editable seed data, never system concepts.

import { useCallback, useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { LevelBadge } from '@/components/v2/LevelBadge';
import type { V2LevelItem } from '@/lib/dashboard/v2/periodizacion';
import { ReorderRow, RowIconButton } from './ReorderRow';
import { SidePanel, Field, TextInput, TextArea } from './SidePanel';
import { showLevelsEmptyState } from './niveles-empty-state';
import { cn } from '@/lib/utils';

// The default N1–N5 set, restored when a coach has deleted all their levels.
// Mirrors the seed so the UI default == the DB default. Editable afterwards.
const LEVEL_RESTORE_SEED: ReadonlyArray<Pick<V2LevelItem, 'name' | 'label' | 'description'>> = [
  { name: 'N1', label: 'Iniciación', description: 'Primera experiencia estructurada. Sin carreras o >90 min.' },
  { name: 'N2', label: 'Desarrollo', description: 'Base aeróbica, 0–1 carreras. 75–90 min.' },
  { name: 'N3', label: 'Rendimiento', description: '1–3 carreras, entiende zonas. 65–75 min.' },
  { name: 'N4', label: 'Competición', description: 'Open competitivo, múltiples carreras. 55–65 min.' },
  { name: 'N5', label: 'Elite', description: 'Pro o sub-elite. <55 min (H) / <65 min (M).' },
];

type LevelApiRow = {
  id: string;
  coach_id: string;
  name: string;
  label: string;
  description: string | null;
  sort_order: number;
};

/** Local editing draft for the side-panel. id null => creating. */
interface LevelDraft {
  id: string | null;
  name: string;
  label: string;
  description: string;
}

function emptyDraft(): LevelDraft {
  return { id: null, name: '', label: '', description: '' };
}

export function NivelesPanel({
  initialLevels,
  onEnter,
}: {
  initialLevels: V2LevelItem[];
  /** Open a level's periodization (its días-variants + microciclo sequence). */
  onEnter: (level: V2LevelItem) => void;
}) {
  const [levels, setLevels] = useState<V2LevelItem[]>(initialLevels);
  const [draft, setDraft] = useState<LevelDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  // The level whose delete is blocked (in use), shown as a confirm card.
  const [blocked, setBlocked] = useState<V2LevelItem | null>(null);
  // The 0-athlete level awaiting a simple delete confirmation.
  const [confirmDelete, setConfirmDelete] = useState<V2LevelItem | null>(null);
  const [restoring, setRestoring] = useState(false);

  const classified = useMemo(
    () => levels.reduce((sum, l) => sum + l.athlete_count, 0),
    [levels],
  );

  // ── Reorder (adjacent swap, persisted) ──────────────────────────────────
  const move = useCallback(
    (index: number, delta: -1 | 1) => {
      const target = index + delta;
      if (target < 0 || target >= levels.length) return;
      const next = levels.slice();
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      // Re-derive sort_order from position so it stays contiguous.
      const renumbered = next.map((l, i) => ({ ...l, sort_order: i }));
      setLevels(renumbered);
      // Persist the two rows that changed position.
      void Promise.all(
        [renumbered[index]!, renumbered[target]!].map((l) =>
          fetch(`/api/coach/levels/${l.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sort_order: l.sort_order }),
          }),
        ),
      ).catch(() => setError('No se pudo guardar el orden · Reintenta.'));
    },
    [levels],
  );

  // ── Save (create or edit) ────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const label = draft.label.trim();
    if (!name || !label) {
      setError('Código y etiqueta son obligatorios.');
      return;
    }
    setSaving(true);
    setError(null);
    setConflict(false);

    const description = draft.description.trim() || null;
    const isCreate = draft.id === null;
    const url = isCreate ? '/api/coach/levels' : `/api/coach/levels/${draft.id}`;
    const body = isCreate
      ? { name, label, description: description ?? undefined, sort_order: levels.length }
      : { name, label, description };

    try {
      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        setConflict(true);
        setError('Ya existe un nivel con ese código.');
        return;
      }
      if (!res.ok) {
        setError('No se pudo guardar · Reintenta.');
        return;
      }
      const json = (await res.json()) as { level: LevelApiRow };
      const row = json.level;
      setLevels((prev) => {
        if (isCreate) {
          return [...prev, { ...row, athlete_count: 0 }];
        }
        return prev.map((l) =>
          l.id === row.id ? { ...l, name: row.name, label: row.label, description: row.description } : l,
        );
      });
      setDraft(null);
    } catch {
      setError('No se pudo guardar · Reintenta.');
    } finally {
      setSaving(false);
    }
  }, [draft, levels.length]);

  // ── Delete ─────────────────────────────────────────────────────────────
  const requestDelete = useCallback((lvl: V2LevelItem) => {
    if (lvl.athlete_count > 0) {
      setBlocked(lvl);
    } else {
      setConfirmDelete(lvl);
    }
  }, []);

  const doDelete = useCallback(async (lvl: V2LevelItem) => {
    setError(null);
    try {
      const res = await fetch(`/api/coach/levels/${lvl.id}`, { method: 'DELETE' });
      if (res.status === 409) {
        // Race: someone assigned an athlete since we loaded. Switch to blocked.
        setConfirmDelete(null);
        setBlocked(lvl);
        return;
      }
      if (!res.ok && res.status !== 204) {
        setError('No se pudo eliminar · Reintenta.');
        return;
      }
      setLevels((prev) =>
        prev.filter((l) => l.id !== lvl.id).map((l, i) => ({ ...l, sort_order: i })),
      );
      setConfirmDelete(null);
      if (draft?.id === lvl.id) setDraft(null);
    } catch {
      setError('No se pudo eliminar · Reintenta.');
    }
  }, [draft]);

  // ── Restore default N1–N5 (when empty) ───────────────────────────────────
  const restoreDefault = useCallback(async () => {
    setRestoring(true);
    setError(null);
    try {
      const created: V2LevelItem[] = [];
      for (let i = 0; i < LEVEL_RESTORE_SEED.length; i++) {
        const seed = LEVEL_RESTORE_SEED[i]!;
        const res = await fetch('/api/coach/levels', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...seed, sort_order: i }),
        });
        if (!res.ok) throw new Error('seed');
        const json = (await res.json()) as { level: LevelApiRow };
        created.push({ ...json.level, athlete_count: 0 });
      }
      setLevels(created);
    } catch {
      setError('No se pudo restaurar el set por defecto · Reintenta.');
    } finally {
      setRestoring(false);
    }
  }, []);

  const isEmpty = levels.length === 0;
  // The empty-state placeholder yields the moment a draft opens, so "Crear mi
  // primer nivel" has a panel to render into (otherwise the button is dead).
  const showEmpty = showLevelsEmptyState(levels.length, draft !== null);

  return (
    <div>
      {/* topbar */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--v2-muted)]">
            <b className="v2-num">{levels.length}</b> niveles
          </span>
          {classified > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: 'var(--v2-ok-soft)', color: 'var(--v2-ok)' }}
            >
              <b className="v2-num">{classified}</b> atletas clasificados
            </span>
          ) : null}
        </div>
        {!isEmpty ? (
          <button
            type="button"
            onClick={() => {
              setDraft(emptyDraft());
              setError(null);
              setConflict(false);
            }}
            className="v2-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="add" size={18} /> Nuevo nivel
          </button>
        ) : null}
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

      {showEmpty ? (
        <EmptyLevels onCreate={() => setDraft(emptyDraft())} onRestore={restoreDefault} restoring={restoring} />
      ) : (
        <div
          className={cn(
            'grid items-start gap-4',
            draft ? 'lg:grid-cols-[1fr_320px]' : 'grid-cols-1',
          )}
        >
          {/* list */}
          <div className={cn('flex flex-col gap-2', draft ? 'hidden lg:flex' : undefined)}>
            {levels.map((lvl, i) => (
              <ReorderRow
                key={lvl.id}
                index={i}
                total={levels.length}
                onMove={move}
                selected={draft?.id === lvl.id}
                actions={
                  <>
                    <span className="mr-1 hidden items-center gap-1 text-[11.5px] text-[color:var(--v2-faint)] sm:inline-flex">
                      <MIcon name="person" size={14} />
                      <b className="v2-num">{lvl.athlete_count}</b> atletas
                    </span>
                    <button
                      type="button"
                      onClick={() => onEnter(lvl)}
                      className="v2-focus hidden h-7 items-center gap-1 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent-soft)] px-2.5 text-[11.5px] font-bold text-[color:var(--v2-accent)] transition-colors hover:bg-[color:var(--v2-accent)] hover:text-[color:var(--v2-accent-fg)] sm:inline-flex"
                    >
                      Periodización <MIcon name="arrow_forward" size={13} />
                    </button>
                    <RowIconButton
                      icon="edit"
                      label="Editar nivel"
                      onClick={() => {
                        setDraft({ id: lvl.id, name: lvl.name, label: lvl.label, description: lvl.description ?? '' });
                        setError(null);
                        setConflict(false);
                      }}
                    />
                    <RowIconButton icon="delete" label="Eliminar nivel" danger onClick={() => requestDelete(lvl)} />
                  </>
                }
              >
                <button
                  type="button"
                  onClick={() => onEnter(lvl)}
                  className="v2-focus group/enter -m-1 block w-full rounded-[var(--v2-r-s)] p-1 text-left"
                  title={`Abrir la periodización de ${lvl.name} · ${lvl.label}`}
                >
                  <span className="flex items-center gap-2.5">
                    <LevelBadge level={lvl.name} />
                    <span className="truncate text-[14.5px] font-bold text-[color:var(--v2-fg)] transition-colors group-hover/enter:text-[color:var(--v2-accent)]">
                      {lvl.label}
                    </span>
                  </span>
                  {lvl.description ? (
                    <span className="mt-0.5 block truncate text-xs text-[color:var(--v2-muted)]">
                      {lvl.description}
                    </span>
                  ) : null}
                </button>
              </ReorderRow>
            ))}

            {levels.length > 0 ? (
              <PurposeStrip>
                Con estos niveles el sistema <b className="text-[color:var(--v2-fg)]">clasifica a cada atleta al alta</b>. Entra en un nivel para{' '}
                <b className="text-[color:var(--v2-fg)]">ordenar su periodización</b> (su secuencia de microciclos por días/semana). Reordénalos para fijar la progresión de menor a mayor.
              </PurposeStrip>
            ) : null}
          </div>

          {/* side panel (create/edit) */}
          {draft ? (
            <SidePanel
              title={draft.id === null ? 'Nuevo nivel' : 'Editar nivel'}
              onClose={() => setDraft(null)}
              footer={
                <>
                  <PanelButton variant="ghost" onClick={() => setDraft(null)}>
                    Cancelar
                  </PanelButton>
                  <PanelButton variant="primary" onClick={() => void save()} disabled={saving}>
                    <MIcon name="check" size={15} /> {saving ? 'Guardando…' : 'Guardar'}
                  </PanelButton>
                </>
              }
            >
              <Field label="Código" hint="corto, el chip">
                <TextInput
                  value={draft.name}
                  onChange={(v) => {
                    setDraft({ ...draft, name: v });
                    setConflict(false);
                  }}
                  placeholder="N1"
                  invalid={conflict}
                  maxLength={32}
                  autoFocus
                />
                {conflict ? (
                  <span className="mt-1 block text-[11px] font-semibold text-[color:var(--v2-danger)]">
                    Ya existe un nivel con ese código
                  </span>
                ) : null}
              </Field>
              <Field label="Etiqueta" hint="nombre legible">
                <TextInput
                  value={draft.label}
                  onChange={(v) => setDraft({ ...draft, label: v })}
                  placeholder="Iniciación"
                  maxLength={64}
                />
              </Field>
              <Field label="Descripción" hint="el criterio · opcional">
                <TextArea
                  value={draft.description}
                  onChange={(v) => setDraft({ ...draft, description: v })}
                  placeholder="1–3 carreras, entiende zonas. 65–75 min."
                  maxLength={512}
                />
              </Field>
            </SidePanel>
          ) : null}
        </div>
      )}

      {/* delete — in use (blocked) */}
      {blocked ? (
        <DeleteBlockedDialog
          level={blocked}
          onClose={() => setBlocked(null)}
        />
      ) : null}

      {/* delete — 0 athletes (simple confirm) */}
      {confirmDelete ? (
        <ConfirmDeleteDialog
          level={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void doDelete(confirmDelete)}
        />
      ) : null}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PurposeStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] px-4 py-3 text-xs text-[color:var(--v2-muted)]">
      <span className="shrink-0 text-[color:var(--v2-accent)]">
        <MIcon name="my_location" size={18} />
      </span>
      <span className="flex-1">{children}</span>
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="mb-3 flex items-center gap-2.5 rounded-[var(--v2-r-s)] px-3 py-2.5 text-[12.5px]"
      style={{ background: 'var(--v2-danger-soft)', color: 'var(--v2-danger)', border: '1px solid color-mix(in srgb, var(--v2-danger) 30%, transparent)' }}
    >
      <MIcon name="error" size={16} />
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Descartar" className="v2-focus rounded">
        <MIcon name="close" size={15} />
      </button>
    </div>
  );
}

function EmptyLevels({
  onCreate,
  onRestore,
  restoring,
}: {
  onCreate: () => void;
  onRestore: () => void;
  restoring: boolean;
}) {
  return (
    <div className="flex flex-col items-center rounded-[var(--v2-r-l)] border border-dashed border-[color:var(--v2-border)] px-5 py-11 text-center">
      <span
        className="mb-3.5 flex h-13 w-13 items-center justify-center rounded-[var(--v2-r-m)] p-3"
        style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent)' }}
      >
        <MIcon name="signal_cellular_alt" size={26} />
      </span>
      <p className="text-base font-bold text-[color:var(--v2-fg)]">No tienes niveles definidos</p>
      <p className="mx-auto mt-1.5 max-w-[380px] text-[13px] leading-relaxed text-[color:var(--v2-muted)]">
        Los niveles clasifican a tus atletas. Cada uno guarda su propia periodización. Sin al menos uno, el sistema no puede colocar a nadie.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2.5">
        <PanelButton variant="primary" onClick={onCreate}>
          <MIcon name="add" size={16} /> Crear mi primer nivel
        </PanelButton>
        <PanelButton variant="outline" onClick={onRestore} disabled={restoring}>
          <MIcon name="restart_alt" size={16} /> {restoring ? 'Restaurando…' : 'Restaurar set por defecto (N1–N5)'}
        </PanelButton>
      </div>
    </div>
  );
}

function DeleteBlockedDialog({ level, onClose }: { level: V2LevelItem; onClose: () => void }) {
  return (
    <DialogScrim onClose={onClose}>
      <div className="max-w-[420px] rounded-[var(--v2-r-m)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] p-5">
        <span
          className="mb-3 flex h-[38px] w-[38px] items-center justify-center rounded-[var(--v2-r-s)]"
          style={{ background: 'var(--v2-danger-soft)', color: 'var(--v2-danger)' }}
        >
          <MIcon name="delete" size={20} />
        </span>
        <p className="text-[15px] font-bold text-[color:var(--v2-fg)]">
          No puedes eliminar «{level.name} · {level.label}»
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[color:var(--v2-muted)]">
          <b className="text-[color:var(--v2-fg)] v2-num">{level.athlete_count}</b>{' '}
          {level.athlete_count === 1 ? 'atleta tiene' : 'atletas tienen'} este nivel asignado. Reasígnalos a otro nivel antes de eliminarlo — así nadie se queda sin clasificación.
        </p>
        <div className="mt-4 flex gap-2">
          <PanelButton variant="outline" onClick={onClose} href="/atletas">
            Reasignar atletas →
          </PanelButton>
          <PanelButton variant="ghost" onClick={onClose}>
            Cancelar
          </PanelButton>
        </div>
      </div>
    </DialogScrim>
  );
}

function ConfirmDeleteDialog({
  level,
  onCancel,
  onConfirm,
}: {
  level: V2LevelItem;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogScrim onClose={onCancel}>
      <div className="max-w-[420px] rounded-[var(--v2-r-m)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] p-5">
        <p className="text-[15px] font-bold text-[color:var(--v2-fg)]">
          ¿Eliminar «{level.name} · {level.label}»?
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[color:var(--v2-muted)]">
          Ningún atleta tiene este nivel asignado. Se eliminará de tu catálogo junto con su periodización.
        </p>
        <div className="mt-4 flex gap-2">
          <PanelButton variant="danger" onClick={onConfirm}>
            <MIcon name="delete" size={15} /> Eliminar
          </PanelButton>
          <PanelButton variant="ghost" onClick={onCancel}>
            Cancelar
          </PanelButton>
        </div>
      </div>
    </DialogScrim>
  );
}

function DialogScrim({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-[color:var(--v2-scrim)] p-4"
      onClick={onClose}
      role="presentation"
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

// Shared panel/dialog button — primary / ghost / outline / danger. When `href`
// is set it renders a link (used for "Reasignar atletas →").
export function PanelButton({
  variant,
  onClick,
  disabled = false,
  href,
  children,
}: {
  variant: 'primary' | 'ghost' | 'outline' | 'danger';
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
  children: React.ReactNode;
}) {
  const base =
    'v2-focus inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[var(--v2-r-s)] px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const cls = cn(
    base,
    variant === 'primary' && 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]',
    variant === 'ghost' && 'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
    variant === 'outline' && 'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
    variant === 'danger' && 'border border-[color:var(--v2-danger)] text-[color:var(--v2-danger)] hover:bg-[color:var(--v2-danger-soft)]',
  );
  if (href) {
    return (
      <Link href={href} className={cls} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}
