'use client';

// NuevoMicrocicloModal — "crear microciclo desde cero". AGNOSTIC: nivel y fase se
// eligen de los catálogos del coach (athlete_levels / methodology_phases),
// cargados en vivo — nunca texto libre, nunca enums ATR/level hardcodeados. El
// coach define nombre + nivel + nº de semanas (1..8) + fase OPCIONAL. Al guardar
// se crea el program_month_template con N semanas vacías y se entra al editor.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

const MIN_WEEKS = 1;
const MAX_WEEKS = 8;
const DEFAULT_WEEKS = 4;

interface LevelOption {
  id: string;
  name: string;
  label: string;
}
interface PhaseOption {
  id: number;
  label: string;
}

const selectClass =
  'h-[38px] w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 text-[13px] text-[color:var(--v2-fg)] focus:outline-none focus:border-[color:var(--v2-accent)]';
const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]';

export function NuevoMicrocicloModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [phases, setPhases] = useState<PhaseOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [name, setName] = useState('');
  const [levelId, setLevelId] = useState('');
  const [phaseId, setPhaseId] = useState(''); // '' = sin fase
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the coach's level + phase catalogs (agnostic data sources).
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch('/api/coach/levels', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/coach/methodology/phases', { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([lv, ph]: [{ levels?: LevelOption[] }, { phases?: PhaseOption[] }]) => {
        if (!alive) return;
        const lvls = lv.levels ?? [];
        setLevels(lvls);
        setPhases(ph.phases ?? []);
        if (lvls[0]) setLevelId(lvls[0].id);
      })
      .catch(() => {
        if (alive) setError('No se pudieron cargar tus niveles y fases.');
      })
      .finally(() => {
        if (alive) setLoadingData(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canSubmit =
    name.trim().length > 0 && levelId !== '' && weeks >= MIN_WEEKS && weeks <= MAX_WEEKS && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/coach/program-months/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          level_id: Number(levelId),
          phase_id: phaseId === '' ? null : Number(phaseId),
          week_count: weeks,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? 'No se pudo crear el microciclo.');
        setSubmitting(false);
        return;
      }
      const created = (await res.json()) as { id: string };
      // Redirect into the editor with the N empty weeks ready.
      router.push(`/microciclos/${created.id}`);
    } catch {
      setError('Error de red al crear el microciclo.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/55 p-4 pt-[8vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-label="Crear microciclo nuevo"
        onClick={(e) => e.stopPropagation()}
        className="v2-focus flex w-full max-w-[480px] flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-elevated)] p-[18px] shadow-[var(--v2-shadow-pop)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-bold text-[color:var(--v2-fg)]">Crear microciclo nuevo</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus rounded text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={18} />
          </button>
        </div>

        {loadingData ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-[color:var(--v2-muted)]">
            <MIcon name="progress_activity" size={18} className="animate-spin" />
            Cargando tus niveles y fases…
          </div>
        ) : levels.length === 0 ? (
          <div className="rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border)] px-4 py-8 text-center text-[13px] text-[color:var(--v2-muted)]">
            Define al menos un nivel en Periodización › Niveles antes de crear un microciclo.
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <div>
              <label htmlFor="micro-name" className={labelClass}>
                Nombre
              </label>
              <input
                id="micro-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="p. ej. Base aeróbica · bloque 1"
                autoFocus
                className="h-[38px] w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 text-[13px] text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:outline-none focus:border-[color:var(--v2-accent)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="micro-level" className={labelClass}>
                  Nivel
                </label>
                <select
                  id="micro-level"
                  value={levelId}
                  onChange={(e) => setLevelId(e.target.value)}
                  className={selectClass}
                >
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} · {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="micro-weeks" className={labelClass}>
                  Semanas
                </label>
                <input
                  id="micro-weeks"
                  type="number"
                  min={MIN_WEEKS}
                  max={MAX_WEEKS}
                  value={weeks}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setWeeks(Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.round(n))));
                  }}
                  className="h-[38px] w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 text-[13px] text-[color:var(--v2-fg)] focus:outline-none focus:border-[color:var(--v2-accent)]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="micro-phase" className={labelClass}>
                Fase <span className="font-normal normal-case text-[color:var(--v2-faint)]">(opcional)</span>
              </label>
              <select
                id="micro-phase"
                value={phaseId}
                onChange={(e) => setPhaseId(e.target.value)}
                className={selectClass}
                disabled={phases.length === 0}
              >
                <option value="">Sin fase</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {error ? (
              <p className="text-[12px] font-medium text-[color:var(--v2-danger,#ef4444)]">{error}</p>
            ) : null}

            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className={cn(
                  'v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3.5 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {submitting ? (
                  <>
                    <MIcon name="progress_activity" size={15} className="animate-spin" /> Creando…
                  </>
                ) : (
                  <>
                    Crear y editar <MIcon name="arrow_forward" size={15} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
