'use client';

import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import { resolvePhase } from '@/lib/dashboard/coach/resolve-phase';
import { PROGRAM_LEVEL_LABELS, type ProgramLevel } from '@/lib/dashboard/constants/program-levels';
import { MIcon } from '@/components/dashboard/MIcon';
import {
  initials,
  mondayOptionLabel,
  type AssignFlowAthleteOption,
  type AssignFlowMonthOption,
} from '@/components/dashboard/assign-flow/helpers';

// =============================================================================
// AssignFlow · zona 1 — campos de selección (PHASE 3, modelo del fundador).
// Atleta (chip bloqueado si viene preseleccionado de la ficha), BLOQUE y lunes
// de inicio (el picker SOLO ofrece lunes, por construcción). Vocabulario del
// fundador: "bloque", nunca "microciclo".
// =============================================================================

const FIELD_CONTROL_CLASS =
  'focus-ring min-h-[52px] w-full rounded-[var(--r-m)] border border-[color:var(--hairline)] bg-[color:var(--bg)] px-3 py-2 text-sm text-[color:var(--fg)]';

export function AthleteField({
  locked,
  options,
  value,
  onChange,
}: {
  locked: AssignFlowAthleteOption | null;
  options: AssignFlowAthleteOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid content-start gap-2">
      <span className="micro-label" id="assign-flow-athlete-label">
        Atleta
      </span>
      {locked ? (
        <div
          aria-labelledby="assign-flow-athlete-label"
          className="flex min-h-[52px] items-center gap-3 rounded-[var(--r-m)] border border-[color:var(--hairline)] bg-[color:var(--bg)] px-3 py-2"
        >
          <span
            aria-hidden
            className="font-display grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-pill)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_16%,transparent)] text-xs font-extrabold italic text-[color:var(--accent)]"
          >
            {initials(locked.full_name)}
          </span>
          <span className="truncate text-sm font-semibold">{locked.full_name}</span>
          <span className="ml-auto shrink-0 rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
            Desde ficha
          </span>
        </div>
      ) : (
        <select
          aria-labelledby="assign-flow-athlete-label"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={FIELD_CONTROL_CLASS}
        >
          <option value="">Elige atleta…</option>
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.full_name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function MonthField({
  options,
  value,
  selected,
  coachPhases = [],
  onChange,
}: {
  options: AssignFlowMonthOption[];
  value: string;
  selected: AssignFlowMonthOption | null;
  /** Fases del coach (0052) — para el nombre de fase; [] → ATR legacy. */
  coachPhases?: ReadonlyArray<MethodologyPhase>;
  onChange: (v: string) => void;
}) {
  const meta = selected
    ? [
        `${selected.week_count} ${selected.week_count === 1 ? 'semana' : 'semanas'}`,
        selected.atr_block_hint
          ? `fase ${resolvePhase({ type: selected.atr_block_hint }, coachPhases).label}`
          : null,
        `nivel ${PROGRAM_LEVEL_LABELS[selected.level as ProgramLevel] ?? selected.level}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <div className="grid content-start gap-2">
      <span className="micro-label" id="assign-flow-month-label">
        Bloque
      </span>
      <select
        aria-labelledby="assign-flow-month-label"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={FIELD_CONTROL_CLASS}
      >
        <option value="">Elige bloque…</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {meta ? <p className="text-[11px] text-[color:var(--text-muted)]">{meta}</p> : null}
    </div>
  );
}

export function StartDateField({
  mondays,
  todayIso,
  value,
  onChange,
}: {
  mondays: string[];
  todayIso: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid content-start gap-2">
      <span className="micro-label" id="assign-flow-date-label">
        Empieza el
      </span>
      <select
        aria-labelledby="assign-flow-date-label"
        aria-describedby="assign-flow-date-help"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={FIELD_CONTROL_CLASS}
      >
        {mondays.map((iso) => (
          <option key={iso} value={iso}>
            {mondayOptionLabel(iso, todayIso)}
          </option>
        ))}
      </select>
      <p
        id="assign-flow-date-help"
        className="flex items-center gap-1 text-[11px] text-[color:var(--text-muted)]"
      >
        <MIcon name="info" size={13} />
        Solo lunes — la semana del atleta empieza en lunes.
      </p>
    </div>
  );
}
