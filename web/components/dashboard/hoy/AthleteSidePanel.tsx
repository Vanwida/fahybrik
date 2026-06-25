'use client';

// AthleteSidePanel — the non-modal detail for a focused triage item (SPEC §4
// zone 4). Wraps the F2 DetailSidePanel and renders: the signal's mini-evidence,
// a readiness contributor breakdown (lazy-loaded on open from the athlete's
// daily-readiness snapshot), and the full action set. The queue stays visible
// and interactive behind it. Coach-note + pin are F7 and intentionally omitted.

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { DetailSidePanel, StatusChip } from '@/components/dashboard/ui';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';
import type { TriageItem } from './triage-types';

/**
 * The readiness side panel renders signal/decision evidence + the readiness
 * deep-dive. MESSAGE lines open the ThreadDrawer instead (inline reply), never
 * this panel, so the panel's item is narrowed to exclude them.
 */
type PanelItem = Exclude<TriageItem, { kind: 'message' }>;

/** One readiness contributor row, shaped by the breakdown endpoint. */
interface ContributorRow {
  label: string;
  /** 0–100 component score, or null when no data. */
  score: number | null;
}

interface ReadinessDeepDive {
  score: number | null;
  contributors: ContributorRow[];
}

const BTN =
  'focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-m)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors';

export interface AthleteSidePanelProps {
  item: PanelItem | null;
  open: boolean;
  onClose: () => void;
  onResolve: (item: TriageItem) => void;
  /** Fetches the readiness deep-dive for an athlete (lazy, on open). */
  fetchDeepDive: (athleteId: string) => Promise<ReadinessDeepDive | null>;
}

function contributorTier(score: number | null): 'success' | 'warning' | 'error' | 'neutral' {
  if (score == null) return 'neutral';
  if (score >= 67) return 'success';
  if (score >= 45) return 'warning';
  return 'error';
}

export function AthleteSidePanel({
  item,
  open,
  onClose,
  onResolve,
  fetchDeepDive,
}: AthleteSidePanelProps) {
  // Result keyed by the athlete it was loaded for, so "loading" is DERIVED
  // (open for an athlete whose result hasn't arrived) — no synchronous setState
  // in the effect body (react-hooks/set-state-in-effect). setState only ever
  // runs inside the async callback.
  const [result, setResult] = useState<{ forId: string; data: ReadinessDeepDive | null } | null>(
    null,
  );
  const athleteId = item?.athlete_id ?? null;

  useEffect(() => {
    if (!open || !athleteId) return;
    let cancelled = false;
    fetchDeepDive(athleteId)
      .then((data) => {
        if (!cancelled) setResult({ forId: athleteId, data });
      })
      .catch(() => {
        if (!cancelled) setResult({ forId: athleteId, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [open, athleteId, fetchDeepDive]);

  const loading = open && athleteId != null && result?.forId !== athleteId;
  const deepDive = result?.forId === athleteId ? result.data : null;

  return (
    <DetailSidePanel
      open={open}
      onClose={onClose}
      eyebrow={item ? item.reason_label : undefined}
      title={item?.athlete_name ?? 'Atleta'}
      headerAction={
        item ? (
          <Link
            href={`/atletas/${item.athlete_id}`}
            className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-[var(--r-s)] px-2 py-1 text-[11px] font-semibold text-[color:var(--text-muted)] hover:text-[color:var(--accent)]"
          >
            Ver ficha <MIcon name="open_in_new" size={13} />
          </Link>
        ) : null
      }
    >
      {item ? (
        <div className="flex flex-col gap-6">
          {/* Signal evidence */}
          <section aria-labelledby="sp-signal">
            <h3 id="sp-signal" className="micro-label mb-2">
              Señal
            </h3>
            <div className="flex items-start gap-3">
              <StatusChip tier={item.reason_tier} label={item.reason_label} icon={item.reason_icon} />
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[color:var(--fg)]">
              {item.evidence}
            </p>
          </section>

          {/* Readiness contributor breakdown (lazy) */}
          <section aria-labelledby="sp-readiness">
            <h3 id="sp-readiness" className="micro-label mb-2">
              Desglose de readiness
            </h3>
            {loading ? (
              <p className="text-[13px] text-[color:var(--text-muted)]">Cargando…</p>
            ) : deepDive && deepDive.contributors.length > 0 ? (
              <dl className="flex flex-col gap-2">
                {deepDive.contributors.map((c) => {
                  const tier = contributorTier(c.score);
                  return (
                    <div key={c.label} className="flex items-center gap-3">
                      <dt className="w-28 shrink-0 text-[12.5px] text-[color:var(--text-muted)]">
                        {c.label}
                      </dt>
                      <dd className="flex flex-1 items-center gap-2">
                        <span
                          aria-hidden
                          className="h-1.5 flex-1 overflow-hidden rounded-[var(--r-pill)] bg-[color:var(--surface-container-high)]"
                        >
                          <span
                            className="block h-full rounded-[var(--r-pill)]"
                            style={{
                              width: `${c.score ?? 0}%`,
                              background:
                                tier === 'success'
                                  ? 'var(--ok)'
                                  : tier === 'warning'
                                    ? 'var(--warning)'
                                    : tier === 'error'
                                      ? 'var(--danger)'
                                      : 'var(--neutral)',
                            }}
                          />
                        </span>
                        <span
                          className="metric-num w-9 shrink-0 text-right text-[12.5px] font-semibold"
                          style={{
                            color:
                              tier === 'neutral'
                                ? 'var(--text-muted)'
                                : tier === 'success'
                                  ? 'var(--ok)'
                                  : tier === 'warning'
                                    ? 'var(--warning)'
                                    : 'var(--danger)',
                          }}
                        >
                          {c.score == null ? '–' : c.score}
                        </span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p className="text-[13px] text-[color:var(--text-muted)]">
                Sin desglose de readiness todavía.
              </p>
            )}
          </section>

          {/* Full action set */}
          <section aria-label="Acciones" className="flex flex-wrap gap-2 border-t border-[color:var(--border-subtle)] pt-5">
            {item.kind === 'decision' && item.payload.type === 'intake_pending' ? (
              <Link
                href={`/atletas/${item.athlete_id}/intake`}
                className={cn(BTN, 'bg-[color:var(--accent)] text-[color:var(--accent-on)] hover:bg-[color:var(--accent-press)]')}
              >
                <MIcon name="assignment_ind" size={15} />
                Revisar intake
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onResolve(item)}
                className={cn(
                  BTN,
                  'border border-[color:color-mix(in_srgb,var(--ok)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--ok)_14%,var(--surface-container))] text-[color:var(--ok)] hover:bg-[color:color-mix(in_srgb,var(--ok)_24%,var(--surface-container))]',
                )}
              >
                <MIcon name="check" size={15} />
                {item.kind === 'decision' ? 'Aprobar' : 'Resolver'}
              </button>
            )}
            <Link
              href={item.open_href}
              className={cn(
                BTN,
                'border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] text-[color:var(--fg)] hover:bg-[color:var(--surface-container-high)]',
              )}
            >
              Abrir
              <MIcon name="arrow_forward" size={15} />
            </Link>
          </section>
        </div>
      ) : null}
    </DetailSidePanel>
  );
}
