'use client';

// HISTÓRICO — the athlete's longitudinal record. LEFT: completed microcycles
// (name · duration · compliance %, colored) + an accumulated-load-by-block chart
// placeholder. RIGHT: test progression (old→new + Δ, from the performance PR
// series) + a profile-versions timeline. Built from the real MacroProgressPayload
// (completed weeks) + PerformancePayload (exercise attempts). Sections with no
// data show an inline empty note — never fabricated history.

import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { Panel, ChartPlaceholder, relativeDate } from './parts';
import { adherenceBand, ADHERENCE_BAND_COLOR_VAR } from '@/components/v2/constants';
import type { AthletePlanPayload } from '@/lib/dashboard/coach/athlete-plan';
import type { PerformancePayload, ExerciseTimeSeries } from '@/lib/dashboard/coach/deep-dive-performance';

function fmtTime(s: number | null): string {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** old→new + Δ for one exercise's first vs latest test/PR attempt. */
function testProgression(ex: ExerciseTimeSeries): {
  label: string;
  old: string;
  next: string;
  delta_sec: number | null;
} {
  const tests = ex.attempts.filter((a) => a.is_test || a.is_pr);
  const first = tests[0] ?? ex.attempts[0] ?? null;
  const last = tests.at(-1) ?? ex.attempts.at(-1) ?? null;
  const oldS = first?.best_seconds ?? null;
  const newS = last?.best_seconds ?? null;
  const delta = oldS != null && newS != null && first !== last ? newS - oldS : null;
  return { label: ex.exercise_label, old: fmtTime(oldS), next: fmtTime(newS), delta_sec: delta };
}

export function HistoricoTab({
  plan,
  performance,
}: {
  plan: AthletePlanPayload | null;
  performance: PerformancePayload | null;
}) {
  const completedWeeks = (plan?.macro.weeks ?? []).filter(
    (w) => w.status === 'completed' || w.status === 'missed',
  );
  const phaseAssignments = plan?.macro.phase_assignments ?? [];

  const progressions = (performance?.exercises ?? [])
    .map(testProgression)
    .filter((p) => p.old !== '—' || p.next !== '—');

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      {/* LEFT */}
      <div className="flex flex-col gap-5">
        <Panel title="Microciclos completados" bodyClassName="flex flex-col gap-2">
          {phaseAssignments.length > 0 ? (
            phaseAssignments.map((p) => {
              // Compliance for this assignment = avg of its weeks (best-effort).
              const weeks = (plan?.macro.weeks ?? []).filter((w) => w.microcycle_id === p.microcycle_id);
              const vals = weeks.map((w) => w.compliance_pct).filter((v): v is number => v != null);
              const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
              const colorVar = avg != null ? ADHERENCE_BAND_COLOR_VAR[adherenceBand(avg)] : '--v2-faint';
              return (
                <div
                  key={p.microcycle_id}
                  className="flex items-center justify-between gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2.5"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-semibold text-[color:var(--v2-fg)]">
                      {p.name}
                    </span>
                    <span className="v2-num text-[11px] text-[color:var(--v2-faint)]">
                      {weeks.length} sem · {relativeDate(p.start_date) ?? p.start_date}
                    </span>
                  </div>
                  <span
                    className="v2-num shrink-0 text-sm font-bold"
                    style={{ color: `var(${colorVar})` }}
                  >
                    {avg != null ? `${avg}%` : '—'}
                  </span>
                </div>
              );
            })
          ) : (
            <EmptyState
              icon="history"
              title="Sin microciclos completados"
              description="El historial aparece a medida que el atleta avanza sus microciclos."
              className="border-none py-6"
            />
          )}
        </Panel>

        <Panel title="Carga acumulada por bloque">
          <ChartPlaceholder label="Carga acumulada · bloques ATR" height={180} />
        </Panel>
      </div>

      {/* RIGHT */}
      <div className="flex flex-col gap-5">
        <Panel title="Progresión de tests" bodyClassName="p-0 overflow-hidden">
          {progressions.length > 0 ? (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[color:var(--v2-border)]">
                  <th className="v2-micro py-2 pl-3.5 text-left">Test</th>
                  <th className="v2-micro py-2 px-2 text-right">Antes</th>
                  <th className="v2-micro py-2 px-2 text-right">Ahora</th>
                  <th className="v2-micro py-2 pr-3.5 text-right">Δ</th>
                </tr>
              </thead>
              <tbody>
                {progressions.map((p) => {
                  // For time-based tests, a NEGATIVE delta (faster) is an improvement.
                  const improved = p.delta_sec != null && p.delta_sec < 0;
                  const worse = p.delta_sec != null && p.delta_sec > 0;
                  return (
                    <tr key={p.label} className="border-b border-[color:var(--v2-border)] last:border-0">
                      <td className="py-2 pl-3.5 pr-2 text-xs font-medium text-[color:var(--v2-fg)]">
                        {p.label}
                      </td>
                      <td className="v2-num py-2 px-2 text-right text-xs text-[color:var(--v2-muted)]">
                        {p.old}
                      </td>
                      <td className="v2-num py-2 px-2 text-right text-xs font-semibold text-[color:var(--v2-fg)]">
                        {p.next}
                      </td>
                      <td className="py-2 pr-3.5 text-right">
                        {p.delta_sec != null ? (
                          <span
                            className="v2-num text-xs font-semibold"
                            style={{
                              color: improved
                                ? 'var(--v2-ok)'
                                : worse
                                  ? 'var(--v2-danger)'
                                  : 'var(--v2-muted)',
                            }}
                          >
                            {improved ? '−' : '+'}
                            {fmtTime(Math.abs(p.delta_sec))}
                          </span>
                        ) : (
                          <span className="v2-num text-xs text-[color:var(--v2-faint)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="px-3.5 py-2">
              <EmptyState
                icon="trending_up"
                title="Aún sin tests repetidos"
                description="La progresión compara el primer test con el más reciente; necesita al menos dos."
                className="border-none py-6"
              />
            </div>
          )}
        </Panel>

        <Panel title="Versiones de perfil" bodyClassName="flex flex-col gap-0">
          {/* TODO(endpoint): the profile-version timeline comes from the resolver's
              versioned-profile table. Until wired, we surface the macro phase
              assignments as the closest real "version" anchors. */}
          {phaseAssignments.length > 0 ? (
            <ol className="flex flex-col">
              {phaseAssignments.slice(0, 5).map((p, i) => (
                <li key={p.microcycle_id} className="flex gap-3 pb-3 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: i === 0 ? 'var(--v2-accent)' : 'var(--v2-border-strong)' }}
                    />
                    {i < Math.min(phaseAssignments.length, 5) - 1 ? (
                      <span className="my-0.5 w-px flex-1 bg-[color:var(--v2-border)]" />
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-0.5 pb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[color:var(--v2-fg)]">
                        v{phaseAssignments.length - i}
                      </span>
                      <Pill tone="neutral" variant="soft" className="px-1.5 py-0">
                        {p.level}
                      </Pill>
                    </div>
                    <span className="v2-num text-[11px] text-[color:var(--v2-faint)]">
                      {p.name} · {relativeDate(p.start_date) ?? p.start_date}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              icon="account_tree"
              title="Sin versiones todavía"
              className="border-none py-6"
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
