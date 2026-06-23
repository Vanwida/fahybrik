'use client';

// FasesPanel — the Fases area of Periodización. A reorderable list of the coach's
// periodization phases with a right side-panel for create/edit/delete and a role
// picker that drives the color. AGNOSTIC: the ATR example set is editable seed
// data; the ONLY closed field is `role`.
//
// Persistence reuses the existing ATOMIC FULL-SET endpoint:
//   PUT /api/coach/methodology/phases  (server diffs insert/update/delete + derives
//   sequence_order from array order — saveCoachPhases). So create / edit / delete /
//   reorder all become "build the new ordered array, PUT it". No new persistence.
//
// Difference vs Niveles (intentional, per the approved pass): deleting a phase in
// use is ALLOWED — the labelled microcycles just lose their color tag, nothing
// breaks. Deleting a level in use is blocked. Phase = decorative/organizational.

import { useCallback, useState } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';
import type { V2PhaseItem } from '@/lib/dashboard/v2/periodizacion';
import {
  PHASE_ROLES,
  ROLE_LABEL,
  ROLE_HINT,
  ATR_PHASE_SEED,
  roleV2Color,
  type PhaseRole,
} from './role-style';
import { RoleChip } from './RoleChip';
import { ReorderRow, RowIconButton } from './ReorderRow';
import { SidePanel, Field, TextArea } from './SidePanel';
import { PanelButton } from './NivelesPanel';
import { cn } from '@/lib/utils';

/** Server response from PUT /api/coach/methodology/phases. */
type PhasesResponse = { phases: ServerPhase[] };
type ServerPhase = {
  id: number | string;
  code: string;
  label: string;
  role: string;
  color: string | null;
  default_weeks: number | null;
  sequence_order: number;
  is_deload: boolean;
  description: string | null;
};

/** The edit payload row sent to the API (matches methodologyPhaseEditSchema). */
interface PhaseEditRow {
  id?: number | null;
  code?: string | null;
  label: string;
  role: PhaseRole;
  color?: string | null;
  default_weeks?: number | null;
  is_deload: boolean;
  description?: string | null;
}

/** Local editing draft. id null => creating a new phase. */
interface PhaseDraft {
  id: string | null;
  code: string | null;
  label: string;
  role: PhaseRole;
  default_weeks: number;
  is_deload: boolean;
  description: string;
}

function emptyDraft(): PhaseDraft {
  return { id: null, code: null, label: '', role: 'volume', default_weeks: 4, is_deload: false, description: '' };
}

function toV2(p: ServerPhase): V2PhaseItem {
  return {
    id: String(p.id),
    code: p.code,
    label: p.label,
    role: p.role as PhaseRole,
    color: p.color,
    default_weeks: p.default_weeks,
    sequence_order: p.sequence_order,
    is_deload: p.is_deload,
    description: p.description,
  };
}

/** Turn the current ordered list into the API edit payload (order = sequence). */
function toPayload(list: V2PhaseItem[]): PhaseEditRow[] {
  return list.map((p) => ({
    id: p.id ? Number(p.id) : null,
    code: p.code || null,
    label: p.label,
    role: p.role,
    color: p.color,
    default_weeks: p.default_weeks,
    is_deload: p.is_deload,
    description: p.description,
  }));
}

