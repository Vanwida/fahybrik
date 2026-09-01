'use client';

// DoublesPairsPanel — coach surface to LINK two athletes into a HYROX Dobles
// pair and ASSIGN one plan to both. Lives above the roster table in /v2/atletas.
//
// Three real backend calls, no stubs:
//   · POST   /api/coach/doubles/pairs                       → link two athletes
//   · POST   /api/coach/doubles/pairs/{id}/assign-sequence  → materialize for BOTH
//   · DELETE /api/coach/doubles/pairs/{id}                  → dissolve
// The pair drives the SAME per-athlete pipeline as an individual assign; each
// athlete gets the plan at their own intensity. Empty/error states are honest.

import { useId, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Select, type SelectOption } from '@/components/ui/select';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { CoachGuidanceEditor } from '@/components/v2/atletas/CoachGuidanceEditor';
import { DoblesSimulationEditor } from '@/components/v2/atletas/DoblesSimulationEditor';
import { Pill } from '@/components/v2/Pill';
import { cn } from '@/lib/utils';
import type { AthleteRow } from '@/lib/dashboard/athletes/list';
import type { DoublesPair } from '@/lib/dashboard/coach/doubles-pairs';

const BTN_BASE =
  'v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] px-2.5 text-xs font-semibold transition-colors disabled:opacity-50';

function cellLabel(pair: DoublesPair): string {
  const lvl = pair.level_name ?? 'sin nivel';
  const days = pair.training_days_per_week ? `${pair.training_days_per_week} días` : 'sin días';
  return `${lvl} · ${days}`;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'No se pudo completar la acción.';
  } catch {
    return 'No se pudo completar la acción.';
  }
}

// ── One pair row: both athletes + assign / dissolve ─────────────────────────────

