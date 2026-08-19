'use client';

// RestDayPanel — the DESCANSO state of the day editor (#47). A deliberate rest day
// (kind='rest') with OPTIONAL recovery suggestions — a SOFT coach offer, not a
// session: no intensity/load, doesn't count for adherence. The coach adds/removes
// activities from the typed recoveryActivitySchema; each carries an optional
// duration (min) and a short note. Max 8. Persists via serializeDay (rest-only).

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import {
  RECOVERY_ACTIVITY_LABEL,
  RECOVERY_ACTIVITY_ORDER,
} from '@/lib/dashboard/v2/editor-types';
import type {
  RecoveryActivity,
  RecoverySuggestion,
} from '@fahybrid/shared/schema/program-templates';

// Mirrors recoverySuggestionSchema.max(8) — the coach can offer a handful of
// recovery options, not a program. Named so the cap isn't a scattered literal.
const MAX_RECOVERY = 8;
const MAX_DURATION_MIN = 240;

// Rebuild a suggestion cleanly (omit empty duration/note) so state never carries
// an empty string / 0 that would round-trip as noise.
function buildSuggestion(
  activity: RecoveryActivity,
  duration_min: number | undefined,
  note: string | undefined,
): RecoverySuggestion {
  const s: RecoverySuggestion = { activity };
  if (duration_min !== undefined && duration_min > 0) s.duration_min = duration_min;
  if (note !== undefined && note.trim() !== '') s.note = note;
  return s;
}

export function RestDayPanel({
  recovery,
  onChange,
}: {
  recovery: RecoverySuggestion[];
  onChange: (next: RecoverySuggestion[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  // Which chip's inline editor (duration + note) is open; one at a time.
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // Dedupe by activity — one entry per activity keeps the offer scannable.
  const used = new Set(recovery.map((r) => r.activity));
  const addable = RECOVERY_ACTIVITY_ORDER.filter((a) => !used.has(a));
  const atMax = recovery.length >= MAX_RECOVERY;

  const addActivity = (activity: RecoveryActivity) => {
    if (atMax) return;
    onChange([...recovery, { activity }]);
    setAdding(false);
  };
  const removeAt = (idx: number) => {
    onChange(recovery.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  };
  const setDuration = (idx: number, raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    const min = Number.isFinite(parsed) && parsed > 0 ? Math.min(MAX_DURATION_MIN, parsed) : undefined;
    const r = recovery[idx]!;
    onChange(recovery.map((s, i) => (i === idx ? buildSuggestion(r.activity, min, r.note) : s)));
  };
  const setNote = (idx: number, raw: string) => {
    const r = recovery[idx]!;
    onChange(
      recovery.map((s, i) => (i === idx ? buildSuggestion(r.activity, r.duration_min, raw) : s)),
    );
  };

  const okDotStyle = { background: 'var(--v2-ok)' } as const;
  const okChipStyle = {
    background: 'color-mix(in srgb, var(--v2-ok) 13%, transparent)',
    borderColor: 'color-mix(in srgb, var(--v2-ok) 45%, transparent)',
  } as const;

  return (
    <div className="rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-5 py-6">
      {/* Header — this is a deliberate rest day, not an empty one. */}
      <div className="flex flex-col items-center gap-1.5 text-center">
        <div className="flex items-center gap-2">
          <MIcon name="bedtime" size={20} className="text-[color:var(--v2-accent)]" />
          <span className="v2-display text-lg text-[color:var(--v2-fg)]">Día de descanso</span>
        </div>
        <p className="max-w-[384px] text-xs text-[color:var(--v2-muted)]">
          Sugerencias de recuperación opcionales. Siguen siendo descanso.
        </p>
      </div>

      {/* Chips — one per recovery suggestion + the add affordance. */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {recovery.map((r, idx) => {
          const open = editingIdx === idx;
          return (
            <span
              key={`${r.activity}-${idx}`}
              className="inline-flex items-center gap-1.5 rounded-[var(--v2-r-pill)] border px-2.5 py-1 text-xs font-semibold text-[color:var(--v2-fg)]"
              style={okChipStyle}
            >
              <span aria-hidden className="h-2 w-2 rounded-full" style={okDotStyle} />
              <button
                type="button"
                onClick={() => setEditingIdx(open ? null : idx)}
                aria-expanded={open}
                className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)]"
              >
                {RECOVERY_ACTIVITY_LABEL[r.activity]}
                {r.duration_min ? (
                  <span className="v2-num text-[color:var(--v2-muted)]">· {r.duration_min}′</span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                aria-label={`Quitar ${RECOVERY_ACTIVITY_LABEL[r.activity]}`}
                className="v2-focus -mr-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface)] hover:text-[color:var(--v2-fg)]"
              >
                <MIcon name="close" size={13} />
              </button>
            </span>
          );
        })}

        {addable.length > 0 && !atMax ? (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] border border-dashed border-[color:var(--v2-border)] px-2.5 py-1 text-xs font-semibold text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="add" size={14} />
            Añadir
          </button>
        ) : null}
      </div>

      {/* Add menu — the still-available activities (deduped). */}
      {adding && addable.length > 0 ? (
        <div className="mx-auto mt-3 flex max-w-[448px] flex-wrap justify-center gap-1.5">
          {addable.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => addActivity(a)}
              className="v2-focus rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2.5 py-1 text-xs font-medium text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
            >
              {RECOVERY_ACTIVITY_LABEL[a]}
            </button>
          ))}
        </div>
      ) : null}

      {/* Inline editor for the open chip — optional duration + short note. */}
      {editingIdx !== null && recovery[editingIdx] ? (
        <div className="mx-auto mt-4 flex max-w-[448px] flex-col gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3">
          <span className="text-label font-semibold text-[color:var(--v2-muted)]">
            {RECOVERY_ACTIVITY_LABEL[recovery[editingIdx]!.activity]}
          </span>
          <label className="flex items-center gap-2 text-xs text-[color:var(--v2-muted)]">
            <span className="w-16 shrink-0">Duración</span>
            <input
              type="number"
              min={1}
              max={MAX_DURATION_MIN}
              inputMode="numeric"
              value={recovery[editingIdx]!.duration_min ?? ''}
              onChange={(e) => setDuration(editingIdx, e.target.value)}
              placeholder="opcional"
              className="v2-focus w-24 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2 py-1 text-body text-[color:var(--v2-fg)]"
            />
            <span className="text-[color:var(--v2-faint)]">min</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-[color:var(--v2-muted)]">
            <span className="w-16 shrink-0">Nota</span>
            <input
              type="text"
              maxLength={300}
              value={recovery[editingIdx]!.note ?? ''}
              onChange={(e) => setNote(editingIdx, e.target.value)}
              placeholder="p. ej. cuádriceps e isquios · ritmo cómodo"
              className="v2-focus min-w-0 flex-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2 py-1 text-body text-[color:var(--v2-fg)]"
            />
          </label>
        </div>
      ) : null}

      <p className="mt-5 text-center text-eyebrow uppercase tracking-[0.12em] text-[color:var(--v2-faint)]">
        Sin carga · no cuenta como sesión
      </p>
    </div>
  );
}
