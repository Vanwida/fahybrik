'use client';

// ActivityToday — the "Actividad de hoy" ambient glance (SABER layer). A COMPACT
// readout of what the roster logged today, at the SAME line density as the triage
// queue. Crucially this is NOT a queue: it does not trend to zero — it is
// review-at-scale + lightweight encouragement (👏/💪/✅). The off-target sessions
// are the actionable bit and they ALREADY surface in the queue as signals; here
// they are only flagged for awareness.
//
// Presentational + controlled: the page loads `ActivityToday` (activity-today.ts)
// and passes it in, so a preview can feed mock data. The rail shows a top-N strip;
// "Ver todas" opens a DetailSidePanel listing the day (bounded, never 100 inline).
// Reactions are a callback the page owns (no-op TODO until a reactions table
// ships — see the F3 flag); the affordance is wired and accessible regardless.

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { DetailSidePanel } from '@/components/dashboard/ui';
import { AthleteGlyph } from '@/components/dashboard/atoms/AthleteGlyph';
import { MIcon } from '@/components/ui/MIcon';
import {
  ADHERENCE_BAND_TIER,
  ADHERENCE_BAND_LABEL,
  type AdherenceBand,
} from '@fahybrid/shared/domain/adherence';
import { SEMANTIC_TIER_META } from '@/lib/dashboard/constants/status-semantics';
import type { ActivitySession, ActivityToday as ActivityTodayData } from '@/lib/dashboard/coach/activity-today';
import { cn } from '@/lib/utils';

/** The encouragement reactions a coach can fire on a logged session. */
export const ACTIVITY_REACTIONS: ReadonlyArray<{ key: string; emoji: string; label: string }> = [
  { key: 'clap', emoji: '👏', label: 'Aplaudir' },
  { key: 'strong', emoji: '💪', label: 'Fuerza' },
  { key: 'check', emoji: '✅', label: 'Visto bueno' },
];

export interface ActivityTodayProps {
  data: ActivityTodayData;
  /** How many rows to show in the rail strip before "Ver todas". */
  glanceLimit?: number;
  /** Fire an encouragement reaction on a session (page owns the side effect). */
  onReact?: (session: ActivitySession, reactionKey: string) => void;
  className?: string;
}

export function ActivityToday({ data, glanceLimit = 4, onReact, className }: ActivityTodayProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (data.total === 0) {
    return (
      <section
        className={cn('card-elevated px-5 pb-4 pt-5', className)}
        aria-labelledby="activity-today"
      >
        <h2 className="micro-label mb-2" id="activity-today">
          Actividad de hoy
        </h2>
        <p className="text-[12.5px] text-[color:var(--text-muted)]">
          Aún no hay sesiones registradas hoy.
        </p>
      </section>
    );
  }

  const glance = data.sessions.slice(0, glanceLimit);
  const hasMore = data.total > glance.length;

  return (
    <section className={cn('card-elevated px-5 pb-4 pt-5', className)} aria-labelledby="activity-today">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="micro-label" id="activity-today">
          Actividad de hoy
        </h2>
        <ActivityHeaderMeta total={data.total} offTarget={data.off_target_count} />
      </header>

      <ul className="-mx-2 flex flex-col">
        {glance.map((s) => (
          <ActivityRow key={s.id} session={s} onReact={onReact} />
        ))}
      </ul>

      {hasMore ? (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="focus-ring mt-2 inline-flex items-center gap-1 rounded-[var(--r-s)] px-1 py-1 text-[12px] font-semibold text-[color:var(--text-muted)] hover:text-[color:var(--accent)]"
        >
          Ver todas
          <span className="metric-num font-bold">{data.total}</span>
          <MIcon name="arrow_forward" size={13} />
        </button>
      ) : null}

      <DetailSidePanel
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        eyebrow="Actividad de hoy"
        title={`${data.total} ${data.total === 1 ? 'sesión' : 'sesiones'}`}
        width="md"
      >
        <ul className="-mx-1 flex flex-col">
          {data.sessions.map((s) => (
            <ActivityRow key={s.id} session={s} onReact={onReact} expanded />
          ))}
        </ul>
        {data.sessions.length < data.total ? (
          <p className="mt-3 px-1 text-[12px] text-[color:var(--text-muted)]">
            Mostrando las {data.sessions.length} más recientes de {data.total}.
          </p>
        ) : null}
      </DetailSidePanel>
    </section>
  );
}

