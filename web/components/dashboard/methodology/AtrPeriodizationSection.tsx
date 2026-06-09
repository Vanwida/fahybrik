'use client';

import { useState } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';
import { SectionHeader } from './SectionHeader';
import { DefaultBadge } from './DefaultBadge';
import {
  ATR_BLOCKS_DEFAULT,
  OBJECTIVE_OPTIONS,
  INTENSITY_CEILING_OPTIONS,
  MACROCYCLE_TOTAL_WEEKS,
  type AtrBlockDefault,
} from '@/lib/dashboard/coach/methodology/defaults';
import type { FieldState } from '@/lib/dashboard/coach/methodology/rule-vm';

// Área 2 — Periodización ATR. Structured fields, pre-filled with Pablo's real
// defaults (ACC 5 / TRANS 4 / REAL 3). Showcase of "rellenar sin escribir":
// the coach edits selects + the block matrix, never free text.

const objectiveLabel = (id: string) =>
  OBJECTIVE_OPTIONS.find((o) => o.id === id)?.label ?? id;

const CEILING_TINT: Record<string, string> = {
  Z2: 'var(--z2)',
  Z3: 'var(--z3)',
  Z4: 'var(--z4)',
  Z5: 'var(--z5)',
};

export function AtrPeriodizationSection() {
  const [blocks, setBlocks] = useState<AtrBlockDefault[]>(() =>
    ATR_BLOCKS_DEFAULT.map((b) => ({ ...b, objectives: [...b.objectives] })),
  );
  // Per-block field state: prefilled until the coach touches it → edited.
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const totalWeeks = blocks.reduce((n, b) => n + b.durationWeeks, 0);

  const update = (block: string, patch: Partial<AtrBlockDefault>) => {
    setBlocks((prev) => prev.map((b) => (b.block === block ? { ...b, ...patch } : b)));
    setTouched((t) => ({ ...t, [block]: true }));
  };

  const toggleObjective = (block: string, objId: string) => {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.block !== block) return b;
        const has = b.objectives.includes(objId);
        return {
          ...b,
          objectives: has
            ? b.objectives.filter((o) => o !== objId)
            : [...b.objectives, objId],
        };
      }),
    );
    setTouched((t) => ({ ...t, [block]: true }));
  };

  const fieldState = (block: string): FieldState => (touched[block] ? 'edited' : 'prefilled');

  return (
    <div className="space-y-8">
      <SectionHeader
        areaId={2}
        phase="selection"
        title="Periodización ATR"
        subtitle="Acumulación · Transformación · Realización. El atleta no la toca: ve su resultado (bloque actual, semanas a carrera) con vocabulario athlete-facing. El plan se asigna en 3 microciclos; las semanas salen solas."
      />

      {/* Macrocycle summary readout */}
      <div className="card-elevated flex flex-wrap items-center gap-6 p-4">
        <div className="metric-readout metric-readout--accent">
          <span className="metric-readout__value">
            {totalWeeks}
            <span className="metric-readout__unit"> sem</span>
          </span>
          <span className="metric-readout__label">macrociclo a carrera</span>
        </div>
        <div className="h-10 w-px bg-[color:var(--hairline)]" />
        <div className="flex flex-1 items-center gap-1 overflow-hidden rounded-[var(--r-m)]">
          {blocks.map((b) => (
            <div
              key={b.block}
              className="flex h-10 items-center justify-center text-[11px] font-bold uppercase tracking-[0.06em] text-[color:var(--accent-on)]"
              style={{
                flexGrow: b.durationWeeks,
                background: `color-mix(in srgb, ${CEILING_TINT[b.intensityCeiling]} 70%, var(--surface-elevated))`,
              }}
              title={`${b.labelAthlete} · ${b.durationWeeks} sem`}
            >
              {b.block} · {b.durationWeeks}
            </div>
          ))}
        </div>
        {totalWeeks !== MACROCYCLE_TOTAL_WEEKS ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[color:var(--warning)]">
            <MIcon name="info" size={14} />
            editado del default ({MACROCYCLE_TOTAL_WEEKS} sem)
          </span>
        ) : null}
      </div>

      {/* Block matrix */}
      <div className="space-y-4">
        {blocks.map((b) => (
          <div key={b.block} className="card-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--hairline)] pb-4">
              <div className="flex items-center gap-3">
                <span
                  className="grid h-10 w-10 place-items-center rounded-[var(--r-m)] font-display text-[15px] font-black italic text-[color:var(--accent-on)]"
                  style={{ background: CEILING_TINT[b.intensityCeiling] }}
                >
                  {b.order}
                </span>
                <div>
                  <span className="micro-label block">Bloque {b.block}</span>
                  <h3 className="font-heading text-[color:var(--fg)]">{b.labelAthlete}</h3>
                </div>
              </div>
              <DefaultBadge state={fieldState(b.block)} />
            </div>

            <div className="grid grid-cols-1 gap-5 pt-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Label athlete */}
              <Field label="Etiqueta para el atleta">
                <input
                  type="text"
                  value={b.labelAthlete}
                  onChange={(e) => update(b.block, { labelAthlete: e.target.value })}
                  className="form-control"
                />
              </Field>

              {/* Duration */}
              <Field label="Duración (semanas)">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="restar semana"
                    onClick={() =>
                      update(b.block, { durationWeeks: Math.max(1, b.durationWeeks - 1) })
                    }
                    className="stepper-btn"
                  >
                    <MIcon name="remove" size={16} />
                  </button>
                  <span className="metric-num w-8 text-center text-lg font-semibold text-[color:var(--fg)]">
                    {b.durationWeeks}
                  </span>
                  <button
                    type="button"
                    aria-label="sumar semana"
                    onClick={() =>
                      update(b.block, { durationWeeks: Math.min(8, b.durationWeeks + 1) })
                    }
                    className="stepper-btn"
                  >
                    <MIcon name="add" size={16} />
                  </button>
                </div>
              </Field>

              {/* Intensity ceiling */}
              <Field label="Techo de intensidad">
                <div className="flex gap-1">
                  {INTENSITY_CEILING_OPTIONS.map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => update(b.block, { intensityCeiling: z })}
                      className={cn(
                        'focus-ring flex-1 rounded-[var(--r-sm)] border py-1.5 text-xs font-bold transition',
                        b.intensityCeiling === z
                          ? 'text-[color:var(--accent-on)]'
                          : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[color:var(--text-muted)] hover:text-[color:var(--fg)]',
                      )}
                      style={
                        b.intensityCeiling === z
                          ? { background: CEILING_TINT[z], borderColor: CEILING_TINT[z] }
                          : undefined
                      }
                    >
                      {z}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Order (read-only, derived) */}
              <Field label="Orden en el ciclo">
                <span className="metric-num inline-flex items-center gap-1.5 text-sm text-[color:var(--text-muted)]">
                  <MIcon name="lock" size={14} />
                  {b.order} de {blocks.length}
                </span>
              </Field>
            </div>

            {/* Objectives multiselect */}
            <div className="pt-5">
              <span className="micro-label mb-2 block">Objetivos del bloque</span>
              <div className="flex flex-wrap gap-2">
                {OBJECTIVE_OPTIONS.map((o) => {
                  const active = b.objectives.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggleObjective(b.block, o.id)}
                      className={cn(
                        'focus-ring inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border px-3 py-1.5 text-[12px] font-semibold transition',
                        active
                          ? 'border-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface-card))] text-[color:var(--accent)]'
                          : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[color:var(--text-muted)] hover:text-[color:var(--fg)]',
                      )}
                    >
                      {active ? <MIcon name="check" size={14} /> : null}
                      {objectiveLabel(o.id)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Derived rules note */}
      <div className="card-surface space-y-2 p-4">
        <span className="micro-label flex items-center gap-1.5">
          <MIcon name="bolt" size={14} className="text-[color:var(--accent)]" />
          Reglas derivadas de esta área
        </span>
        <ul className="space-y-1 text-[13px] text-[color:var(--text-muted)]">
          <li>
            <code className="metric-num text-[color:var(--fg)]">semanas_a_carrera == 3</code> →
            entra en bloque REAL
          </li>
          <li>
            <code className="metric-num text-[color:var(--fg)]">REAL & semanas_a_carrera ≤ 1</code>{' '}
            → taper profundo
          </li>
          <li>
            <code className="metric-num text-[color:var(--fg)]">semanas_a_carrera &lt; 12</code> →
            recortar desde el inicio de ACC (REAL siempre completo)
          </li>
        </ul>
      </div>

      <SaveBar />

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
          transition: border-color 0.15s ease, color 0.15s ease;
        }
        :global(.stepper-btn:hover) {
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border-subtle));
          color: var(--fg);
        }
      `}</style>
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

function SaveBar() {
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex items-center justify-end gap-3">
      {saved ? (
        <span className="flex items-center gap-1 text-[13px] font-semibold text-[color:var(--ok)]">
          <MIcon name="check_circle" size={16} />
          Guardado (local)
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => {
          // Stub: persists to local state only. Follow-up: PATCH methodology_blocks.
          setSaved(true);
          window.setTimeout(() => setSaved(false), 2000);
        }}
        className="focus-ring inline-flex items-center gap-2 rounded-[var(--r-m)] bg-[color:var(--accent)] px-4 py-2 text-sm font-bold text-[color:var(--accent-on)] transition hover:bg-[color:var(--accent-press)]"
      >
        <MIcon name="save" size={18} />
        Confirmar periodización
      </button>
    </div>
  );
}
