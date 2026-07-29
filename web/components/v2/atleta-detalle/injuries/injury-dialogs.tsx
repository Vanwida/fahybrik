'use client';

// The coach injury dialogs (#16): register an episode, add an evolution / transition
// its status, adapt scheduled sessions, and (for a severe / long layoff) suggest a
// plan pause. Every dialog reuses the #13 lifecycle dialog chrome + field primitives
// so injuries and lifecycle read identically; the pause dialog reuses the #13 pause
// MUTATION itself (useLifecycleMutation) — it never re-implements pausing.

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import {
  INJURY_ZONES,
  INJURY_ZONE_LABEL,
  INJURY_SEVERITIES,
  INJURY_SEVERITY_LABEL,
  INJURY_ADAPTATIONS,
  type InjuryStatus,
  type InjurySeverity,
  type InjuryZone,
  type InjuryAdaptation,
} from '@fahybrid/shared/domain/coach/injury-taxonomy';
import type { InjuryDTO, InjuryUpdateInput } from '@fahybrid/shared/schema/injuries';
import { LifecycleDialog } from '../lifecycle/LifecycleDialog';
import { useLifecycleMutation } from '../lifecycle/lifecycle-mutations';
import {
  DATE_INPUT_CLS,
  DialogError,
  DialogField,
  DialogGhostButton,
  DialogPrimaryButton,
  TEXTAREA_CLS,
  todayIsoLocal,
} from '../lifecycle/lifecycle-ui';
import { statusMeta } from './injury-presentation';

const NOTE_MAX = 2000;
const TYPE_MAX = 120;

interface MutationResult {
  ok: boolean;
  error: string | null;
}

// Adaptation kinds → coach-facing copy + the adherence consequence (the value of #16).
const ADAPTATION_META: Record<InjuryAdaptation, { label: string; hint: string }> = {
  substituted: { label: 'Sustituida', hint: 'Cambio a rehab — cuenta al hacerla' },
  softened: { label: 'Suavizada', hint: 'Menos volumen o intensidad — cuenta' },
  rest: { label: 'Reposo', hint: 'Día excluido — no cuenta como fallo' },
};

const TEXT_INPUT_CLS =
  'v2-focus h-10 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]';

// ── Single-select chip group (zones, severity) ────────────────────────────────────
function ChipGroup<T extends string>({
  options,
  value,
  labelFor,
  onChange,
  disabled,
}: {
  options: readonly T[];
  value: T | null;
  labelFor: (v: T) => string;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o === value;
        return (
          <button
            key={o}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(o)}
            className={cn(
              'v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] border px-3 text-xs font-semibold transition-colors disabled:opacity-50',
              active
                ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]'
                : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            {labelFor(o)}
          </button>
        );
      })}
    </div>
  );
}

// ══ Register a new injury (coach) ════════════════════════════════════════════════
export function RegisterInjuryDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    zone: InjuryZone;
    severity: InjurySeverity;
    type?: string | null;
    onset_date?: string;
    note?: string | null;
  }) => Promise<MutationResult>;
}) {
  const [zone, setZone] = useState<InjuryZone | null>(null);
  const [severity, setSeverity] = useState<InjurySeverity>('leve');
  const [type, setType] = useState('');
  const [onset, setOnset] = useState(todayIsoLocal());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!zone || busy) return;
    setBusy(true);
    setError(null);
    const res = await onSubmit({
      zone,
      severity,
      type: type.trim() || null,
      onset_date: onset || undefined,
      note: note.trim() || null,
    });
    if (res.ok) onClose();
    else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <LifecycleDialog
      title="Registrar lesión"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <DialogGhostButton onClick={onClose} disabled={busy}>
            Cancelar
          </DialogGhostButton>
          <DialogPrimaryButton
            onClick={confirm}
            disabled={!zone}
            busy={busy}
            icon="add"
            label="Registrar"
          />
        </>
      }
    >
      <DialogField label="Zona" required>
        <ChipGroup
          options={INJURY_ZONES}
          value={zone}
          labelFor={(z) => INJURY_ZONE_LABEL[z]}
          onChange={setZone}
          disabled={busy}
        />
      </DialogField>
      <DialogField label="Gravedad" required>
        <ChipGroup
          options={INJURY_SEVERITIES}
          value={severity}
          labelFor={(s) => INJURY_SEVERITY_LABEL[s]}
          onChange={setSeverity}
          disabled={busy}
        />
      </DialogField>
      <DialogField label="Tipo" hint="opcional">
        <input
          type="text"
          value={type}
          maxLength={TYPE_MAX}
          disabled={busy}
          onChange={(e) => setType(e.target.value)}
          placeholder="p. ej. tendinitis rotuliana"
          className={TEXT_INPUT_CLS}
        />
      </DialogField>
      <DialogField label="Desde" hint="opcional">
        <input
          type="date"
          value={onset}
          max={todayIsoLocal()}
          disabled={busy}
          onChange={(e) => setOnset(e.target.value)}
          className={DATE_INPUT_CLS}
          aria-label="Fecha de inicio"
        />
      </DialogField>
      <DialogField label="Nota" hint="opcional">
        <textarea
          value={note}
          rows={2}
          maxLength={NOTE_MAX}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          placeholder="p. ej. molestia tras la tirada larga…"
          className={TEXTAREA_CLS}
        />
      </DialogField>
      {error ? <DialogError>{error}</DialogError> : null}
    </LifecycleDialog>
  );
}

