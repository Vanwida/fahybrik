'use client';

// HISTÓRICO — the athlete's longitudinal record. LEFT: genuinely completed
// microcycles (name · duration · compliance %, colored). RIGHT: test progression
// (old→new + Δ) from REAL reference tests — strength 1RM (kg) and pace/endurance
// benchmarks (time) — plus a profile-versions timeline. Sections with no data show
// an inline empty note — never fabricated history, never in-WOD segment durations
// misread as test results.

import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { Panel, relativeDate } from './parts';
import { adherenceBand, ADHERENCE_BAND_COLOR_VAR } from '@/components/v2/constants';
import type { AthletePlanPayload } from '@/lib/dashboard/coach/athlete-plan';
import {
  buildTestProgression,
  EM_DASH,
  type StrengthMaxView,
  type BenchmarkSeries,
  type JointSession,
} from '@/lib/dashboard/v2/atleta-detalle-types';

export function HistoricoTab({
  plan,
  strengthMaxes,
  benchmarks,
  jointSessions,
  athleteName,
}: {
  plan: AthletePlanPayload | null;
  strengthMaxes: StrengthMaxView[];
  benchmarks: BenchmarkSeries[];
  jointSessions: JointSession[];
  athleteName: string;
}) {
  const allWeeks = plan?.macro.weeks ?? [];
  const phaseAssignments = plan?.macro.phase_assignments ?? [];

  // Only GENUINELY completed microcycles: one whose materialized weeks all elapsed
  // (every week completed/missed, none current/upcoming) and which has ≥1 week. A
  // draft (0 weeks) or an in-progress microcycle never appears here — it lives in
  // the Plan tab.
  const completedMicros = phaseAssignments.filter((pa) => {
    const weeks = allWeeks.filter((w) => w.microcycle_id === pa.microcycle_id);
    return (
      weeks.length > 0 &&
      weeks.every((w) => w.status === 'completed' || w.status === 'missed')
    );
  });

  const progressions = buildTestProgression(strengthMaxes, benchmarks);

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      {/* LEFT */}
      <div className="flex flex-col gap-5">
        <Panel title="Microciclos completados" bodyClassName="flex flex-col gap-2">
          {completedMicros.length > 0 ? (
            completedMicros.map((p) => {
              // Compliance for this microcycle = avg of its weeks (best-effort).
              const weeks = allWeeks.filter((w) => w.microcycle_id === p.microcycle_id);
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

        {/* Sesiones conjuntas — only when the athlete has logged joint "Entrenar
            juntos" sessions. In HYROX the time IS the result, so we show both
            athletes' real scores side by side (partner blank until they log). */}
        {jointSessions.length > 0 ? (
          <Panel title="Sesiones conjuntas" bodyClassName="flex flex-col gap-2">
            {jointSessions.map((s, i) => (
              <div
                key={`${s.date}-${i}`}
                className="flex flex-col gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs font-semibold text-[color:var(--v2-fg)]">
                    {s.session_name ?? 'Sesión conjunta'}
                  </span>
                  <span className="v2-num shrink-0 text-[11px] text-[color:var(--v2-faint)]">
                    {relativeDate(s.date) ?? s.date}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex min-w-0 flex-col rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface)] px-2.5 py-1.5">
                    <span className="v2-micro truncate text-[9px]">{athleteName}</span>
                    <span className="v2-num text-sm font-bold text-[color:var(--v2-fg)]">
                      {s.self_score ?? EM_DASH}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-col rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface)] px-2.5 py-1.5">
                    <span className="v2-micro truncate text-[9px]">
                      {s.partner_name ?? 'Pareja'}
                    </span>
                    <span className="v2-num text-sm font-bold text-[color:var(--v2-fg)]">
                      {s.partner_score ?? EM_DASH}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </Panel>
        ) : null}
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
                {progressions.map((p) => (
                  <tr key={p.key} className="border-b border-[color:var(--v2-border)] last:border-0">
                    <td className="py-2 pl-3.5 pr-2 text-xs font-medium text-[color:var(--v2-fg)]">
                      {p.label}
                    </td>
                    <td className="v2-num py-2 px-2 text-right text-xs text-[color:var(--v2-muted)]">
                      {p.before}
                    </td>
                    <td className="v2-num py-2 px-2 text-right text-xs font-semibold text-[color:var(--v2-fg)]">
                      {p.after}
                    </td>
                    <td className="py-2 pr-3.5 text-right">
                      {p.delta_label != null ? (
                        <span
                          className="v2-num text-xs font-semibold"
                          style={{
                            color:
                              p.improved === true
                                ? 'var(--v2-ok)'
                                : p.improved === false
                                  ? 'var(--v2-danger)'
                                  : 'var(--v2-muted)',
                          }}
                        >
                          {p.delta_label}
                        </span>
                      ) : (
                        <span className="v2-num text-xs text-[color:var(--v2-faint)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
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
