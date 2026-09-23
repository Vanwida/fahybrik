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
import { Select } from '@/components/v2/ui';

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
          <Select
            aria-label="Tipo de test"
            value={slug}
            onValueChange={setType}
            options={TEST_TYPES.map((t) => ({ value: t.slug, label: t.label }))}
            className="w-full"
          />
        </Field>

        <Field label="Modalidad">
          <div
            className="flex h-8 items-center gap-2 rounded-ctl bg-v2-surface-2 px-2.5 t-body-sm font-medium"
            style={{ color: `var(--v2-mod-${modality === 'run' ? 'carrera' : 'ergo'})` }}
          >
            {MODALITY_LABEL[modality]} · {paceUnitLabel(unit)}
          </div>
        </Field>

        <Field label="Esfuerzo">
          <div className="flex min-h-[34px] items-center rounded-ctl border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2 py-1.5">
            <span className="t-tnum text-sm font-semibold text-v2-fg">
              RPE {TEST_TARGET_RPE}
            </span>
          </div>
        </Field>
      </div>

      {/* Protocol descriptor */}
      <p className="t-meta text-[color:var(--v2-muted)]">{protocol}</p>

      {/* "Almacena ritmo / zonas" — the resolver declaration (acento) */}
      <div
        className="flex items-center gap-2.5 rounded-ctl px-3 py-2.5"
        style={{ background: 'var(--v2-accent-soft)' }}
      >
        <MIcon name="download" size={16} className="shrink-0 text-v2-fg" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-v2-fg">
            Almacena ritmo / zonas
          </p>
          <p className="t-meta leading-snug text-[color:var(--v2-muted)]">
            El resultado calcula las 6 zonas del atleta y recalcula sus ritmos objetivo en todo el
            plan.
          </p>
        </div>
      </div>
    </div>
  );
}