// ══ Add evolution / transition status ════════════════════════════════════════════
// `target` null = a note-only evolution entry; otherwise a validated status change.
export function InjuryUpdateDialog({
  injury,
  target,
  onClose,
  onSubmit,
}: {
  injury: InjuryDTO;
  target: InjuryStatus | null;
  onClose: () => void;
  onSubmit: (input: InjuryUpdateInput) => Promise<MutationResult>;
}) {
  const [note, setNote] = useState('');
  const [expectedReturn, setExpectedReturn] = useState(injury.expected_return ?? '');
  const [resolvedDate, setResolvedDate] = useState(todayIsoLocal());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = target ? transitionLabel(target) : 'Añadir evolución';
  const showExpectedReturn = target === null || target === 'en_recuperacion';
  const showResolved = target === 'resuelta';
  // A note-only evolution needs at least the note (the server refine rejects an empty
  // update); a status change is always a valid change on its own.
  const canSubmit = target != null || note.trim().length > 0;

  async function confirm() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    const input: InjuryUpdateInput = {
      ...(target ? { status: target } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(showExpectedReturn && expectedReturn ? { expected_return: expectedReturn } : {}),
      ...(showResolved && resolvedDate ? { resolved_date: resolvedDate } : {}),
    };
    const res = await onSubmit(input);
    if (res.ok) onClose();
    else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <LifecycleDialog
      title={title}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <DialogGhostButton onClick={onClose} disabled={busy}>
            Cancelar
          </DialogGhostButton>
          <DialogPrimaryButton
            onClick={confirm}
            disabled={!canSubmit}
            busy={busy}
            icon={target ? 'check' : 'add_comment'}
            label={target ? 'Confirmar' : 'Guardar'}
          />
        </>
      }
    >
      {target ? (
        <p className="text-sm leading-relaxed text-[color:var(--v2-muted)]">
          {transitionHint(target)}
        </p>
      ) : null}
      {showResolved ? (
        <DialogField label="Fecha de alta" hint="opcional">
          <input
            type="date"
            value={resolvedDate}
            max={todayIsoLocal()}
            disabled={busy}
            onChange={(e) => setResolvedDate(e.target.value)}
            className={DATE_INPUT_CLS}
            aria-label="Fecha de alta"
          />
        </DialogField>
      ) : null}
      {showExpectedReturn ? (
        <DialogField label="Retorno estimado" hint="opcional">
          <input
            type="date"
            value={expectedReturn}
            min={todayIsoLocal()}
            disabled={busy}
            onChange={(e) => setExpectedReturn(e.target.value)}
            className={DATE_INPUT_CLS}
            aria-label="Retorno estimado"
          />
        </DialogField>
      ) : null}
      <DialogField label="Nota" hint={target ? 'opcional' : undefined} required={target === null}>
        <textarea
          value={note}
          rows={2}
          maxLength={NOTE_MAX}
          disabled={busy}
          autoFocus
          onChange={(e) => setNote(e.target.value)}
          placeholder="p. ej. molestia 2/5, bajando…"
          className={TEXTAREA_CLS}
        />
      </DialogField>
      {error ? <DialogError>{error}</DialogError> : null}
    </LifecycleDialog>
  );
}

function transitionLabel(to: InjuryStatus): string {
  if (to === 'resuelta') return 'Dar el alta';
  if (to === 'en_recuperacion') return 'Pasar a recuperación';
  // to activa (flare-up from en_recuperacion)
  return 'Reactivar la lesión';
}
function transitionHint(to: InjuryStatus): string {
  if (to === 'resuelta')
    return 'Cierras el episodio y lo pasas al histórico. Una recaída se registra como una lesión nueva.';
  if (to === 'en_recuperacion')
    return 'Retorno progresivo con cargas reducidas. Adapta las sesiones para acompañarlo.';
  return `Vuelves la lesión a ${statusMeta(to).label.toLowerCase()} — la molestia ha rebrotado.`;
}

// ══ Adapt scheduled sessions ═════════════════════════════════════════════════════
export interface AdaptableSession {
  assignment_id: string;
  iso_date: string;
  title: string;
  /** Date label already formatted for display, e.g. "lun 8 jul". */
  date_label: string;
}

