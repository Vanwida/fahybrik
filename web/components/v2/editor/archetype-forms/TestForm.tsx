'use client';

// TestForm — the TEST archetype's light form (UX pase 2026-06-25 §2). The coach
// picks the test TYPE; the modality auto-sets from it, the objective is always
// RPE 10 (máximo), and an accent-toned note declares "almacena ritmo / zonas" — the
// line that makes the test a RESOLVER, not a log. The form edits ONE item's
// Prescription: picking a type reshapes the prescription (modality + measure +
// amount) via the test-template factory, so the persisted block round-trips back
// to its type with no extra metadata.
//
// The math (split → 6 zones) is objective + fixed by family (ergo→Concept2,
// run→VDOT) and is the coach's methodology DATA — NOT edited here. This form only
// authors WHICH test; the result is recorded later in the athlete's profile.

import type { Prescription } from '@fahybrid/shared/domain/prescription';
import {
  TEST_TYPES,
  TEST_TARGET_RPE,
} from '@fahybrid/shared/domain/methodology';
import { MIcon } from '@/components/ui/MIcon';
import { MODALITY_LABEL, paceUnitLabel } from '@/lib/dashboard/v2/zone-view';
import {
  testPrescription,
  testTypeFromPrescription,
} from '@/lib/dashboard/v2/test-template';
import { Field } from './form-controls';

export function TestForm({
  value,
  onChange,
}: {
  value: Prescription;
  onChange: (next: Prescription) => void;
}) {
  const testType = testTypeFromPrescription(value);
  const slug = testType?.slug ?? TEST_TYPES[0].slug;
  const modality = testType?.modality ?? TEST_TYPES[0].modality;
  const unit = testType?.pace_unit ?? TEST_TYPES[0].pace_unit;
  const protocol = testType?.protocol ?? '';

  const setType = (nextSlug: string) => {
    const t = TEST_TYPES.find((x) => x.slug === nextSlug);
    if (!t) return;
    onChange(testPrescription(t));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_1fr_0.9fr]">
        <Field label="Tipo de test">
          <select
            aria-label="Tipo de test"
            value={slug}
            onChange={(e) => setType(e.target.value)}
            className="v2-focus w-full appearance-none rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2 py-1.5 text-sm font-semibold text-[color:var(--v2-fg)] outline-none focus:border-[color:var(--v2-border-strong)]"
          >
            {TEST_TYPES.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Modalidad">
          <div
            className="flex min-h-[34px] items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2 py-1.5 text-sm font-semibold"
            style={{ color: `var(--v2-mod-${modality === 'run' ? 'carrera' : 'ergo'})` }}
          >
            {MODALITY_LABEL[modality]} · {paceUnitLabel(unit)}
          </div>
        </Field>

        <Field label="Esfuerzo">
          <div className="flex min-h-[34px] items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2 py-1.5">
            <span className="v2-num text-sm font-bold text-[color:var(--v2-accent)]">
              RPE {TEST_TARGET_RPE}
            </span>
          </div>
        </Field>
      </div>

      {/* Protocol descriptor */}
      <p className="text-label text-[color:var(--v2-muted)]">{protocol}</p>

      {/* "Almacena ritmo / zonas" — the resolver declaration (acento) */}
      <div
        className="flex items-center gap-2.5 rounded-[var(--v2-r-s)] px-3 py-2.5"
        style={{ background: 'var(--v2-accent-soft)' }}
      >
        <MIcon name="download" size={16} className="shrink-0 text-[color:var(--v2-accent)]" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-[color:var(--v2-accent)]">
            Almacena ritmo / zonas
          </p>
          <p className="text-label leading-snug text-[color:var(--v2-muted)]">
            El resultado calcula las 6 zonas del atleta y recalcula sus ritmos objetivo en todo el
            plan.
          </p>
        </div>
      </div>
    </div>
  );
}
