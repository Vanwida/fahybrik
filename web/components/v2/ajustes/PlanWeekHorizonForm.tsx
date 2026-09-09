'use client';

// FH-27 — cuántas semanas adelante puede hojear el atleta en Plan.
// Método del club (dato en `coaches.plan_week_horizon`), no mecanismo.
// Misma tarjeta autónoma que SignalThresholdsForm: carga sola, fallo aislado.

import { useEffect, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Card } from '@/components/ui/card';
import { ajustesButtonPrimary, ajustesButtonSecondary } from './controls';
import {
  PLAN_WEEK_HORIZON_OPTIONS,
  type PlanWeekHorizon,
} from '@fahybrid/shared/domain/coach/plan-week-horizon';
import type { CoachPlanWeekHorizonResponse } from '@fahybrid/shared/schema/coach-plan-week-horizon';
import { cn } from '@/lib/utils';

const ENDPOINT = '/api/coach/plan-week-horizon';

type Estado =
  | { fase: 'cargando' }
  | { fase: 'error' }
  | {
      fase: 'listo';
      saved: PlanWeekHorizon;
      value: PlanWeekHorizon;
      maxWeekOffset: number;
    };

async function fetchHorizon(): Promise<Estado> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return { fase: 'error' };
    const data = (await res.json()) as CoachPlanWeekHorizonResponse;
    return {
      fase: 'listo',
      saved: data.plan_week_horizon,
      value: data.plan_week_horizon,
      maxWeekOffset: data.max_week_offset,
    };
  } catch {
    return { fase: 'error' };
  }
}

export function PlanWeekHorizonForm() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    void fetchHorizon().then(setEstado);
  }, []);

  const dirty =
    estado.fase === 'listo' && estado.value !== estado.saved;

  async function guardar() {
    if (estado.fase !== 'listo' || !dirty) return;
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_week_horizon: estado.value }),
      });
      if (!res.ok) {
        setMensaje('No se pudo guardar. Inténtalo de nuevo.');
        return;
      }
      const data = (await res.json()) as CoachPlanWeekHorizonResponse;
      setEstado({
        fase: 'listo',
        saved: data.plan_week_horizon,
        value: data.plan_week_horizon,
        maxWeekOffset: data.max_week_offset,
      });
      setMensaje('Guardado.');
    } catch {
      setMensaje('No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section>
      <h2 className="v2-micro mb-2">Plan del atleta</h2>
      <Card className="overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--v2-r-m)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent-text)]"
            >
              <MIcon name="calendar_month" size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[color:var(--v2-fg)]">
                Visibilidad del plan
              </p>
              <p className="mt-0.5 text-xs text-[color:var(--v2-muted)]">
                Cuántas semanas puede hojear tu atleta en la pestaña Plan. Afecta a
                todo el club; el atleta no puede ampliarlo por su cuenta.
              </p>
            </div>
          </div>

          {estado.fase === 'cargando' && (
            <p className="text-sm text-[color:var(--v2-muted)]">Cargando…</p>
          )}

          {estado.fase === 'error' && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-[color:var(--v2-muted)]">
                No hemos podido cargar este ajuste.
              </p>
              <button
                type="button"
                className={ajustesButtonSecondary}
                onClick={() => {
                  setEstado({ fase: 'cargando' });
                  void fetchHorizon().then(setEstado);
                }}
              >
                Reintentar
              </button>
            </div>
          )}

          {estado.fase === 'listo' && (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">Horizonte de visibilidad</legend>
                {PLAN_WEEK_HORIZON_OPTIONS.map((opt) => {
                  const selected = estado.value === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={cn(
                        'v2-focus flex cursor-pointer flex-col gap-0.5 rounded-[var(--v2-r-m)] border px-3 py-2.5 transition-colors',
                        selected
                          ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)]'
                          : 'border-[color:var(--v2-border)] hover:border-[color:var(--v2-fg)]/20',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="plan_week_horizon"
                          value={opt.value}
                          checked={selected}
                          onChange={() =>
                            setEstado({ ...estado, value: opt.value })
                          }
                          className="accent-[color:var(--v2-accent)]"
                        />
                        <span className="text-sm font-medium text-[color:var(--v2-fg)]">
                          {opt.label}
                        </span>
                      </span>
                      <span className="pl-6 text-xs text-[color:var(--v2-muted)]">
                        {opt.help}
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              <p className="text-xs text-[color:var(--v2-faint)]">
                Offset máximo actual: {estado.maxWeekOffset}{' '}
                {estado.maxWeekOffset === 1 ? 'semana' : 'semanas'} adelante.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={ajustesButtonPrimary}
                  disabled={!dirty || guardando}
                  onClick={() => void guardar()}
                >
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
                {dirty && (
                  <button
                    type="button"
                    className={ajustesButtonSecondary}
                    disabled={guardando}
                    onClick={() =>
                      setEstado({ ...estado, value: estado.saved })
                    }
                  >
                    Descartar
                  </button>
                )}
              </div>

              {mensaje && (
                <p className="text-xs text-[color:var(--v2-muted)]">{mensaje}</p>
              )}
            </>
          )}
        </div>
      </Card>
    </section>
  );
}
