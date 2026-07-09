'use client';

// #34 — the create/edit panel body for a coach calibration test. Fields: nombre,
// formato, protocolo, RESULTADOS (what it measures + calibrates) and AGENDA (which
// week(s) + day, repeatable). The single "Qué mide" select per result unifies the
// measure + calibration choice: picking a catalog target calibrates (zonas/1RM);
// picking a baseline measure just stores the number. This is what makes the rule
// "distance/reps/calories ⇒ baseline" hold by construction — those measures only
// exist under the baseline options, and every calibrating option is time/load.

import { SidePanel, Field, TextInput, TextArea } from '@/components/v2/periodizacion/SidePanel';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import {
  CALIBRATION_TARGETS,
  BASELINE_MEASURE_UNITS,
  calibrationTargetByKey,
} from '@fahybrid/shared/domain/coach/test-battery';
import type { StoreResultUnit } from '@fahybrid/shared/schema/test-battery';
import { PanelButton, SelectInput } from './chrome';
import {
  type TestDraft,
  type DraftResult,
  encodeResultChoice,
  decodeResultChoice,
  defaultDraftResult,
} from './draft';

// Session shapes offered for a test (a curated subset of template_format).
const FORMAT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'test', label: 'Test / contrarreloj' },
  { value: 'strength_block', label: 'Fuerza (1RM)' },
  { value: 'hyrox_sim', label: 'Simulación HYROX' },
];

const DOW_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

const UNIT_ES: Record<StoreResultUnit, string> = {
  seconds: 'segundos',
  meters: 'metros',
  reps: 'repeticiones',
  calories: 'calorías',
  kg: 'kg',
};

function resultHelp(r: DraftResult): string {
  if (r.kind === 'calibration') {
    const t = calibrationTargetByKey(r.target);
    if (!t) return '';
    return `Calibra ${t.coach_label.toLowerCase()} · se mide en ${UNIT_ES[t.unit]}.`;
  }
  return `Solo se guarda como referencia (aún no calibra zonas ni 1RM). Se mide en ${UNIT_ES[r.unit]}.`;
}

function resultPlaceholder(r: DraftResult): string {
  if (r.kind === 'calibration') return calibrationTargetByKey(r.target)?.result_label ?? 'Resultado';
  return BASELINE_MEASURE_UNITS.find((m) => m.measure === r.measure)?.label ?? 'Resultado';
}