// ── Header meta: "N sesiones · M fuera de objetivo" ───────────────────────────

function ActivityHeaderMeta({ total, offTarget }: { total: number; offTarget: number }) {
  return (
    <p className="flex items-center gap-2 text-[11.5px] text-[color:var(--text-muted)]">
      <span>
        <span className="metric-num font-semibold text-[color:var(--fg)]">{total}</span>{' '}
        {total === 1 ? 'sesión' : 'sesiones'}
      </span>
      {offTarget > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1 text-[color:var(--danger)]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-[var(--r-pill)] bg-[color:var(--danger)]"
            />
            <span className="metric-num font-semibold">{offTarget}</span> fuera de objetivo
          </span>
        </>
      ) : null}
    </p>
  );
}

// ── One dense session row (athlete · session · result · adherence dot · react) ─

function ActivityRow({
  session,
  onReact,
  expanded = false,
}: {
  session: ActivitySession;
  onReact?: (session: ActivitySession, reactionKey: string) => void;
  expanded?: boolean;
}) {
  return (
    <li className="group flex items-center gap-2.5 rounded-[var(--r-s)] px-2 py-1.5 transition-colors hover:bg-[color:var(--surface-container)]">
      <AdherenceDot band={session.adherence} />
      <Link
        href={`/atletas/${session.athlete_id}`}
        aria-label={`Ver ficha de ${session.athlete_name}`}
        className="focus-ring shrink-0 rounded-full"
      >
        <AthleteGlyph name={session.athlete_name} size="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-semibold text-[color:var(--fg)]">
          {session.session_name}
        </p>
        <p className="truncate text-[11px] text-[color:var(--text-muted)]">
          {session.athlete_name}
          {session.format_label ? ` · ${session.format_label}` : ''} · {session.result}
        </p>
      </div>
      {expanded && session.age_label ? (
        <span className="shrink-0 text-[10.5px] text-[color:var(--text-muted)]">
          {session.age_label}
        </span>
      ) : null}
      <ReactionCluster session={session} onReact={onReact} />
    </li>
  );
}

/** Adherence dot — color + the band label in the title/aria (never color alone). */
function AdherenceDot({ band }: { band: AdherenceBand }) {
  const tier = ADHERENCE_BAND_TIER[band];
  const meta = SEMANTIC_TIER_META[tier];
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-[var(--r-pill)]"
      style={{ background: meta.token }}
      role="img"
      aria-label={ADHERENCE_BAND_LABEL[band]}
      title={ADHERENCE_BAND_LABEL[band]}
    />
  );
}

/** Quick-react cluster — appears on hover/focus; each emoji is a labelled button. */
function ReactionCluster({
  session,
  onReact,
}: {
  session: ActivitySession;
  onReact?: (session: ActivitySession, reactionKey: string) => void;
}) {
  if (!onReact) return null;
  return (
    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      {ACTIVITY_REACTIONS.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => onReact(session, r.key)}
          aria-label={`${r.label} a ${session.athlete_name}`}
          className={cn(
            'focus-ring inline-flex h-6 w-6 items-center justify-center rounded-[var(--r-s)] text-[13px] leading-none',
            'hover:bg-[color:var(--surface-container-high)]',
            session.reacted && 'opacity-100',
          )}
        >
          <span aria-hidden>{r.emoji}</span>
        </button>
      ))}
    </div>
  );
}