export function AdaptSessionsDialog({
  sessions,
  onClose,
  onSubmit,
}: {
  sessions: AdaptableSession[];
  onClose: () => void;
  onSubmit: (
    adaptations: { assignment_id: number; adaptation: InjuryAdaptation }[],
  ) => Promise<MutationResult>;
}) {
  // assignment_id → chosen adaptation kind (absent = not selected).
  const [picked, setPicked] = useState<Record<string, InjuryAdaptation>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = Object.keys(picked).length;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = 'substituted';
      return next;
    });
  }
  function setKind(id: string, kind: InjuryAdaptation) {
    setPicked((prev) => ({ ...prev, [id]: kind }));
  }

  async function confirm() {
    if (selectedCount === 0 || busy) return;
    setBusy(true);
    setError(null);
    const adaptations = Object.entries(picked).map(([assignment_id, adaptation]) => ({
      assignment_id: Number(assignment_id),
      adaptation,
    }));
    const res = await onSubmit(adaptations);
    if (res.ok) onClose();
    else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <LifecycleDialog
      title="Adaptar sesiones"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <DialogGhostButton onClick={onClose} disabled={busy}>
            Cancelar
          </DialogGhostButton>
          <DialogPrimaryButton
            onClick={confirm}
            disabled={selectedCount === 0}
            busy={busy}
            icon="tune"
            label={selectedCount > 0 ? `Adaptar ${selectedCount}` : 'Adaptar'}
          />
        </>
      }
    >
      <p className="text-sm leading-relaxed text-[color:var(--v2-muted)]">
        Marca las sesiones que adaptas por esta lesión. Las de reposo se excluyen de la adherencia;
        las sustituidas o suavizadas cuentan al hacerlas. El atleta las verá etiquetadas en su plan.
      </p>
      {sessions.length === 0 ? (
        <p className="rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] px-3.5 py-4 text-center text-sm text-[color:var(--v2-faint)]">
          No hay sesiones próximas programadas para adaptar.
        </p>
      ) : (
        <div className="flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto">
          {sessions.map((s) => {
            const kind = picked[s.assignment_id];
            const on = kind != null;
            return (
              <div
                key={s.assignment_id}
                className={cn(
                  'rounded-[var(--v2-r-m)] border p-2.5 transition-colors',
                  on
                    ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)]'
                    : 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]',
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(s.assignment_id)}
                  disabled={busy}
                  aria-pressed={on}
                  className="v2-focus flex w-full items-center gap-2.5 text-left"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[var(--v2-r-2xs)] border',
                      on
                        ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                        : 'border-[color:var(--v2-border-strong)]',
                    )}
                  >
                    {on ? <MIcon name="check" size={13} /> : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-semibold text-[color:var(--v2-fg)]">
                      {s.title}
                    </span>
                    <span className="v2-num text-label text-[color:var(--v2-muted)]">
                      {s.date_label}
                    </span>
                  </span>
                </button>
                {on ? (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                    {INJURY_ADAPTATIONS.map((a) => {
                      const active = kind === a;
                      return (
                        <button
                          key={a}
                          type="button"
                          disabled={busy}
                          onClick={() => setKind(s.assignment_id, a)}
                          title={ADAPTATION_META[a].hint}
                          className={cn(
                            'v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-s)] border px-2.5 text-label font-semibold transition-colors disabled:opacity-50',
                            active
                              ? 'border-[color:var(--v2-fg)] bg-[color:var(--v2-surface)] text-[color:var(--v2-fg)]'
                              : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
                          )}
                        >
                          {ADAPTATION_META[a].label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {error ? <DialogError>{error}</DialogError> : null}
    </LifecycleDialog>
  );
}

// ══ Suggest a plan pause for the injury (links to the #13 pause flow) ═════════════
// Reuses the #13 pause MUTATION verbatim; it only pre-fills reason='lesion' and the
// planned return from the injury. Never automatic — the coach confirms here.
export function InjuryPauseDialog({
  athleteId,
  expectedReturn,
  onClose,
}: {
  athleteId: string;
  expectedReturn: string | null;
  onClose: () => void;
}) {
  const { mutate, busy, error } = useLifecycleMutation(athleteId);
  const [endDate, setEndDate] = useState(expectedReturn ?? '');
  const [note, setNote] = useState('');

  async function confirm() {
    const res = await mutate({
      action: 'pause',
      reason: 'lesion',
      ...(endDate ? { end_date: endDate } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    if (res) onClose();
  }

  return (
    <LifecycleDialog
      title="Pausar plan por lesión"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <DialogGhostButton onClick={onClose} disabled={busy}>
            Cancelar
          </DialogGhostButton>
          <DialogPrimaryButton
            onClick={confirm}
            busy={busy}
            icon="pause_circle"
            label="Pausar plan"
          />
        </>
      }
    >
      <p className="text-sm leading-relaxed text-[color:var(--v2-muted)]">
        Congela el plan mientras se recupera y excluye estos días de la adherencia. El motivo queda
        como lesión. Podrás reactivarlo cuando vuelva.
      </p>
      <DialogField label="Vuelve el" hint="opcional">
        <input
          type="date"
          value={endDate}
          min={todayIsoLocal()}
          disabled={busy}
          onChange={(e) => setEndDate(e.target.value)}
          className={DATE_INPUT_CLS}
          aria-label="Fecha de vuelta"
        />
      </DialogField>
      <DialogField label="Nota" hint="opcional">
        <textarea
          value={note}
          rows={2}
          maxLength={NOTE_MAX}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          placeholder="p. ej. retorno progresivo en 3 semanas…"
          className={TEXTAREA_CLS}
        />
      </DialogField>
      {error ? <DialogError>{error}</DialogError> : null}
    </LifecycleDialog>
  );
}
