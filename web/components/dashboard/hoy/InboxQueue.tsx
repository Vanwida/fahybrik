'use client';

// Cola de HOY — orquesta los grupos (Crítico → Decisiones → Alertas →
// Mensajes) y el flujo de aprobación inline (spec §1/§6):
//   Aprobar → la card colapsa optimista con check verde + "Deshacer" 5 s.
//   Al agotarse la ventana se llama al MISMO endpoint de aprobación que usa
//   el flujo de review existente. Si falla, la card se restaura con banner
//   inline "No se pudo aprobar — reintentar". Nunca un modal.

import { useEffect, useRef, useState } from 'react';
import type { InboxItem } from '@/lib/dashboard/coach/inbox';
import { InboxItemCard } from '@/components/dashboard/hoy/InboxItemCard';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

/** Undo window before the approval commits (spec §6). */
const UNDO_SECONDS = 5;

type ApprovalPhase =
  | { phase: 'undo'; seconds_left: number }
  | { phase: 'committing' }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

interface InboxQueueProps {
  items: InboxItem[];
}

function approveEndpoint(item: InboxItem): string | null {
  if (item.type === 'week_adjustment') {
    return `/api/coach/athletes/${item.athlete_id}/week-adjustment/${item.proposal_id}/approve`;
  }
  if (item.type === 'monthly_block') {
    return `/api/coach/athletes/${item.athlete_id}/monthly-block/${item.proposal_id}/approve`;
  }
  return null;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

const GROUPS: ReadonlyArray<{ severity: InboxItem['severity']; label: string }> = [
  { severity: 'critical', label: 'Crítico' },
  { severity: 'decision', label: 'Decisiones' },
  { severity: 'alert', label: 'Alertas' },
  { severity: 'message', label: 'Mensajes' },
];

export function InboxQueue({ items }: InboxQueueProps) {
  const [postponed, setPostponed] = useState<ReadonlySet<string>>(new Set());
  const [approvals, setApprovals] = useState<Record<string, ApprovalPhase>>({});
  const timersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  // Countdown vivo por item — en ref (no en el updater de estado) para que el
  // POST de commit se dispare exactamente UNA vez aunque React re-ejecute los
  // updaters (StrictMode).
  const countdownRef = useRef<Map<string, number>>(new Map());

  // Limpieza de timers al desmontar.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearInterval(t);
      timers.clear();
    };
  }, []);

  const clearTimer = (id: string) => {
    const t = timersRef.current.get(id);
    if (t) clearInterval(t);
    timersRef.current.delete(id);
  };

  const commit = async (item: InboxItem) => {
    const endpoint = approveEndpoint(item);
    if (!endpoint) return;
    setApprovals((prev) => ({ ...prev, [item.id]: { phase: 'committing' } }));
    try {
      const res = await fetch(endpoint, { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setApprovals((prev) => ({
          ...prev,
          [item.id]: {
            phase: 'error',
            message: body?.error?.message
              ? `No se pudo aprobar — ${body.error.message}`
              : 'No se pudo aprobar',
          },
        }));
        return;
      }
      setApprovals((prev) => ({ ...prev, [item.id]: { phase: 'done' } }));
    } catch {
      setApprovals((prev) => ({
        ...prev,
        [item.id]: { phase: 'error', message: 'No se pudo aprobar — sin conexión' },
      }));
    }
  };

  const handleApprove = (item: InboxItem) => {
    clearTimer(item.id);
    countdownRef.current.set(item.id, UNDO_SECONDS);
    setApprovals((prev) => ({ ...prev, [item.id]: { phase: 'undo', seconds_left: UNDO_SECONDS } }));
    const timer = setInterval(() => {
      const remaining = (countdownRef.current.get(item.id) ?? 0) - 1;
      countdownRef.current.set(item.id, remaining);
      if (remaining <= 0) {
        clearTimer(item.id);
        void commit(item);
        return;
      }
      setApprovals((prev) =>
        prev[item.id]?.phase === 'undo'
          ? { ...prev, [item.id]: { phase: 'undo', seconds_left: remaining } }
          : prev,
      );
    }, 1000);
    timersRef.current.set(item.id, timer);
  };

  const handleUndo = (item: InboxItem) => {
    clearTimer(item.id);
    setApprovals((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  };

  const handleRetry = (item: InboxItem) => {
    void commit(item);
  };

  const handlePostpone = (item: InboxItem) => {
    setPostponed((prev) => new Set(prev).add(item.id));
  };

  const visible = items.filter((i) => !postponed.has(i.id));

  if (visible.length === 0) {
    return <EmptyQueue />;
  }

  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map(({ severity, label }) => {
        const group = visible.filter((i) => i.severity === severity);
        if (group.length === 0) return null;
        const headingId = `grupo-${severity}`;
        return (
          <section key={severity} className="flex flex-col gap-3" aria-labelledby={headingId}>
            <h2 id={headingId} className="micro-label flex items-center gap-3 px-1">
              {label}{' '}
              <span className="metric-num font-bold text-[color:var(--surface-variant)]">
                {group.length}
              </span>
              <span aria-hidden className="h-px flex-1 bg-[color:var(--border-subtle)]" />
            </h2>
            {group.map((item) => {
              const approval = approvals[item.id];
              if (approval && approval.phase !== 'error') {
                return (
                  <ApprovedCard
                    key={item.id}
                    item={item}
                    approval={approval}
                    onUndo={() => handleUndo(item)}
                  />
                );
              }
              return (
                <InboxItemCard
                  key={item.id}
                  item={item}
                  onApprove={handleApprove}
                  onPostpone={handlePostpone}
                  error_message={approval?.phase === 'error' ? approval.message : null}
                  onRetry={handleRetry}
                />
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

// ── Card aprobada (colapsada) + Deshacer 5 s ─────────────────────────────────

function ApprovedCard({
  item,
  approval,
  onUndo,
}: {
  item: InboxItem;
  approval: Extract<ApprovalPhase, { phase: 'undo' | 'committing' | 'done' }>;
  onUndo: () => void;
}) {
  const name = firstName(item.athlete_name);
  const sub =
    approval.phase === 'undo'
      ? `Se publicará a ${name} al agotarse la cuenta atrás`
      : approval.phase === 'committing'
        ? 'Publicando…'
        : 'El ajuste ya es visible en su móvil';

  return (
    <article
      role="status"
      aria-label={`Aprobado — publicado a ${name}`}
      className={cn(
        'card-elevated flex items-center gap-4 px-6 py-4',
        'border-[color:color-mix(in_srgb,var(--ok)_30%,var(--border-subtle))]',
        'bg-[color:color-mix(in_srgb,var(--ok)_4%,var(--surface-card))]',
        'hover:border-[color:color-mix(in_srgb,var(--ok)_30%,var(--border-subtle))]',
      )}
    >
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-pill)] bg-[color:color-mix(in_srgb,var(--ok)_18%,transparent)] text-[color:var(--ok)]"
      >
        <MIcon name="check" filled weight={500} size={18} />
      </span>
      <span className="min-w-0 flex-1 text-sm text-[color:var(--fg)]">
        <strong className="font-semibold">Aprobado</strong> — publicado a {name}
        <span className="mt-0.5 block text-xs text-[color:var(--text-muted)]">{sub}</span>
      </span>
      {approval.phase === 'undo' ? (
        <button
          type="button"
          onClick={onUndo}
          aria-label={`Deshacer aprobación, ${approval.seconds_left} segundos restantes`}
          className={cn(
            'focus-ring relative inline-flex shrink-0 items-center gap-2 overflow-hidden',
            'rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] px-3.5 py-2',
            'text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--fg)]',
            'hover:bg-[color:var(--surface-container-high)]',
          )}
        >
          Deshacer{' '}
          <span aria-hidden className="metric-num text-[10px] text-[color:var(--text-muted)]">
            {approval.seconds_left}s
          </span>
          <span
            aria-hidden
            className="absolute bottom-0 left-0 h-0.5 bg-[color:var(--ok)] transition-all duration-1000 ease-linear motion-reduce:transition-none"
            style={{ width: `${(approval.seconds_left / UNDO_SECONDS) * 100}%` }}
          />
        </button>
      ) : null}
    </article>
  );
}

// ── Estado vacío — "Todo al día." (spec §1) ──────────────────────────────────

function EmptyQueue() {
  return (
    <section
      aria-label="Sin pendientes"
      className="card-elevated px-6 py-12 text-center hover:border-[color:var(--border-subtle)]"
    >
      <MIcon name="check_circle" filled size={28} className="mb-4 text-[color:var(--ok)]" />
      <h2 className="font-display text-[44px] font-black uppercase italic leading-[1.05] tracking-tight text-[color:var(--fg)]">
        Todo al día<span className="text-[color:var(--accent)]">.</span>
      </h2>
      <p className="mt-3 text-sm text-[color:var(--text-muted)]">
        Sin decisiones pendientes. Próxima revisión semanal: sábado.
      </p>
    </section>
  );
}
