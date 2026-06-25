// CARD 4 — TESTS DE LA SEMANA 1. Two labelled groups: "PASIVOS · AUTOMÁTICOS"
// (kind 'auto') and "PROGRAMADOS · LOS AGENDA PABLO" (kind 'programmed'). Each
// row: checkbox at LEFT → LEADING kind chip → label. The kind chip is never
// pushed to the far-right edge. includedTests Set state preserved from
// IntakeDecision.

import { StatusChip } from '@/components/dashboard/ui';
import type { IntakeBaselineTest } from '@/lib/coach/intake-schema';
import { DecisionCard } from '../ui/DecisionCard';

export function TestsCard({
  tests,
  included,
  onToggle,
}: {
  tests: IntakeBaselineTest[];
  included: Set<string>;
  onToggle: (slug: string) => void;
}) {
  const auto = tests.filter((t) => t.kind === 'auto');
  const programmed = tests.filter((t) => t.kind === 'programmed');

  return (
    <DecisionCard
      step={4}
      title="Tests de la semana 1"
      eyebrow={<span className="micro-label">Decisión</span>}
    >
      {tests.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)]">
          La IA no sugirió tests baseline para este perfil.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {auto.length > 0 ? (
            <TestGroup
              label="Pasivos · automáticos"
              tests={auto}
              included={included}
              onToggle={onToggle}
            />
          ) : null}
          {programmed.length > 0 ? (
            <TestGroup
              label="Programados · los agenda Pablo"
              tests={programmed}
              included={included}
              onToggle={onToggle}
            />
          ) : null}
        </div>
      )}
    </DecisionCard>
  );
}

function TestGroup({
  label,
  tests,
  included,
  onToggle,
}: {
  label: string;
  tests: IntakeBaselineTest[];
  included: Set<string>;
  onToggle: (slug: string) => void;
}) {
  return (
    <div>
      <span className="micro-label mb-1.5 block">{label}</span>
      <ul className="flex flex-col">
        {tests.map((test) => {
          const checked = included.has(test.slug);
          const passive = test.kind === 'auto';
          return (
            <li key={test.slug}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-[var(--r-s)] px-2.5 py-2 transition-colors hover:bg-[color:var(--surface-container)]">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(test.slug)}
                  className="focus-ring size-[18px] shrink-0 rounded-[5px] accent-[color:var(--accent)]"
                />
                <StatusChip
                  tier={passive ? 'neutral' : 'info'}
                  label={passive ? 'Pasivo' : 'Programado'}
                  icon={passive ? 'sensors' : 'event'}
                />
                <span className="text-[13.5px] text-[color:var(--fg)]">{test.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
