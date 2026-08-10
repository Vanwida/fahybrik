'use client';

// PLANES PERSONALES (0164, camino secundario — "empezar de cero") — every
// microciclo built for exactly this athlete: lists them, opens the existing
// microciclo editor, and lets the coach start a new empty one. The PRIMARY way
// to get a personal plan is "Personalizar plan" (forks what the athlete already
// has, see PersonalizarPlanModal) — this panel is for the from-scratch case, or
// for reopening a personal plan built earlier.

import { useEffect, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { Panel } from './parts';
import { BorrarPlanPersonalModal } from './BorrarPlanPersonalModal';

interface PersonalPlan {
  id: string;
  name: string;
  week_count: number;
  updated_at: string;
  is_current: boolean;
  pending_count: number;
  completed_count: number;
}

const MIN_WEEKS = 1;
const MAX_WEEKS = 20;
const DEFAULT_WEEKS = 4;

export function PlanesPersonalesPanel({
  athleteId,
  athleteName,
}: {
  athleteId: string;
  /** Optional — unavailable on the empty-plan ficha branch, where this panel
   *  still renders but no AthletePlanPayload exists yet to read a name from. */
  athleteName?: string;
}) {
  const router = useRouter();
  const [plans, setPlans] = useState<PersonalPlan[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PersonalPlan | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/coach/athletes/${athleteId}/microciclo`, { credentials: 'include' })
      .then((r) => r.json())
      .then((body: { plans?: PersonalPlan[] }) => {
        if (alive) setPlans(body.plans ?? []);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [athleteId]);

  const canSubmit = name.trim().length > 0 && weeks >= MIN_WEEKS && weeks <= MAX_WEEKS && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/microciclo`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), week_count: weeks }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setSubmitError(body?.error?.message ?? 'No se pudo crear el plan.');
        setSubmitting(false);
        return;
      }
      const created = (await res.json()) as { id: string };
      router.push(`/microciclos/${created.id}`);
    } catch {
      setSubmitError('Error de red al crear el plan.');
      setSubmitting(false);
    }
  }

  return (
    <Panel
      title="Planes personales"
      action={
        !creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2.5 text-label font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
          >
            <MIcon name="add" size={14} /> Nuevo
          </button>
        ) : null
      }
      bodyClassName="flex flex-col gap-2.5"
    >
      {creating ? (
        <div className="flex flex-col gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
          <label className="flex flex-col gap-1">
            <span className="v2-micro">Nombre</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="p. ej. Plan a medida · agosto"
              autoFocus
              className="h-9 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2.5 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:outline-none focus:border-[color:var(--v2-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="v2-micro">Semanas</span>
            <input
              type="number"
              min={MIN_WEEKS}
              max={MAX_WEEKS}
              value={weeks}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setWeeks(Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.round(n))));
              }}
              className="v2-num h-9 w-24 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2.5 text-sm text-[color:var(--v2-fg)] focus:outline-none focus:border-[color:var(--v2-accent)]"
            />
          </label>
          {submitError ? <p className="text-label font-semibold text-[color:var(--v2-danger)]">{submitError}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="v2-focus inline-flex h-8 items-center rounded-[var(--v2-r-s)] px-2.5 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="v2-focus inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
            >
              {submitting ? 'Creando…' : 'Crear y editar'}
            </button>
          </div>
        </div>
      ) : null}

      {plans === null ? (
        loadError ? (
          <p className="py-2 text-center text-xs text-[color:var(--v2-danger)]">
            No se pudieron cargar los planes personales.
          </p>
        ) : (
          <p className="py-2 text-center text-xs text-[color:var(--v2-muted)]">Cargando…</p>
        )
      ) : plans.length === 0 && !creating ? (
        <p className="py-2 text-center text-xs text-[color:var(--v2-muted)]">
          Sin planes personales todavía. «Personalizar plan» arriba parte de lo que ya tiene; «Nuevo»
          empieza uno en blanco.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {plans.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] transition-colors hover:border-[color:var(--v2-border-strong)]"
            >
              <Link
                href={`/microciclos/${p.id}`}
                className="v2-focus flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="truncate font-medium text-[color:var(--v2-fg)]">{p.name}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {p.is_current ? (
                    <Pill tone="ok" variant="soft">
                      en curso
                    </Pill>
                  ) : null}
                  <span className="v2-num text-xs text-[color:var(--v2-muted)]">
                    {p.week_count} {p.week_count === 1 ? 'sem' : 'sems'}
                  </span>
                  <MIcon name="chevron_right" size={16} className="text-[color:var(--v2-faint)]" />
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setDeleteTarget(p)}
                title={`Borrar «${p.name}»`}
                aria-label={`Borrar «${p.name}»`}
                className="v2-focus mr-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:bg-[color:var(--v2-danger)]/10 hover:text-[color:var(--v2-danger)]"
              >
                <MIcon name="delete" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {deleteTarget ? (
        <BorrarPlanPersonalModal
          athleteId={athleteId}
          athleteName={athleteName ?? 'este atleta'}
          monthTemplateId={deleteTarget.id}
          planName={deleteTarget.name}
          pendingCount={deleteTarget.pending_count}
          completedCount={deleteTarget.completed_count}
          isCurrent={deleteTarget.is_current}
          onClose={() => setDeleteTarget(null)}
          onDeleted={(deletedId) => setPlans((prev) => prev?.filter((x) => x.id !== deletedId) ?? prev)}
        />
      ) : null}
    </Panel>
  );
}
