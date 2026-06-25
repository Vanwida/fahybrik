'use client';

// WeekSettingsDisclosure — "Ajustes de semana" (spec §3b). Las semanas HEREDAN
// nivel / fase / objetivo del microciclo; el override por semana es la
// excepción y vive colapsado tras este disclosure (herencia = lo normal,
// override = invisible por defecto). El nombre de la semana NO se edita:
// las semanas se auto-etiquetan "Semana 1…4 (+deload)".

import { useEffect, useRef, useState } from 'react';
import { ATR_PHASE_LABEL, ATR_PHASE_ORDER } from '@/lib/dashboard/constants/atr-phases';
import {
  PROGRAM_LEVELS,
  PROGRAM_LEVEL_LABELS,
  type ProgramLevel,
} from '@/lib/dashboard/constants/program-levels';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

/** Campos por-semana que admiten override (el nombre queda fuera a propósito). */
export interface WeekMetaPatch {
  level?: string;
  atr_block_hint?: string | null;
  focus?: string | null;
  coach_notes?: string | null;
}

interface WeekSettingsDisclosureProps {
  /** Valores EFECTIVOS de la semana activa (overrides ya aplicados). */
  week: {
    level: string;
    atr_block_hint: string | null;
    focus: string | null;
    coach_notes: string | null;
  };
  /** Metadatos del microciclo de los que la semana hereda. */
  month: { level: string; atr_block_hint: string | null };
  weekLabel: string;
  onPatch: (patch: WeekMetaPatch) => void;
  /** Persiste la semana (save del studio: meta + slots). Fresco en cada render. */
  requestSave: () => void;
}

// Espera tras el último cambio antes de persistir el override.
const SAVE_DEBOUNCE_MS = 600;

const FIELD_CLASS =
  'focus-ring mt-1 w-full rounded-[var(--r-s)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-2.5 py-1.5 text-xs text-[color:var(--fg)] outline-none focus:border-[color:var(--accent)]';

export function WeekSettingsDisclosure({
  week,
  month,
  weekLabel,
  onPatch,
  requestSave,
}: WeekSettingsDisclosureProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Cierre con Escape / click fuera (mismo patrón que el resto de popovers).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // "Latest ref" del save para que el debounce dispare siempre el closure más
  // reciente del studio (con los overrides ya mergeados en la prop `week`).
  const saveRef = useRef(requestSave);
  useEffect(() => {
    saveRef.current = requestSave;
  }, [requestSave]);

  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      // Flush al desmontar: un override pendiente no se pierde.
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        saveRef.current();
      }
    };
  }, []);

  const change = (patch: WeekMetaPatch) => {
    onPatch(patch);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      saveRef.current();
    }, SAVE_DEBOUNCE_MS);
  };

  // Flush en blur (patrón F2): persiste el override pendiente ANTES de que el
  // coach navegue a otra semana, con el closure de save aún apuntando a ESTA.
  const flushNow = () => {
    if (!timerRef.current) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
    saveRef.current();
  };

  const overrides = [
    week.level !== month.level,
    (week.atr_block_hint ?? null) !== (month.atr_block_hint ?? null),
    Boolean(week.focus?.trim()),
    Boolean(week.coach_notes?.trim()),
  ].filter(Boolean).length;

  return (
    <div ref={rootRef} className="relative ml-auto shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="week-settings-panel"
        title={`Ajustes de ${weekLabel}`}
        className={cn(
          'focus-ring inline-flex items-center gap-1.5 rounded-[var(--r-pill)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors',
          open || overrides > 0
            ? 'text-[color:var(--fg)]'
            : 'text-[color:var(--text-muted)] hover:text-[color:var(--fg)]',
        )}
      >
        <MIcon name="tune" size={14} aria-hidden />
        Ajustes de semana
        {overrides > 0 ? (
          <span className="metric-num rounded-[var(--r-pill)] bg-[color:var(--accent)]/12 px-1.5 text-[10px] text-[color:var(--accent)]">
            {overrides}
          </span>
        ) : null}
        <MIcon name={open ? 'expand_less' : 'expand_more'} size={14} aria-hidden />
      </button>

      {open ? (
        <div
          id="week-settings-panel"
          className="absolute right-0 top-full z-30 mt-1 w-80 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] p-3 shadow-xl"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            {weekLabel} — overrides
          </p>
          <p className="mt-1 text-[11px] leading-snug text-[color:var(--text-muted)]">
            Esta semana hereda nivel, fase y objetivo del microciclo. Solo
            ajusta aquí lo que deba diferir.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="micro-label">Nivel</span>
              <select
                value={week.level}
                onChange={(e) => change({ level: e.target.value })}
                onBlur={flushNow}
                aria-label="Nivel de la semana"
                className={FIELD_CLASS}
              >
                {PROGRAM_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {PROGRAM_LEVEL_LABELS[l as ProgramLevel]}
                    {l === month.level ? ' · heredado' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="micro-label">Fase ATR</span>
              <select
                value={week.atr_block_hint ?? ''}
                onChange={(e) => change({ atr_block_hint: e.target.value || null })}
                onBlur={flushNow}
                aria-label="Fase ATR de la semana"
                className={FIELD_CLASS}
              >
                <option value="">
                  Sin fase{month.atr_block_hint == null ? ' · heredado' : ''}
                </option>
                {ATR_PHASE_ORDER.map((key) => (
                  <option key={key} value={key}>
                    {ATR_PHASE_LABEL[key]} ({key})
                    {key === month.atr_block_hint ? ' · heredado' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-2 block">
            <span className="micro-label">Objetivo de la semana</span>
            <input
              type="text"
              value={week.focus ?? ''}
              onChange={(e) => change({ focus: e.target.value || null })}
              onBlur={flushNow}
              placeholder="Hereda el objetivo del microciclo"
              aria-label="Objetivo de la semana"
              className={FIELD_CLASS}
            />
          </label>

          <label className="mt-2 block">
            <span className="micro-label">Notas del coach</span>
            <textarea
              value={week.coach_notes ?? ''}
              onChange={(e) => change({ coach_notes: e.target.value || null })}
              onBlur={flushNow}
              rows={2}
              placeholder="Solo para esta semana"
              aria-label="Notas del coach para la semana"
              className={cn(FIELD_CLASS, 'resize-none')}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
