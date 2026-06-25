// CARD 4 — TESTS DE LA SEMANA 1. Two labelled groups: "PASIVOS · AUTOMÁTICOS"
// (kind 'auto') and "PROGRAMADOS · LOS AGENDA PABLO" (kind 'programmed'). Each
// row: checkbox at LEFT → LEADING kind chip → label. includedTests Set state
// preserved from V1.

import { MIcon } from '@/components/dashboard/MIcon';
import { Pill } from '@/components/v2/Pill';
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
      eyebrow={<span className="v2-micro">Decisión</span>}
    >
      {tests.length === 0 ? (
        <p className="text-sm text-[color:var(--v2-muted)]">
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
      <span className="v2-micro mb-1.5 block">{label}</span>
      <ul className="flex flex-col">
        {tests.map((test) => {
          const checked = included.has(test.slug);
          const passive = test.kind === 'auto';
          return (
            <li key={test.slug}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-[var(--v2-r-s)] px-2.5 py-2 transition-colors hover:bg-[color:var(--v2-surface-2)]">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(test.slug)}
                  className="v2-focus size-[18px] shrink-0 rounded-[5px] accent-[color:var(--v2-accent)]"
                />
                <Pill tone={passive ? 'neutral' : 'info'} variant="soft">
                  <MIcon name={passive ? 'sensors' : 'event'} size={12} aria-hidden />
                  {passive ? 'Pasivo' : 'Programado'}
                </Pill>
                <span className="text-[13.5px] text-[color:var(--v2-fg)]">{test.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
