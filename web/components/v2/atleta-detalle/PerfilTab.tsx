'use client';

// PERFIL & OBJETIVOS — the test→objetivos resolver surface. Two columns joined by
// an accent "→": LEFT the athlete's reference tests (from the app), RIGHT the
// derived training targets the resolver produces from them. A test with no result
// reads "pendiente"; a derived target with no value reads "—" + a tinted row when
// the coach has adjusted it by hand. The SHAPE is the real resolver contract, so
// the engine drops in without touching this view.

import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { Panel, relativeDate } from './parts';
import { ClasificacionCard } from './ClasificacionCard';
import { TestsPanel } from './tests/TestsPanel';
import { TargetRaceCard } from './TargetRaceCard';
import type {
  PerfilTabData,
  ClasificacionData,
  StrengthMaxView,
} from '@/lib/dashboard/v2/atleta-detalle-types';
import type { CalibrationTestStatus } from '@/lib/coach/battery-status';
import { cn } from '@/lib/utils';

function TestCard({
  icon,
  label,
  value,
  date_iso,
}: {
  icon: string;
  label: string;
  value: string | null;
  date_iso: string | null;
}) {
  const has = value != null;
  const rel = relativeDate(date_iso);
  return (
    <div className="flex items-center gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface)] text-[color:var(--v2-muted)]">
        <MIcon name={icon} size={20} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-semibold text-[color:var(--v2-fg)]">{label}</span>
        {has ? (
          <span className="v2-num text-sm font-semibold text-[color:var(--v2-fg)]">{value}</span>
        ) : (
          <span className="text-xs text-[color:var(--v2-faint)]">Pendiente de registro</span>
        )}
      </div>
      {has && rel ? (
        <span className="v2-num shrink-0 text-[11px] text-[color:var(--v2-faint)]">{rel}</span>
      ) : null}
    </div>
  );
}

function ObjectiveRow({
  label,
  aria_label,
  target,
  adjusted,
}: {
  label: string;
  aria_label: string;
  target: string | null;
  adjusted: boolean;
}) {
  return (
    <tr
      className={cn(
        'border-b border-[color:var(--v2-border)] last:border-0',
        adjusted && 'bg-[color:var(--v2-warn-soft)]',
      )}
    >
      <td className="py-2 pl-1 pr-2 text-xs font-medium text-[color:var(--v2-fg)]">
        <span className="flex items-center gap-1.5">
          {label}
          {adjusted ? (
            <Pill tone="warn" variant="soft" className="px-1.5 py-0">
              ajustado
            </Pill>
          ) : null}
        </span>
      </td>
      <td className="v2-num py-2 px-2 text-right text-xs text-[color:var(--v2-muted)]">
        {target ?? '—'}
      </td>
      <td className="py-2 pl-2 pr-1 text-right">
        <button
          type="button"
          aria-label={aria_label}
          className="v2-focus inline-flex h-6 w-6 items-center justify-center rounded-[var(--v2-r-xs)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="edit" size={15} />
        </button>
      </td>
    </tr>
  );
}

// The progression delta vs the previous version (history is oldest→newest and
// INCLUDES the current max as its last element). Null when there's no prior
// version or the value is unchanged — we don't show a "+0 kg" chip.
function strengthDelta(max: StrengthMaxView): { label: string; positive: boolean } | null {
  if (max.history.length < 2) return null;
  const prev = max.history[max.history.length - 2];
  const diff = Math.round(max.one_rm_kg - prev.one_rm_kg);
  if (diff === 0) return null;
  return { label: `${diff > 0 ? '+' : ''}${diff} kg`, positive: diff > 0 };
}

function StrengthRow({ max }: { max: StrengthMaxView }) {
  const delta = strengthDelta(max);
  const rel = relativeDate(max.recorded_at);
  return (
    <div className="flex items-center gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface)] text-[color:var(--v2-muted)]">
        <MIcon name="fitness_center" size={20} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-semibold text-[color:var(--v2-fg)]">{max.exercise_label}</span>
        {rel ? (
          <span className="v2-num text-[11px] text-[color:var(--v2-faint)]">{rel}</span>
        ) : null}
      </div>
      {delta ? (
        <Pill tone={delta.positive ? 'ok' : 'warn'} variant="soft" className="px-1.5 py-0">
          {delta.label}
        </Pill>
      ) : null}
      <span className="v2-num shrink-0 text-sm font-semibold text-[color:var(--v2-fg)]">
        {Math.round(max.one_rm_kg)} kg
      </span>
    </div>
  );
}

