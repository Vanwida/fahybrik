'use client';

// RegistrarResultadoForm — the coach-side "registrar resultado" form that FEEDS
// the zone calculator. The coach picks a test TYPE (modality + unit auto-set from
// the closed TEST_TYPES vocabulary), enters the athlete's result pace (m:ss), and
// POSTs to /api/coach/athletes/[id]/test-result. The endpoint resolves the bands
// against the coach's methodology_zones and stores a versioned profile; on success
// we refresh so the calculator re-renders from the freshly stored snapshot (never
// recomputed client-side). Objective effort is always RPE 10 — shown, not asked.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { ClockCell } from '@/components/v2/editor/fields';
import {
  TEST_TYPES,
  TEST_TYPES_BY_SLUG,
  DEFAULT_TEST_TYPE_SLUG,
  TEST_TARGET_RPE,
  getTestType,
} from '@fahybrid/shared/domain/methodology';
import { MODALITY_LABEL, paceUnitLabel } from '@/lib/dashboard/v2/zone-view';
import { cn } from '@/lib/utils';

export function RegistrarResultadoForm({
  athleteId,
  onDone,
}: {
  athleteId: string;
  /** Called after a successful save (e.g. to close the form). */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState<string>(DEFAULT_TEST_TYPE_SLUG);
  const [thresholdS, setThresholdS] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testType = getTestType(slug) ?? TEST_TYPES_BY_SLUG[DEFAULT_TEST_TYPE_SLUG];
  const unit = testType.pace_unit;

  const save = async () => {
    if (thresholdS == null || thresholdS <= 0) {
      setError('Introduce el ritmo del test (m:ss).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/test-result`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modality: testType.modality,
          threshold_s: thresholdS,
          source_test_slug: testType.slug,
        }),
      });
      if (!res.ok) {
        setError(
          res.status === 409
            ? 'El modelo de zonas del coach no está completo.'
            : 'No se pudo registrar el resultado · Reintenta.',
        );
        setSaving(false);
        return;
      }
      setThresholdS(null);
      router.refresh();
      onDone?.();
    } catch {
      setError('No se pudo registrar el resultado · Reintenta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4 shadow-[var(--v2-shadow-card)]">
      <div className="mb-3 flex items-center gap-2.5 border-b border-[color:var(--v2-border)] pb-3">
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]"
        >
          <MIcon name="speed" size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[color:var(--v2-fg)]">Registrar resultado de test</p>
          <p className="text-label text-[color:var(--v2-muted)]">
            Esfuerzo máximo · calcula las 6 zonas y alimenta los ritmos del plan
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_1fr_0.9fr]">
        {/* Test type — modality + unit derive from it */}
        <label className="block min-w-0 space-y-1.5">
          <span className="v2-micro">Tipo de test</span>
          <select
            aria-label="Tipo de test"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="v2-focus w-full appearance-none rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2 py-1.5 text-sm font-semibold text-[color:var(--v2-fg)] outline-none focus:border-[color:var(--v2-border-strong)]"
          >
            {TEST_TYPES.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {/* Modality (auto) */}
        <div className="min-w-0 space-y-1.5">
          <span className="v2-micro">Modalidad</span>
          <div
            className="flex min-h-[34px] items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2 py-1.5 text-sm font-semibold"
            style={{
              color: `var(--v2-mod-${testType.modality === 'run' ? 'carrera' : 'ergo'})`,
            }}
          >
            {MODALITY_LABEL[testType.modality]}
          </div>
        </div>

        {/* Result pace */}
        <label className="block min-w-0 space-y-1.5">
          <span className="v2-micro">Resultado</span>
          <div className="flex items-center gap-1">
            <ClockCell
              seconds={thresholdS}
              ariaLabel="Ritmo del test (m:ss)"
              className="flex-1"
              onChange={setThresholdS}
            />
            <span className="shrink-0 text-label font-semibold text-[color:var(--v2-muted)]">
              {paceUnitLabel(unit)}
            </span>
          </div>
        </label>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2">
        <MIcon name="info" size={14} className="shrink-0 text-[color:var(--v2-accent)]" />
        <p className="text-label leading-snug text-[color:var(--v2-muted)]">
          {testType.protocol} · objetivo{' '}
          <b className="v2-num text-[color:var(--v2-accent)]">RPE {TEST_TARGET_RPE}</b>. El cálculo
          (ritmo → 6 zonas) lo aplica tu modelo de zonas, no a ojo.
        </p>
      </div>

      {error ? (
        <p className="mt-2.5 text-xs font-medium text-[color:var(--v2-danger)]">{error}</p>
      ) : null}

      <div className="mt-3 flex items-center justify-end gap-2">
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            className="v2-focus rounded-[var(--v2-r-s)] px-3 py-1.5 text-xs font-bold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            Cancelar
          </button>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={cn(
            'v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] px-3.5 py-1.5 text-xs font-bold transition-colors',
            'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]',
            saving && 'opacity-60',
          )}
        >
          <MIcon name={saving ? 'hourglass_empty' : 'check'} size={15} />
          {saving ? 'Guardando…' : 'Registrar'}
        </button>
      </div>
    </div>
  );
}
