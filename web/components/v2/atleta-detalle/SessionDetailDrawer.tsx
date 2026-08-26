'use client';

// Peek del día: el plan se lee por tipografía y agrupación. Sin velo; la
// semana de detrás sigue viva. `assignmentId` puede llegar de `?sesion=` y
// ser ajeno: 400/404 dispara `onInvalid`.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MIcon } from '@/components/ui/MIcon';
import { Link } from '@/i18n/navigation';
import {
  SessionBlockSection,
  SplitsTable,
  actualTokens,
} from '@/components/v2/sesion/ItemPrescritoHecho';
import type { CoachSessionDetail } from '@/lib/dashboard/coach/athlete-session-adapter';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';
import { readCoachSessionDetailResponse } from '@/lib/dashboard/coach/session-detail-load';

export function SessionDetailDrawer({
  athleteId,
  assignmentId,
  onClose,
  onInvalid,
}: {
  athleteId: string;
  assignmentId: string;
  onClose: () => void;
  onInvalid?: () => void;
}) {
  const [detail, setDetail] = useState<CoachSessionDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const onInvalidRef = useRef(onInvalid);
  useEffect(() => {
    onInvalidRef.current = onInvalid;
  }, [onInvalid]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/coach/athletes/${athleteId}/sessions/${assignmentId}/detail`, {
      credentials: 'include',
    })
      .then(async (res) => {
        const loaded = await readCoachSessionDetailResponse(res);
        if (!alive) return;
        if (loaded.kind === 'invalid') {
          if (onInvalidRef.current) onInvalidRef.current();
          else setState('error');
          return;
        }
        if (loaded.kind === 'error') {
          setState('error');
          return;
        }
        setDetail(loaded.session);
        setState('ready');
      })
      .catch(() => {
        if (alive) setState('error');
      });
    return () => {
      alive = false;
    };
  }, [athleteId, assignmentId]);

  const anchorRef = useRef<HTMLSpanElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(anchorRef.current?.closest<HTMLElement>('.v2-root') ?? document.body);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const byItem = new Map<string, SegmentActual[]>();
  const unmatched: SegmentActual[] = [];
  for (const a of detail?.segment_actuals ?? []) {
    if (a.item_uid) {
      const list = byItem.get(a.item_uid) ?? [];
      list.push(a);
      byItem.set(a.item_uid, list);
    } else {
      unmatched.push(a);
    }
  }

  const title = detail
    ? detail.display_title ?? detail.workout?.name ?? detail.template_name ?? 'Entreno'
    : 'Entreno';

  const meta = detail?.execution
    ? [
        detail.execution.duration_min != null ? `${detail.execution.duration_min} min` : null,
        detail.execution.rpe != null ? `RPE ${detail.execution.rpe}` : null,
        detail.execution.score_label,
      ].filter((part): part is string => part != null)
    : [];

  return (
    <span ref={anchorRef} hidden>
      {portalTarget
        ? createPortal(
            <aside
              role="dialog"
              aria-label={`Detalle del entreno: ${title}`}
              className="fixed inset-y-0 right-0 z-40 flex w-[min(640px,94vw)] flex-col border-l border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
            >
              <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="v2-display truncate text-xl">{title}</h2>
                  {meta.length > 0 ? (
                    <span className="v2-num text-xs text-[color:var(--v2-muted)]">
                      {meta.join(' · ')}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
                >
                  <MIcon name="close" size={20} />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto px-5 pb-6">
                {state === 'loading' ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-[color:var(--v2-muted)]">
                    <MIcon name="progress_activity" size={18} className="animate-spin" />
                    <span className="text-sm">Cargando…</span>
                  </div>
                ) : state === 'error' || !detail ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-center text-[color:var(--v2-muted)]">
                    <MIcon name="error_outline" size={22} className="text-[color:var(--v2-danger)]" />
                    <span className="text-sm">No se pudo cargar el detalle del entreno.</span>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {detail.execution?.trace?.available ? (
                      <Link
                        href={`/atletas/${athleteId}/sesion/${assignmentId}`}
                        className="v2-focus border-t border-[color:var(--v2-border)] py-3 text-sm font-semibold text-[color:var(--v2-fg)]"
                      >
                        Ver la carrera
                      </Link>
                    ) : null}

                    {detail.execution?.athlete_notes ? (
                      <p className="border-t border-[color:var(--v2-border)] py-3 text-sm italic leading-snug text-[color:var(--v2-muted)]">
                        {detail.execution.athlete_notes}
                      </p>
                    ) : null}

                    {detail.coach_notes ? (
                      <p className="border-t border-[color:var(--v2-border)] py-3 text-sm italic leading-snug text-[color:var(--v2-muted)]">
                        {detail.coach_notes}
                      </p>
                    ) : null}

                    {detail.workout && detail.workout.blocks.length > 0
                      ? detail.workout.blocks.map((block) => (
                          <div key={block.uid} className="border-t border-[color:var(--v2-border)] py-3">
                            <SessionBlockSection
                              block={block}
                              sessionTitle={title}
                              actualsByItem={byItem}
                            />
                          </div>
                        ))
                      : null}

                    {unmatched.map((a) => {
                      const tokens = actualTokens(a);
                      if (tokens.length === 0 && !(a.erg_splits && a.erg_splits.length > 0)) {
                        return null;
                      }
                      return (
                        <div key={a.position} className="border-t border-[color:var(--v2-border)] py-3">
                          {tokens.length > 0 ? (
                            <p className="v2-num text-sm text-[color:var(--v2-fg)]">{tokens.join(' · ')}</p>
                          ) : null}
                          {a.erg_splits && a.erg_splits.length > 0 ? (
                            <SplitsTable
                              splits={a.erg_splits}
                              dragFactor={a.drag_factor}
                              calPerHour={a.avg_calories_per_hour}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>,
            portalTarget,
          )
        : null}
    </span>
  );
}