export function FasesPanel({ initialPhases }: { initialPhases: V2PhaseItem[] }) {
  const [phases, setPhases] = useState<V2PhaseItem[]>(initialPhases);
  const [draft, setDraft] = useState<PhaseDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<V2PhaseItem | null>(null);

  const deloadCount = phases.filter((p) => p.is_deload).length;

  // Persist a full ordered set (the atomic PUT). Returns true on success.
  const persist = useCallback(async (next: PhaseEditRow[]): Promise<V2PhaseItem[] | null> => {
    try {
      const res = await fetch('/api/coach/methodology/phases', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phases: next }),
      });
      if (!res.ok) {
        setError('No se pudo guardar · Reintenta.');
        return null;
      }
      const json = (await res.json()) as PhasesResponse;
      return json.phases.map(toV2);
    } catch {
      setError('No se pudo guardar · Reintenta.');
      return null;
    }
  }, []);

  // ── Reorder (adjacent swap, persisted as a full set) ─────────────────────
  const move = useCallback(
    (index: number, delta: -1 | 1) => {
      const target = index + delta;
      if (target < 0 || target >= phases.length) return;
      const next = phases.slice();
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      setPhases(next); // optimistic; sequence_order re-derived server-side
      setError(null);
      void persist(toPayload(next)).then((saved) => {
        if (saved) setPhases(saved);
      });
    },
    [phases, persist],
  );

  // ── Save (create or edit) — splice the draft into the list and PUT ───────
  const save = useCallback(async () => {
    if (!draft) return;
    const label = draft.label.trim();
    if (!label) {
      setError('La etiqueta es obligatoria.');
      return;
    }
    setSaving(true);
    setError(null);

    const description = draft.description.trim() || null;
    const editedRow: V2PhaseItem = {
      id: draft.id ?? '',
      code: draft.code ?? '',
      label,
      role: draft.role,
      color: null, // derived from role (no manual override surfaced)
      default_weeks: draft.default_weeks,
      sequence_order: 0,
      is_deload: draft.is_deload,
      description,
    };

    const nextList =
      draft.id === null
        ? [...phases, editedRow]
        : phases.map((p) => (p.id === draft.id ? editedRow : p));

    const saved = await persist(toPayload(nextList));
    setSaving(false);
    if (saved) {
      setPhases(saved);
      setDraft(null);
    }
  }, [draft, phases, persist]);

  // ── Delete (allowed even in use) ─────────────────────────────────────────
  // Deleting the LAST phase clears all (the opt-out): the atomic PUT rejects an
  // empty set by design, so we hit the route's DELETE which clears the coach's
  // phases. Otherwise we PUT the remaining ordered set.
  const doDelete = useCallback(
    async (phase: V2PhaseItem) => {
      setError(null);
      const nextList = phases.filter((p) => p.id !== phase.id);

      const finish = (ok: boolean) => {
        if (!ok) return;
        setConfirmDelete(null);
        if (draft?.id === phase.id) setDraft(null);
      };

      if (nextList.length === 0) {
        try {
          const res = await fetch('/api/coach/methodology/phases', { method: 'DELETE' });
          if (!res.ok && res.status !== 204) {
            setError('No se pudo eliminar · Reintenta.');
            return;
          }
          setPhases([]);
          finish(true);
        } catch {
          setError('No se pudo eliminar · Reintenta.');
        }
        return;
      }

      const saved = await persist(toPayload(nextList));
      if (saved) {
        setPhases(saved);
        finish(true);
      }
    },
    [phases, persist, draft],
  );

  // ── Restore default ATR set (when empty) ─────────────────────────────────
  const restoreAtr = useCallback(async () => {
    setSaving(true);
    setError(null);
    const payload: PhaseEditRow[] = ATR_PHASE_SEED.map((s) => ({
      id: null,
      label: s.label,
      role: s.role,
      default_weeks: s.default_weeks,
      is_deload: s.is_deload,
      description: s.description,
    }));
    const saved = await persist(payload);
    setSaving(false);
    if (saved) setPhases(saved);
  }, [persist]);

  const isEmpty = phases.length === 0;

  return (
    <div>
      {/* topbar */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--v2-muted)]">
            <b className="v2-num">{phases.length}</b> fases
          </span>
          {deloadCount > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: 'var(--v2-info-soft)', color: 'var(--v2-info)' }}
            >
              <b className="v2-num">{deloadCount}</b> {deloadCount === 1 ? 'descarga' : 'descargas'}
            </span>
          ) : null}
        </div>
        {!isEmpty ? (
          <button
            type="button"
            onClick={() => {
              setDraft(emptyDraft());
              setError(null);
            }}
            className="v2-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="add" size={18} /> Nueva fase
          </button>
        ) : null}
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

      {isEmpty ? (
        <EmptyPhases onCreate={() => setDraft(emptyDraft())} onRestore={restoreAtr} restoring={saving} />
      ) : (
        <div className={cn('grid items-start gap-4', draft ? 'lg:grid-cols-[1fr_320px]' : 'grid-cols-1')}>
          <div className={cn('flex flex-col gap-2', draft ? 'hidden lg:flex' : undefined)}>
            {phases.map((p, i) => (
              <ReorderRow
                key={p.id}
                index={i}
                total={phases.length}
                onMove={move}
                selected={draft?.id === p.id}
                leadingRail={roleV2Color(p.role)}
                actions={
                  <>
                    <span className="mr-1 inline-flex items-center gap-1 text-[11.5px] text-[color:var(--v2-faint)]">
                      <MIcon name="date_range" size={14} />
                      <b className="v2-num">{p.default_weeks ?? '—'}</b> sem
                    </span>
                    <RowIconButton
                      icon="edit"
                      label="Editar fase"
                      onClick={() => {
                        setDraft({
                          id: p.id,
                          code: p.code,
                          label: p.label,
                          role: p.role,
                          default_weeks: p.default_weeks ?? 4,
                          is_deload: p.is_deload,
                          description: p.description ?? '',
                        });
                        setError(null);
                      }}
                    />
                    <RowIconButton icon="delete" label="Eliminar fase" danger onClick={() => setConfirmDelete(p)} />
                  </>
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="v2-num w-3.5 text-xs text-[color:var(--v2-faint)]">{i + 1}</span>
                  <span className="text-[14.5px] font-bold text-[color:var(--v2-fg)]">{p.label}</span>
                  <RoleChip role={p.role} />
                  {p.is_deload ? (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-[var(--v2-r-pill)] px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ background: 'var(--v2-info-soft)', color: 'var(--v2-info)' }}
                    >
                      <MIcon name="trending_down" size={12} /> descarga
                    </span>
                  ) : null}
                </div>
                {p.description ? (
                  <p className="ml-[22px] mt-0.5 truncate text-xs text-[color:var(--v2-muted)]">{p.description}</p>
                ) : null}
              </ReorderRow>
            ))}

            <PurposeStrip>
              Las fases son <b className="text-[color:var(--v2-fg)]">opcionales</b>: dan color y nombre a los microciclos en el editor de{' '}
              <b className="text-[color:var(--v2-fg)]">Secuencias</b>. Una secuencia funciona con o sin ellas. El <b className="text-[color:var(--v2-fg)]">rol</b> es lo único que fijamos nosotros.
            </PurposeStrip>

            <RoleLegend />
          </div>

          {draft ? (
            <SidePanel
              title={draft.id === null ? 'Nueva fase' : 'Editar fase'}
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
              <Field label="Etiqueta" hint="nombre libre">
                <input
                  type="text"
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="Acumulación"
                  maxLength={120}
                  autoFocus
                  className="v2-focus h-[34px] w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-[13px] text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]"
                />
              </Field>

              <Field label="Rol" hint="solo para el color e intensidad">
                <div className="flex flex-wrap gap-1.5">
                  {PHASE_ROLES.map((r) => {
                    const on = draft.role === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setDraft({ ...draft, role: r })}
                        aria-pressed={on}
                        title={ROLE_HINT[r]}
                        className={cn('v2-focus rounded-[var(--v2-r-pill)] transition-opacity', on ? 'opacity-100' : 'opacity-50 hover:opacity-80')}
                        style={on ? { boxShadow: `0 0 0 2px var(--v2-bg), 0 0 0 3px ${roleV2Color(r)}` } : undefined}
                      >
                        <RoleChip role={r} />
                      </button>
                    );
                  })}
                </div>
                <span className="mt-1.5 block text-[11px] leading-snug text-[color:var(--v2-faint)]">
                  {ROLE_HINT[draft.role]}
                </span>
              </Field>

              <Field label="Semanas por defecto">
                <Stepper
                  value={draft.default_weeks}
                  min={1}
                  max={52}
                  onChange={(v) => setDraft({ ...draft, default_weeks: v })}
                />
              </Field>

              <button
                type="button"
                onClick={() => setDraft({ ...draft, is_deload: !draft.is_deload })}
                aria-pressed={draft.is_deload}
                className="v2-focus inline-flex items-center gap-2 rounded text-left text-[12.5px] text-[color:var(--v2-fg)]"
              >
                <span
                  className={cn(
                    'flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] transition-colors',
                    draft.is_deload
                      ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                      : 'border-[color:var(--v2-border-strong)] text-transparent',
                  )}
                >
                  <MIcon name="check" size={13} />
                </span>
                Es semana de descarga
              </button>

              <Field label="Descripción" hint="opcional">
                <TextArea
                  value={draft.description}
                  onChange={(v) => setDraft({ ...draft, description: v })}
                  placeholder="Volumen alto, intensidad moderada. Construir base."
                  maxLength={2000}
                />
              </Field>
            </SidePanel>
          ) : null}
        </div>
      )}

      {confirmDelete ? (
        <ConfirmDeletePhase
          phase={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void doDelete(confirmDelete)}
        />
      ) : null}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="inline-flex items-center overflow-hidden rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        aria-label="Menos semanas"
        className="v2-focus flex h-8 w-[30px] items-center justify-center text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
      >
        <MIcon name="remove" size={16} />
      </button>
      <span className="v2-num min-w-[40px] px-2 text-center text-sm font-bold text-[color:var(--v2-fg)]">{value}</span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        aria-label="Más semanas"
        className="v2-focus flex h-8 w-[30px] items-center justify-center text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
      >
        <MIcon name="add" size={16} />
      </button>
    </div>
  );
}