function PairRow({ pair }: { pair: DoublesPair }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'assign' | 'dissolve'>(null);
  const [error, setError] = useState<string | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [, startTransition] = useTransition();

  const bothHavePlan = pair.athlete_a.has_active_plan && pair.athlete_b.has_active_plan;

  async function assign() {
    setBusy('assign');
    setError(null);
    try {
      const res = await fetch(`/api/coach/doubles/pairs/${pair.id}/assign-sequence`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError('Error de red al asignar el plan.');
    } finally {
      setBusy(null);
    }
  }

  async function dissolve() {
    setBusy('dissolve');
    setError(null);
    try {
      const res = await fetch(`/api/coach/doubles/pairs/${pair.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError('Error de red al deshacer la pareja.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Both athletes */}
        <div className="flex min-w-0 items-center gap-2">
          <AthleteAvatar name={pair.athlete_a.full_name} size="sm" />
          <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
            {pair.athlete_a.full_name}
          </span>
          <MIcon name="link" size={15} className="text-[color:var(--v2-accent-text)]" />
          <AthleteAvatar name={pair.athlete_b.full_name} size="sm" />
          <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
            {pair.athlete_b.full_name}
          </span>
        </div>

        <Pill tone="neutral" variant="soft">
          {cellLabel(pair)}
        </Pill>
        {bothHavePlan ? (
          <Pill tone="ok" variant="soft">
            plan activo
          </Pill>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {/* Reparto — author the pair's HYROX simulation (who does each station).
              What the coach saves drives each athlete's sim session (phone + watch). */}
          <button
            type="button"
            onClick={() => setSimOpen(true)}
            disabled={busy !== null}
            className={cn(
              BTN_BASE,
              'border border-[color:var(--v2-border)] text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
            )}
          >
            <MIcon name="tune" size={15} />
            Reparto
          </button>
          <button
            type="button"
            onClick={assign}
            disabled={busy !== null}
            className={cn(
              BTN_BASE,
              'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]',
            )}
          >
            <MIcon name="calendar_add_on" size={15} />
            {busy === 'assign' ? 'Asignando…' : bothHavePlan ? 'Reasignar plan' : 'Asignar plan'}
          </button>
          <button
            type="button"
            onClick={dissolve}
            disabled={busy !== null}
            className={cn(
              BTN_BASE,
              'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            {busy === 'dissolve' ? 'Deshaciendo…' : 'Deshacer'}
          </button>
        </div>
      </div>
      {error ? (
        <p className="text-xs font-medium text-[color:var(--v2-danger)]">{error}</p>
      ) : null}

      {simOpen ? (
        <DoblesSimulationEditor
          athleteId={String(pair.athlete_a.athlete_id)}
          onClose={() => setSimOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ── Create-pair modal: pick two unpaired athletes ───────────────────────────────

function LinkPairModal({
  candidates,
  onClose,
}: {
  candidates: AthleteRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const canSubmit = aId !== '' && bId !== '' && aId !== bId && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/coach/doubles/pairs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ athlete_a_id: Number(aId), athlete_b_id: Number(bId) }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      startTransition(() => router.refresh());
      onClose();
    } catch {
      setError('Error de red al vincular la pareja.');
    } finally {
      setSubmitting(false);
    }
  }

  function optionLabel(a: AthleteRow): string {
    return a.level_name ? `${a.full_name} · ${a.level_name}` : a.full_name;
  }

  // Un atleta no se empareja consigo mismo: cada lista esconde al elegido en la
  // otra. Antes esto se hacía con un `.filter()` sobre los `<option>`.
  function optionsExcluding(excludedId: string): SelectOption<string>[] {
    return candidates
      .filter((c) => c.athlete_id !== excludedId)
      .map((c) => ({ value: c.athlete_id, label: optionLabel(c) }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--v2-scrim)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Vincular pareja"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-bg)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">Vincular pareja</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus rounded-full p-1 text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={18} />
          </button>
        </div>
        <p className="mb-4 text-body text-[color:var(--v2-muted)]">
          Dos atletas que entrenan el mismo plan. Si tienen distinto nivel o días, alinéalos
          antes. Si a uno le falta el nivel o los días, se copian del otro.
        </p>

        {candidates.length < 2 ? (
          <p className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3 text-body text-[color:var(--v2-muted)]">
            Necesitas al menos dos atletas sin pareja para vincular.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {/* El disparador es un `<button>`, no un `<select>`, así que el
                nombre accesible se ata a mano al rótulo que ya está en pantalla
                en vez de quedar al azar del `<label>` que los envolvía. */}
            <div className="flex flex-col gap-1.5">
              <span id={`${fieldId}-a`} className="text-xs font-semibold text-[color:var(--v2-muted)]">
                Atleta 1
              </span>
              <Select
                aria-labelledby={`${fieldId}-a`}
                size="lg"
                items={optionsExcluding(bId)}
                value={aId || null}
                onValueChange={setAId}
                placeholder="Elegir atleta…"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span id={`${fieldId}-b`} className="text-xs font-semibold text-[color:var(--v2-muted)]">
                Atleta 2
              </span>
              <Select
                aria-labelledby={`${fieldId}-b`}
                size="lg"
                items={optionsExcluding(aId)}
                value={bId || null}
                onValueChange={setBId}
                placeholder="Elegir atleta…"
              />
            </div>

            {error ? (
              <p className="text-xs font-medium text-[color:var(--v2-danger)]">{error}</p>
            ) : null}

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className={cn(
                BTN_BASE,
                'mt-1 h-10 justify-center bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]',
              )}
            >
              {submitting ? 'Vinculando…' : 'Vincular en pareja'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────────

export function DoublesPairsPanel({
  pairs,
  athletes,
}: {
  pairs: DoublesPair[];
  athletes: AthleteRow[];
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);

  // Athletes already in an active pair can't be picked again.
  const pairedIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of pairs) {
      s.add(String(p.athlete_a.athlete_id));
      s.add(String(p.athlete_b.athlete_id));
    }
    return s;
  }, [pairs]);

  const candidates = useMemo(
    () => athletes.filter((a) => !pairedIds.has(a.athlete_id)),
    [athletes, pairedIds],
  );

  return (
    <section className="flex flex-col gap-2 rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-bg)] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MIcon name="groups" size={18} className="text-[color:var(--v2-accent-text)]" />
          <h2 className="text-sm font-semibold text-[color:var(--v2-fg)]">
            Dobles
            <span className="text-[color:var(--v2-muted)]"> · {pairs.length}</span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Consejos — coach-global tactical tips for the doubles race board +
              simulation. Not per-pair, so it lives here in the panel header. */}
          <button
            type="button"
            onClick={() => setGuidanceOpen(true)}
            className={cn(
              BTN_BASE,
              'border border-[color:var(--v2-border)] text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
            )}
          >
            <MIcon name="tips_and_updates" size={15} />
            Consejos de dobles
          </button>
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className={cn(
              BTN_BASE,
              'border border-[color:var(--v2-border)] text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
            )}
          >
            <MIcon name="link" size={15} />
            Vincular pareja
          </button>
        </div>
      </div>

      {pairs.length === 0 ? (
        <p className="px-1 py-2 text-body text-[color:var(--v2-muted)]">
          Aún no hay parejas. Vincula dos atletas que entrenen el mismo plan.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {pairs.map((p) => (
            <PairRow key={p.id} pair={p} />
          ))}
        </div>
      )}

      {linkOpen ? (
        <LinkPairModal candidates={candidates} onClose={() => setLinkOpen(false)} />
      ) : null}

      {guidanceOpen ? <CoachGuidanceEditor onClose={() => setGuidanceOpen(false)} /> : null}
    </section>
  );
}
