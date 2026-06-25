'use client';

// LaneCard — one athlete in a triage lane. Avatar + name + level, a one-line
// reason, an optional mini adherence/readiness signal, and 1–2 action buttons.
// Actions resolve to next/link navigation (Ver → ficha, Responder/Mensaje →
// mensajes) or no-op buttons with a TODO where no endpoint exists yet. Pure
// presentational + links; the board owns data.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { AdherenceBar } from '@/components/v2/AdherenceBar';
import { Pill } from '@/components/v2/Pill';
import { cn } from '@/lib/utils';
import type { V2LaneAction, V2LaneCard } from '@/lib/dashboard/v2/hoy-lanes';

// ── Action presentation ───────────────────────────────────────────────────────
interface ActionMeta {
  label: string;
  icon: string;
  /** Builds the href for link actions; undefined → render a plain button. */
  href?: (athlete_id: string) => string;
  primary?: boolean;
}

// Placeholder routes (atletas/mensajes detail pages arrive in later builds).
const ACTION_META: Record<V2LaneAction, ActionMeta> = {
  ver: { label: 'Ver', icon: 'visibility', href: (id) => `/v2/atletas/${id}` },
  mensaje: { label: 'Mensaje', icon: 'forum', href: () => `/v2/mensajes` },
  responder: { label: 'Responder', icon: 'reply', href: () => `/v2/mensajes`, primary: true },
  // No progression endpoint yet — opens the athlete to act there.
  // TODO(endpoint): wire to the phase-adjust action once it exists.
  ajustar_fase: { label: 'Ajustar fase', icon: 'tune', href: (id) => `/v2/atletas/${id}` },
  // No load-export endpoint yet.
  // TODO(endpoint): wire "Descargar carga" to the deload action when available.
  descargar_carga: { label: 'Descargar carga', icon: 'trending_down' },
};

function ActionButton({ action, athlete_id }: { action: V2LaneAction; athlete_id: string }) {
  const meta = ACTION_META[action];
  const cls = cn(
    'v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] px-2 text-[11px] font-semibold transition-colors',
    meta.primary
      ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]'
      : 'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
  );
  const inner = (
    <>
      <MIcon name={meta.icon} size={15} />
      {meta.label}
    </>
  );
  if (meta.href) {
    return (
      <Link href={meta.href(athlete_id)} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls}>
      {inner}
    </button>
  );
}

export function LaneCard({ card, index }: { card: V2LaneCard; index: number }) {
  return (
    <div
      className={cn(
        'v2-stagger rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2.5',
        'transition-colors hover:border-[color:var(--v2-border-strong)]',
      )}
      style={{ ['--v2-stagger-i' as string]: index }}
    >
      {/* Identity row */}
      <div className="flex items-center gap-2.5">
        <AthleteAvatar name={card.athlete_name} size="md" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
            {card.athlete_name}
          </span>
          <LevelBadge level={card.level} />
        </div>
        {card.age_label ? (
          <span className="v2-num shrink-0 text-[11px] text-[color:var(--v2-faint)]">
            {card.age_label}
          </span>
        ) : null}
      </div>

      {/* Reason line */}
      <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-[color:var(--v2-muted)]">
        {card.unread_count != null && card.unread_count > 1 ? (
          <Pill tone="info" variant="soft" className="mr-1.5 align-middle">
            {card.unread_count}
          </Pill>
        ) : null}
        {card.reason}
      </p>

      {/* Mini signal — adherence bar (roster lanes) */}
      {card.adherence_pct != null ? (
        <div className="mt-2">
          <AdherenceBar pct={card.adherence_pct} />
        </div>
      ) : null}

      {/* Actions */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {card.actions.map((a) => (
          <ActionButton key={a} action={a} athlete_id={card.athlete_id} />
        ))}
      </div>
    </div>
  );
}