function RoleLegend() {
  return (
    <div className="mt-2 flex flex-wrap gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-4 py-3.5">
      {PHASE_ROLES.map((r) => (
        <div key={r} className="flex min-w-[200px] items-center gap-2 text-xs text-[color:var(--v2-muted)]">
          <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-[4px]" style={{ background: roleV2Color(r) }} />
          <b className="text-[color:var(--v2-fg)]">{ROLE_LABEL[r]}</b>
          <span className="text-[color:var(--v2-faint)]">— {ROLE_HINT[r]}</span>
        </div>
      ))}
    </div>
  );
}

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

function EmptyPhases({
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
        <MIcon name="view_timeline" size={26} />
      </span>
      <p className="text-base font-bold text-[color:var(--v2-fg)]">No usas fases</p>
      <p className="mx-auto mt-1.5 max-w-[400px] text-[13px] leading-relaxed text-[color:var(--v2-muted)]">
        Tus microciclos irán sin etiqueta de color en las Secuencias, y funciona igual. Las fases son opcionales.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2.5">
        <PanelButton variant="primary" onClick={onCreate}>
          <MIcon name="add" size={16} /> Crear una fase
        </PanelButton>
        <PanelButton variant="outline" onClick={onRestore} disabled={restoring}>
          <MIcon name="restart_alt" size={16} /> {restoring ? 'Aplicando…' : 'Usar set ATR por defecto'}
        </PanelButton>
      </div>
    </div>
  );
}

function ConfirmDeletePhase({
  phase,
  onCancel,
  onConfirm,
}: {
  phase: V2PhaseItem;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onClick={onCancel} role="presentation">
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-[420px] rounded-[var(--v2-r-m)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] p-5"
      >
        <p className="text-[15px] font-bold text-[color:var(--v2-fg)]">¿Eliminar la fase «{phase.label}»?</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[color:var(--v2-muted)]">
          Los microciclos que la usen quedarán sin fase (siguen funcionando). Eliminar una fase nunca rompe contenido, solo le quita la etiqueta de color.
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
    </div>
  );
}