export function PerfilTab({
  data,
  classification,
  athleteId,
  athleteName,
  tests,
  testLibrary,
}: {
  data: PerfilTabData;
  classification: ClasificacionData;
  athleteId: string;
  athleteName: string;
  tests: CalibrationTestStatus[];
  testLibrary: { id: string; name: string; last_done: string | null }[];
}) {
  // At least one resolved target across modalities → show the table; otherwise the
  // honest empty state. (No test yet → objective_groups is [].)
  const hasObjectives = data.objective_groups.some((g) =>
    g.zones.some((z) => z.target != null),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Clasificación — nivel + días (gates assignment) */}
      <ClasificacionCard athleteId={athleteId} data={classification} />

      {/* Carrera objetivo — the periodization anchor (countdown + category) */}
      <TargetRaceCard athleteId={athleteId} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_auto_1fr]">
      {/* LEFT · reference tests */}
      <Panel
        title="Tests de referencia · desde la app"
        bodyClassName="flex flex-col gap-2.5"
      >
        {/* FC máx medida — read-only physiological anchor for HR zones. Omitted
            when never measured (honest-null): no estimate is shown as if measured. */}
        {data.max_hr_bpm != null ? (
          <div className="flex items-center justify-between rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2.5">
            <span className="flex items-center gap-2 text-xs font-semibold text-[color:var(--v2-fg)]">
              <MIcon name="monitor_heart" size={18} className="text-[color:var(--v2-muted)]" />
              FC máx medida
            </span>
            <span className="v2-num text-sm font-semibold text-[color:var(--v2-fg)]">
              {data.max_hr_bpm}{' '}
              <span className="text-[11px] font-normal text-[color:var(--v2-faint)]">bpm</span>
            </span>
          </div>
        ) : null}
        {data.reference_tests.map((t) => (
          <TestCard key={t.slug} icon={t.icon} label={t.label} value={t.value} date_iso={t.date_iso} />
        ))}
      </Panel>

      {/* Accent join → */}
      <div className="hidden items-center justify-center self-center lg:flex" aria-hidden>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]">
          <MIcon name="arrow_forward" size={20} />
        </span>
      </div>

      {/* RIGHT · zonas de entrenamiento — the resolver output, grouped by modality */}
      <Panel
        title="Zonas de entrenamiento"
        action={
          hasObjectives ? (
            <Pill tone="info" variant="soft">
              Calculadas con sus tests
            </Pill>
          ) : undefined
        }
        bodyClassName="flex flex-col gap-3"
      >
        {!hasObjectives ? (
          <EmptyState
            icon="speed"
            title="Aún sin zonas"
            description="Las zonas y ritmos se calculan automáticamente al registrar los tests de referencia."
            className="border-none py-6"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {data.objective_groups.map((group) => (
              <div key={group.modality} className="flex flex-col">
                {/* Modality header — same dot/label family as the Ritmos / Zonas tab */}
                <div className="mb-1.5 flex items-center gap-2 border-b border-[color:var(--v2-border)] pb-1.5">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-[var(--v2-r-3xs)]"
                    style={{
                      background: `var(--v2-mod-${group.modality === 'run' ? 'carrera' : 'ergo'})`,
                    }}
                  />
                  <span className="text-[12.5px] font-bold text-[color:var(--v2-fg)]">
                    {group.modality_label}
                  </span>
                </div>
                <table className="w-full border-collapse">
                  <tbody>
                    {group.zones.map((z) => (
                      <ObjectiveRow
                        key={z.code}
                        label={z.code}
                        aria_label={`Ajustar ${group.modality_label} ${z.code}`}
                        target={z.target}
                        adjusted={z.adjusted}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
          >
            <MIcon name="tune" size={15} />
            Ajustar a mano
          </button>
          <button
            type="button"
            className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] px-3 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="history" size={15} />
            Ver versiones{data.profile_version != null ? ` (${data.profile_version})` : ''}
          </button>
        </div>
      </Panel>
      </div>

      {/* Fuerza · 1RM — current max per lift + progression delta */}
      <Panel
        title="Fuerza · 1RM"
        action={
          data.strength_maxes.length > 0 ? (
            <Pill tone="info" variant="soft">
              {data.strength_maxes.length} {data.strength_maxes.length === 1 ? 'levantamiento' : 'levantamientos'}
            </Pill>
          ) : undefined
        }
        bodyClassName="flex flex-col gap-2.5"
      >
        {data.strength_maxes.length === 0 ? (
          <EmptyState
            icon="fitness_center"
            title="Sin marcas de fuerza"
            description="Los 1RM aparecen al registrarlos en el onboarding o con un test de fuerza."
            className="border-none py-6"
          />
        ) : (
          data.strength_maxes.map((m) => <StrengthRow key={m.exercise_slug} max={m} />)
        )}
      </Panel>

      {/* Tests — right under Fuerza on purpose: these are what PRODUCE the 1RMs and
          the zones above, and until now the ficha showed the outputs and never the
          tests that generate them. */}
      <TestsPanel
        athleteId={athleteId}
        athleteName={athleteName}
        tests={tests}
        library={testLibrary}
      />
    </div>
  );
}