export function TestEditorPanel({
  draft,
  onChange,
  onSave,
  onClose,
  saving,
}: {
  draft: TestDraft;
  onChange: (d: TestDraft) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  const setResult = (i: number, r: DraftResult) => {
    onChange({ ...draft, results: draft.results.map((x, j) => (j === i ? r : x)) });
  };
  const addResult = () => onChange({ ...draft, results: [...draft.results, defaultDraftResult()] });
  const removeResult = (i: number) =>
    onChange({ ...draft, results: draft.results.filter((_, j) => j !== i) });

  const setSchedule = (i: number, patch: Partial<TestDraft['schedule'][number]>) => {
    onChange({
      ...draft,
      schedule: draft.schedule.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    });
  };
  const addSchedule = () =>
    onChange({ ...draft, schedule: [...draft.schedule, { week_offset: 1, day_of_week: 1 }] });
  const removeSchedule = (i: number) =>
    onChange({ ...draft, schedule: draft.schedule.filter((_, j) => j !== i) });

  return (
    <SidePanel
      title={draft.id === null ? 'Nuevo test' : 'Editar test'}
      onClose={onClose}
      footer={
        <>
          <PanelButton variant="ghost" onClick={onClose}>
            Cancelar
          </PanelButton>
          <PanelButton variant="primary" onClick={onSave} disabled={saving}>
            <MIcon name="check" size={15} /> {saving ? 'Guardando…' : 'Guardar'}
          </PanelButton>
        </>
      }
    >
      <Field label="Nombre">
        <TextInput
          value={draft.name}
          onChange={(v) => onChange({ ...draft, name: v })}
          placeholder="5K control"
          maxLength={120}
          autoFocus
        />
      </Field>

      <Field label="Formato" hint="la forma de la sesión">
        <SelectInput
          ariaLabel="Formato"
          value={FORMAT_OPTIONS.some((f) => f.value === draft.format) ? draft.format : 'test'}
          onChange={(v) => onChange({ ...draft, format: v })}
        >
          {FORMAT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </SelectInput>
      </Field>

      <Field label="Protocolo" hint="qué hace el atleta · opcional">
        <TextArea
          value={draft.protocol}
          onChange={(v) => onChange({ ...draft, protocol: v })}
          placeholder="5 km a fondo. Calienta 10–15 min, luego 5 km al máximo sostenible."
          maxLength={4000}
        />
      </Field>

      {/* Resultados */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[color:var(--v2-muted)]">
            Resultados
          </span>
          <button
            type="button"
            onClick={addResult}
            className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] px-1.5 py-0.5 text-[11.5px] font-bold text-[color:var(--v2-accent)] hover:bg-[color:var(--v2-accent-soft)]"
          >
            <MIcon name="add" size={14} /> Añadir
          </button>
        </div>
        <div className="flex flex-col gap-2.5">
          {draft.results.map((r, i) => (
            <div
              key={i}
              className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-2.5"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <SelectInput
                    ariaLabel="Qué mide y calibra"
                    value={encodeResultChoice(r)}
                    onChange={(v) => setResult(i, decodeResultChoice(v, r.label))}
                  >
                    <optgroup label="Calibra (zonas / 1RM)">
                      {CALIBRATION_TARGETS.map((t) => (
                        <option key={t.key} value={`cal:${t.key}`}>
                          {t.coach_label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Solo guardar el número (baseline)">
                      {BASELINE_MEASURE_UNITS.map((m) => (
                        <option key={m.measure} value={`base:${m.measure}`}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  </SelectInput>
                </div>
                {draft.results.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeResult(i)}
                    aria-label="Quitar resultado"
                    className="v2-focus mt-0.5 flex h-[34px] w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-danger)] hover:text-[color:var(--v2-danger)]"
                  >
                    <MIcon name="close" size={15} />
                  </button>
                ) : null}
              </div>
              <div className="mt-1.5">
                <TextInput
                  value={r.label}
                  onChange={(v) => setResult(i, { ...r, label: v })}
                  placeholder={resultPlaceholder(r)}
                  maxLength={60}
                />
              </div>
              <p className="mt-1 text-[11px] leading-snug text-[color:var(--v2-faint)]">
                {resultHelp(r)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Agenda */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[color:var(--v2-muted)]">
            Agenda
          </span>
          <button
            type="button"
            onClick={addSchedule}
            className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] px-1.5 py-0.5 text-[11.5px] font-bold text-[color:var(--v2-accent)] hover:bg-[color:var(--v2-accent-soft)]"
          >
            <MIcon name="add" size={14} /> Añadir semana
          </button>
        </div>
        {draft.schedule.length === 0 ? (
          <p className="rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border)] px-3 py-2.5 text-[11.5px] leading-snug text-[color:var(--v2-faint)]">
            Sin agenda: el test queda en tu catálogo pero no se programa solo. Añade una semana para que se inyecte en el plan del atleta.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {draft.schedule.map((s, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-2"
              >
                <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[color:var(--v2-muted)]">
                  Semana
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={s.week_offset}
                    onChange={(e) =>
                      setSchedule(i, {
                        week_offset: Math.min(52, Math.max(1, Number(e.target.value) || 1)),
                      })
                    }
                    className="v2-focus h-7 w-14 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2 text-center text-[13px] text-[color:var(--v2-fg)]"
                  />
                </label>
                <div className="flex items-center gap-1">
                  {DOW_LABELS.map((lbl, idx) => {
                    const dow = idx + 1;
                    const active = s.day_of_week === dow;
                    return (
                      <button
                        key={dow}
                        type="button"
                        onClick={() => setSchedule(i, { day_of_week: dow })}
                        aria-label={`Día ${lbl}`}
                        aria-pressed={active}
                        className={cn(
                          'v2-focus flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-s)] text-[11.5px] font-bold transition-colors',
                          active
                            ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                            : 'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
                        )}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => removeSchedule(i)}
                  aria-label="Quitar ocurrencia"
                  className="v2-focus ml-auto flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-danger)] hover:text-[color:var(--v2-danger)]"
                >
                  <MIcon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[11px] leading-snug text-[color:var(--v2-faint)]">
          Repite un test en varias semanas (re-tests) añadiendo más filas. La semana 1 es la primera del plan del atleta.
        </p>
      </div>
    </SidePanel>
  );
}
