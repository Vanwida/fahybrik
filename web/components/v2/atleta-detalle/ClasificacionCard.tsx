'use client';

// CLASIFICACIÓN — nivel + días/semana in ONE place. These are the two axes the
// assignment resolver needs: an athlete only becomes assignable once BOTH are set
// (resolveSequenceForAthlete returns 'not_classified' without a level and
// 'no_training_days' without días). Each control persists immediately:
//   · Nivel → PATCH /api/coach/athletes/{id}/level
//   · Días  → PATCH /api/coach/athletes/{id}/training-days
// After a successful save we router.refresh() so the resolver-derived surfaces
// (header phase, Hoy's "Asignación sugerida") pick up the new value.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { Panel } from './parts';
import { cn } from '@/lib/utils';
import type { ClasificacionData } from '@/lib/dashboard/v2/atleta-detalle-types';

type Field = 'level' | 'days';

export function ClasificacionCard({
  athleteId,
  data,
  planPersonal = false,
}: {
  athleteId: string;
  data: ClasificacionData;
  /** Plan personal: la matriz nivel×días NO le asigna nada mientras tanto. */
  planPersonal?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Optimistic local state so the picked chip lights up instantly; reconciled by
  // the server refresh.
  const [levelId, setLevelId] = useState<string | null>(data.level_id);
  const [days, setDays] = useState<number | null>(data.training_days_per_week);

  const dayOptions: number[] = [];
  for (let d = data.days_band.min; d <= data.days_band.max; d += 1) dayOptions.push(d);

  const bothSet = levelId != null && days != null;

  async function persist(field: Field, body: Record<string, unknown>, apply: () => void) {
    if (saving) return;
    setSaving(field);
    setError(null);
    const path =
      field === 'level'
        ? `/api/coach/athletes/${athleteId}/level`
        : `/api/coach/athletes/${athleteId}/training-days`;
    try {
      const res = await fetch(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? 'No se pudo guardar. Inténtalo de nuevo.');
        return;
      }
      apply();
      startTransition(() => router.refresh());
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setSaving(null);
    }
  }

  function chooseLevel(id: string) {
    if (id === levelId) return;
    void persist('level', { level_id: Number(id) }, () => setLevelId(id));
  }

  function chooseDays(d: number) {
    if (d === days) return;
    void persist('days', { training_days_per_week: d }, () => setDays(d));
  }

  const busy = saving != null || isPending;
  const showSuggestion =
    levelId == null && data.suggested_level_id != null && data.suggested_level_name != null;

  return (
    <Panel
      title={planPersonal ? 'Clasificación' : 'Clasificación · para asignación'}
      action={
        planPersonal ? (
          // Con plan personal la secuencia por nivel está en pausa: decir «lista
          // para asignar» aquí mentiría. El nivel/días siguen siendo dato real
          // (analíticas, y el punto de retorno si vuelve a periodización).
          <Pill tone="neutral" variant="soft">
            Plan personal · la secuencia no asigna
          </Pill>
        ) : bothSet ? (
          <Pill tone="ok" variant="soft">
            <MIcon name="check_circle" size={13} className="mr-1" />
            Lista para asignar
          </Pill>
        ) : (
          <Pill tone="warn" variant="soft">
            {levelId == null && days == null
              ? 'Falta nivel y días'
              : levelId == null
                ? 'Falta nivel'
                : 'Faltan días'}
          </Pill>
        )
      }
      bodyClassName="flex flex-col gap-4"
    >
      {/* NIVEL */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="v2-micro">Nivel</span>
          {showSuggestion ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => chooseLevel(data.suggested_level_id!)}
              className="v2-focus inline-flex items-center gap-1 text-label font-semibold text-[color:var(--v2-accent-text)] hover:underline disabled:opacity-50"
            >
              <MIcon name="auto_awesome" size={13} />
              Sugerido: {data.suggested_level_name}
            </button>
          ) : null}
        </div>
        {showSuggestion && data.suggested_level_reason ? (
          <p className="flex items-start gap-1 text-label text-[color:var(--v2-faint)]">
            <MIcon name="insights" size={12} className="mt-px shrink-0" />
            <span>{data.suggested_level_reason}</span>
          </p>
        ) : null}
        {data.levels.length === 0 ? (
          <p className="text-xs text-[color:var(--v2-faint)]">
            No hay niveles definidos todavía. Créalos en Planificación.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {data.levels.map((lvl) => {
              const active = lvl.id === levelId;
              return (
                <button
                  key={lvl.id}
                  type="button"
                  disabled={busy}
                  onClick={() => chooseLevel(lvl.id)}
                  aria-pressed={active}
                  title={lvl.label}
                  className={cn(
                    'v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-pill)] border px-2.5 text-xs font-semibold transition-colors disabled:opacity-50',
                    active
                      ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent-text)]'
                      : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
                  )}
                >
                  <span className="v2-num">{lvl.name}</span>
                  <span className="hidden text-[color:var(--v2-faint)] sm:inline">{lvl.label}</span>
                  {saving === 'level' && active ? (
                    <MIcon name="progress_activity" size={13} className="animate-spin" />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* DÍAS / SEMANA */}
      <div className="flex flex-col gap-2">
        <span className="v2-micro">Días de entreno / semana</span>
        <div className="flex flex-wrap gap-1.5">
          {dayOptions.map((d) => {
            const active = d === days;
            return (
              <button
                key={d}
                type="button"
                disabled={busy}
                onClick={() => chooseDays(d)}
                aria-pressed={active}
                className={cn(
                  'v2-focus inline-flex h-8 w-10 items-center justify-center rounded-[var(--v2-r-pill)] border text-sm font-semibold transition-colors disabled:opacity-50',
                  active
                    ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent-text)]'
                    : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
                )}
              >
                {saving === 'days' && active ? (
                  <MIcon name="progress_activity" size={14} className="animate-spin" />
                ) : (
                  <span className="v2-num">{d}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p className="text-label font-medium text-[color:var(--v2-danger)]">{error}</p>
      ) : null}
    </Panel>
  );
}
