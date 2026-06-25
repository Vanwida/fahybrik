'use client';

import { useMemo, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { SectionHeader } from './SectionHeader';
import {
  PHASE_ROLES,
  ROLE_LABEL,
  ROLE_HINT,
  roleColor,
  roleBadgeClass,
  ATR_PHASE_SEED,
} from '@/lib/dashboard/coach/phase-roles';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import type {
  MethodologyPhaseEdit,
  MethodologyPhasesSave,
} from '@fahybrid/shared/schema/methodology-phases';
import type { PhaseRole } from '@fahybrid/shared/schema/_primitives';

// Área 2 — Periodización (per-coach, methodology-agnostic phases · mig. 0052).
//
// Real CRUD on methodology_phases: the coach defines their OWN phases (arbitrary
// count, name, role, weeks, color, deload, order). The array order IS the
// periodization order; the server derives sequence_order from it. Saving sends
// the WHOLE ordered set to PUT /api/coach/methodology/phases (atomic upsert).

const PHASES_ENDPOINT = '/api/coach/methodology/phases';
const MIN_PHASES = 1;
const MAX_WEEKS = 52;

// Client-side editor row: a phase plus a stable local key for React (new rows
// have no DB id yet, so we can't key on it).
interface DraftPhase {
  /** Stable React key (local; never sent). */
  key: string;
  /** DB id when this row already exists; null for a new row. */
  id: number | null;
  code: string | null;
  label: string;
  role: PhaseRole;
  default_weeks: number | null;
  color: string | null;
  is_deload: boolean;
  description: string | null;
}

let keySeq = 0;
const nextKey = () => `p-${keySeq++}`;

function fromPhase(p: MethodologyPhase): DraftPhase {
  return {
    key: nextKey(),
    id: typeof p.id === 'bigint' ? Number(p.id) : p.id,
    code: p.code,
    label: p.label,
    role: p.role,
    default_weeks: p.default_weeks,
    color: p.color,
    is_deload: p.is_deload,
    description: p.description,
  };
}

function emptyDraft(role: PhaseRole = 'volume'): DraftPhase {
  return {
    key: nextKey(),
    id: null,
    code: null,
    label: '',
    role,
    default_weeks: 4,
    color: null,
    is_deload: false,
    description: null,
  };
}

function seedDrafts(): DraftPhase[] {
  return ATR_PHASE_SEED.map((s) => ({
    key: nextKey(),
    id: null,
    code: null,
    label: s.label,
    role: s.role,
    default_weeks: s.default_weeks,
    color: null,
    is_deload: s.is_deload,
    description: s.description,
  }));
}

/** Draft -> the wire shape the PUT endpoint validates. */
function toEdit(d: DraftPhase): MethodologyPhaseEdit {
  return {
    id: d.id ?? undefined,
    code: d.code ?? undefined,
    label: d.label.trim(),
    role: d.role,
    color: d.color && d.color.trim() ? d.color.trim() : null,
    default_weeks: d.default_weeks ?? null,
    is_deload: d.is_deload,
    description: d.description && d.description.trim() ? d.description.trim() : null,
  };
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

export function AtrPeriodizationSection({
  initialPhases,
}: {
  initialPhases: MethodologyPhase[];
}) {
  const [drafts, setDrafts] = useState<DraftPhase[]>(() =>
    initialPhases.map(fromPhase),
  );
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });

  const totalWeeks = useMemo(
    () => drafts.reduce((n, d) => n + (d.default_weeks ?? 0), 0),
    [drafts],
  );

  const patch = (key: string, p: Partial<DraftPhase>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...p } : d)));
    setSave({ kind: 'idle' });
  };

  const addPhase = () => {
    setDrafts((prev) => [...prev, emptyDraft()]);
    setSave({ kind: 'idle' });
  };

  const removePhase = (key: string) => {
    setDrafts((prev) => (prev.length <= MIN_PHASES ? prev : prev.filter((d) => d.key !== key)));
    setSave({ kind: 'idle' });
  };

  const move = (key: string, dir: -1 | 1) => {
    setDrafts((prev) => {
      const i = prev.findIndex((d) => d.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
    setSave({ kind: 'idle' });
  };

  const applySeed = () => {
    setDrafts(seedDrafts());
    setSave({ kind: 'idle' });
  };

  // Client-side validation mirroring the server: min 1, every row needs a label.
  const emptyLabel = drafts.some((d) => d.label.trim().length === 0);
  const canSave =
    save.kind !== 'saving' && drafts.length >= MIN_PHASES && !emptyLabel;

  const handleSave = async () => {
    if (!canSave) return;
    setSave({ kind: 'saving' });
    const payload: MethodologyPhasesSave = { phases: drafts.map(toEdit) };
    try {
      const res = await fetch(PHASES_ENDPOINT, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `Error (${res.status})`);
      }
      const body = (await res.json()) as { phases: MethodologyPhase[] };
      // Round-trip: rehydrate from the server's canonical, re-ordered set.
      setDrafts(body.phases.map(fromPhase));
      setSave({ kind: 'saved' });
    } catch (err) {
      setSave({
        kind: 'error',
        message: err instanceof Error ? err.message : 'No se pudo guardar.',
      });
    }
  };

  const isEmpty = drafts.length === 0;

  return (
    <div className="space-y-8">
      <SectionHeader
        areaId={2}
        phase="selection"
        title="Periodización"
        subtitle="Tus fases de periodización: las defines tú (cuántas, cómo se llaman, su rol e intensidad, duración por defecto y orden). El atleta no las toca: ve su resultado (fase actual, semanas a carrera) con tu vocabulario."
      />

      {/* Role color legend — the agnostic intensity ramp the coach is coding to. */}
      <RoleLegend />

      {/* Macrocycle summary readout (sum of default weeks, ordered ribbon). */}
      {!isEmpty ? (
        <div className="card-elevated flex flex-wrap items-center gap-6 p-4">
          <div className="metric-readout metric-readout--accent">
            <span className="metric-readout__value">
              {totalWeeks}
              <span className="metric-readout__unit"> sem</span>
            </span>
            <span className="metric-readout__label">macrociclo por defecto</span>
          </div>
          <div className="h-10 w-px bg-[color:var(--hairline)]" />
          <div className="flex flex-1 items-center gap-1 overflow-hidden rounded-[var(--r-m)]">
            {drafts.map((d) => {
              const w = d.default_weeks ?? 0;
              return (
                <div
                  key={d.key}
                  className="flex h-10 min-w-0 items-center justify-center truncate px-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[color:var(--accent-on)]"
                  style={{
                    flexGrow: Math.max(1, w),
                    background: `color-mix(in srgb, ${roleColor(d.role)} 70%, var(--surface-elevated))`,
                  }}
                  title={`${d.label || '—'} · ${w} sem`}
                >
                  {(d.label || '—').slice(0, 12)}
                  {w ? ` · ${w}` : ''}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Empty state — seed the default ATR set with one click. */}
      {isEmpty ? (
        <div className="card-surface flex flex-col items-center gap-4 p-10 text-center">
          <MIcon name="view_timeline" size={32} className="text-[color:var(--text-muted)]" />
          <div className="space-y-1">
            <h3 className="font-heading text-[color:var(--fg)]">Aún no has definido fases</h3>
            <p className="max-w-md text-sm text-[color:var(--text-muted)]">
              Define tu propia periodización desde cero, o parte del set ATR por defecto
              (Acumulación · Transformación · Realización + Descarga) y edítalo.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={applySeed}
              className="focus-ring inline-flex items-center gap-2 rounded-[var(--r-m)] bg-[color:var(--accent)] px-4 py-2 text-sm font-bold text-[color:var(--accent-on)] transition hover:bg-[color:var(--accent-press)]"
            >
              <MIcon name="view_timeline" size={18} />
              Usar set ATR por defecto
            </button>
            <button
              type="button"
              onClick={addPhase}
              className="focus-ring inline-flex items-center gap-2 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-2 text-sm font-semibold text-[color:var(--fg)] transition hover:border-[color:var(--accent)]"
            >
              <MIcon name="add" size={18} />
              Añadir fase
            </button>
          </div>
        </div>
      ) : null}

      {/* Phase rows */}
      {!isEmpty ? (
        <div className="space-y-4">
          {drafts.map((d, i) => (
            <PhaseRow
              key={d.key}
              draft={d}
              index={i}
              total={drafts.length}
              canRemove={drafts.length > MIN_PHASES}
              onPatch={(p) => patch(d.key, p)}
              onRemove={() => removePhase(d.key)}
              onMoveUp={() => move(d.key, -1)}
              onMoveDown={() => move(d.key, 1)}
            />
          ))}

          <button
            type="button"
            onClick={addPhase}
            className="focus-ring flex w-full items-center justify-center gap-2 rounded-[var(--r-m)] border border-dashed border-[color:var(--border-subtle)] py-3 text-sm font-semibold text-[color:var(--text-muted)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--fg)]"
          >
            <MIcon name="add" size={18} />
            Añadir fase
          </button>
        </div>
      ) : null}

      {/* Save bar */}
      {!isEmpty ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {emptyLabel ? (
            <span className="flex items-center gap-1 text-[13px] font-semibold text-[color:var(--warning)]">
              <MIcon name="info" size={16} />
              Cada fase necesita un nombre
            </span>
          ) : null}
          {save.kind === 'saved' ? (
            <span className="flex items-center gap-1 text-[13px] font-semibold text-[color:var(--ok)]">
              <MIcon name="check_circle" size={16} />
              Guardado
            </span>
          ) : null}
          {save.kind === 'error' ? (
            <span className="flex items-center gap-1 text-[13px] font-semibold text-[color:var(--danger)]">
              <MIcon name="error" size={16} />
              {save.message}
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="focus-ring inline-flex items-center gap-2 rounded-[var(--r-m)] bg-[color:var(--accent)] px-4 py-2 text-sm font-bold text-[color:var(--accent-on)] transition hover:bg-[color:var(--accent-press)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {save.kind === 'saving' ? (
              <MIcon name="progress_activity" size={18} className="animate-spin" />
            ) : (
              <MIcon name="save" size={18} />
            )}
            {save.kind === 'saving' ? 'Guardando…' : 'Guardar periodización'}
          </button>
        </div>
      ) : null}

      <style jsx>{`
        :global(.form-control) {
          width: 100%;
          border-radius: var(--r-sm);
          border: 1px solid var(--border-subtle);
          background: var(--surface-card);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: var(--fg);
        }
        :global(.form-control:focus) {
          outline: none;
          border-color: var(--accent);
        }
        :global(.stepper-btn) {
          display: grid;
          place-items: center;
          width: 2rem;
          height: 2rem;
          border-radius: var(--r-sm);
          border: 1px solid var(--border-subtle);
          background: var(--surface-card);
          color: var(--text-muted);
          transition:
            border-color 0.15s ease,
            color 0.15s ease;
        }
        :global(.stepper-btn:hover) {
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border-subtle));
          color: var(--fg);
        }
        :global(.icon-btn) {
          display: grid;
          place-items: center;
          width: 2rem;
          height: 2rem;
          border-radius: var(--r-sm);
          border: 1px solid var(--border-subtle);
          background: var(--surface-card);
          color: var(--text-muted);
          transition:
            border-color 0.15s ease,
            color 0.15s ease;
        }
        :global(.icon-btn:hover:not(:disabled)) {
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border-subtle));
          color: var(--fg);
        }
        :global(.icon-btn:disabled) {
          opacity: 0.4;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

// ── Role color legend ────────────────────────────────────────────────────────
function RoleLegend() {
  return (
    <div className="card-surface space-y-2 p-4">
      <span className="micro-label block">Rol e intensidad de cada fase</span>
      <div className="flex flex-wrap gap-2">
        {PHASE_ROLES.map((role) => (
          <span
            key={role}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border px-3 py-1 text-[12px] font-semibold',
              roleBadgeClass(role),
            )}
            title={ROLE_HINT[role]}
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: roleColor(role) }}
            />
            {ROLE_LABEL[role]}
          </span>
        ))}
      </div>
      <p className="text-[12px] text-[color:var(--text-muted)]">
        El rol define el color y la rampa de intensidad: volumen (verde) → intensidad (ámbar) →
        pico (rojo). Recuperación es azul; mantenimiento, neutro.
      </p>
    </div>
  );
}

// ── One phase row ────────────────────────────────────────────────────────────
function PhaseRow({
  draft,
  index,
  total,
  canRemove,
  onPatch,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  draft: DraftPhase;
  index: number;
  total: number;
  canRemove: boolean;
  onPatch: (p: Partial<DraftPhase>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const accent = draft.color && draft.color.trim() ? draft.color : roleColor(draft.role);

  return (
    <div className="card-surface p-5">
      {/* Header: order chip + label + reorder/remove controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--hairline)] pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-m)] font-display text-[15px] font-black italic text-[color:var(--accent-on)]"
            style={{ background: accent }}
          >
            {index + 1}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em]',
              roleBadgeClass(draft.role),
            )}
          >
            {ROLE_LABEL[draft.role]}
          </span>
          {draft.is_deload ? (
            <span className="inline-flex items-center gap-1 rounded-[var(--r-pill)] border border-[color:var(--info)]/40 bg-[color:var(--info)]/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[color:var(--info)]">
              <MIcon name="bedtime" size={12} />
              Descarga
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Subir fase"
            className="icon-btn"
            disabled={index === 0}
            onClick={onMoveUp}
          >
            <MIcon name="arrow_upward" size={16} />
          </button>
          <button
            type="button"
            aria-label="Bajar fase"
            className="icon-btn"
            disabled={index === total - 1}
            onClick={onMoveDown}
          >
            <MIcon name="arrow_downward" size={16} />
          </button>
          <button
            type="button"
            aria-label="Eliminar fase"
            className="icon-btn"
            disabled={!canRemove}
            title={canRemove ? 'Eliminar fase' : 'Debe quedar al menos una fase'}
            onClick={onRemove}
          >
            <MIcon name="delete" size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Label */}
        <Field label="Nombre de la fase">
          <input
            type="text"
            value={draft.label}
            placeholder="p. ej. Acumulación"
            onChange={(e) => onPatch({ label: e.target.value })}
            className="form-control"
          />
        </Field>

        {/* Role */}
        <Field label="Rol / intensidad">
          <select
            value={draft.role}
            onChange={(e) => onPatch({ role: e.target.value as PhaseRole })}
            className="form-control"
          >
            {PHASE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>

        {/* Default weeks */}
        <Field label="Semanas por defecto">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="restar semana"
              onClick={() => onPatch({ default_weeks: Math.max(1, (draft.default_weeks ?? 1) - 1) })}
              className="stepper-btn"
            >
              <MIcon name="remove" size={16} />
            </button>
            <span className="metric-num w-8 text-center text-lg font-semibold text-[color:var(--fg)]">
              {draft.default_weeks ?? '—'}
            </span>
            <button
              type="button"
              aria-label="sumar semana"
              onClick={() =>
                onPatch({ default_weeks: Math.min(MAX_WEEKS, (draft.default_weeks ?? 0) + 1) })
              }
              className="stepper-btn"
            >
              <MIcon name="add" size={16} />
            </button>
          </div>
        </Field>

        {/* Color override */}
        <Field label="Color (opcional)">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-7 w-7 shrink-0 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)]"
              style={{ background: accent }}
            />
            {draft.color ? (
              <button
                type="button"
                onClick={() => onPatch({ color: null })}
                className="focus-ring inline-flex items-center gap-1 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] px-2 py-1 text-[12px] font-semibold text-[color:var(--text-muted)] transition hover:text-[color:var(--fg)]"
              >
                <MIcon name="restart_alt" size={14} />
                Usar color del rol
              </button>
            ) : (
              <input
                type="color"
                aria-label="Elegir color"
                value="#f2a52e"
                onChange={(e) => onPatch({ color: e.target.value })}
                className="h-7 w-10 cursor-pointer rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]"
              />
            )}
          </div>
        </Field>
      </div>

      {/* Deload toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-5">
        <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-[color:var(--fg)]">
          <input
            type="checkbox"
            checked={draft.is_deload}
            onChange={(e) => onPatch({ is_deload: e.target.checked })}
            className="h-4 w-4 accent-[color:var(--accent)]"
          />
          Es una fase de descarga
          <span className="font-normal text-[color:var(--text-muted)]">
            (bajar carga para recuperar)
          </span>
        </label>
        <span className="micro-label">
          Orden {index + 1} de {total}
        </span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="micro-label block">{label}</span>
      {children}
    </div>
  );
}
