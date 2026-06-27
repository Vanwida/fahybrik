'use client';

// LaneCard — one athlete in a triage lane. Avatar + name + level, a one-line
// reason, an optional mini adherence/readiness signal, and 1–2 action buttons.
// Actions resolve to next/link navigation (Ver → ficha, Responder/Mensaje →
// mensajes) or a real client action ("Descargar carga" → crea una propuesta de
// ajuste de semana por la vía existente). The board owns data.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  /** Builds the href for link actions; undefined → render an interactive button. */
  href?: (athlete_id: string) => string;
  primary?: boolean;
}

const ACTION_META: Record<V2LaneAction, ActionMeta> = {
  ver: { label: 'Ver', icon: 'visibility', href: (id) => `/atletas/${id}` },
  mensaje: { label: 'Mensaje', icon: 'forum', href: () => `/mensajes` },
  responder: { label: 'Responder', icon: 'reply', href: () => `/mensajes`, primary: true },
  // "Descargar carga": crea una propuesta de ajuste de semana (suavizar/descanso)
  // por el endpoint existente; el coach la revisa/aprueba en el strip de Ajuste.
  descargar_carga: { label: 'Descargar carga', icon: 'trending_down' },
};

const ACTION_BTN_CLS =
  'v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] px-2 text-[11px] font-semibold transition-colors';

function linkCls(primary?: boolean): string {
  return cn(
    ACTION_BTN_CLS,
    primary
      ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]'
      : 'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
  );
}

/**
 * "Descargar carga" → POST al endpoint EXISTENTE de propuesta de ajuste de semana.
 * Evalúa la semana del atleta y, si la fatiga/readiness lo justifica, persiste una
 * propuesta de suavizar/descanso que el coach revisa arriba (no aplica nada solo,
 * no inventa magnitud). En éxito refrescamos para que la propuesta aparezca.
 */
function DeloadButton({ athlete_id }: { athlete_id: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function run() {
    if (state === 'busy' || state === 'done') return;
    setState('busy');
    try {
      const res = await fetch(`/api/coach/athletes/${athlete_id}/week-adjustment/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (res.ok) {
        setState('done');
        router.refresh();
        return;
      }
      setState('error');
    } catch {
      setState('error');
    }
  }

  const label =
    state === 'busy'
      ? 'Creando…'
      : state === 'done'
        ? 'Propuesta creada'
        : state === 'error'
          ? 'Reintentar'
          : ACTION_META.descargar_carga.label;
  const icon = state === 'done' ? 'check_circle' : ACTION_META.descargar_carga.icon;

  return (
    <button
      type="button"
      onClick={run}
      disabled={state === 'busy' || state === 'done'}
      aria-label="Crear propuesta de descarga de carga"
      className={cn(
        ACTION_BTN_CLS,
        state === 'error'
          ? 'border border-[color:var(--v2-danger)] text-[color:var(--v2-danger)]'
          : 'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
        'disabled:opacity-60',
      )}
    >
      <MIcon name={icon} size={15} />
      {label}
    </button>
  );
}

function ActionButton({ action, athlete_id }: { action: V2LaneAction; athlete_id: string }) {
  if (action === 'descargar_carga') {
    return <DeloadButton athlete_id={athlete_id} />;
  }
  const meta = ACTION_META[action];
  const inner = (
    <>
      <MIcon name={meta.icon} size={15} />
      {meta.label}
    </>
  );
  if (meta.href) {
    return (
      <Link href={meta.href(athlete_id)} className={linkCls(meta.primary)}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={linkCls(meta.primary)}>
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
