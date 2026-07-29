'use client';

// InjuryPanel (#16) — the coach's injury surface in the ficha (Perfil tab). Shows the
// athlete's OPEN injuries as full cards (zone + status + severity, the evolution
// timeline, and the coach actions: add evolution, transition per the state machine,
// adapt sessions, and — for a severe / long layoff — suggest pausing the plan) plus a
// quiet histórico of resolved episodes. Reads the live coach endpoints via useInjuries;
// all writes are server-validated. The injury is the thread that connects the check-in,
// the 1:1 report and the pause flow — this panel links out to them, never duplicates.

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { Panel } from '../parts';
import { todayIsoLocal } from '../lifecycle/lifecycle-ui';
import type { DetalleLifecycle } from '@/lib/dashboard/v2/atleta-detalle-types';
import type { AthletePlanPayload } from '@/lib/dashboard/coach/athlete-plan';
import type { InjuryDTO } from '@fahybrid/shared/schema/injuries';
import {
  INJURY_ZONE_LABEL,
  type InjuryStatus,
} from '@fahybrid/shared/domain/coach/injury-taxonomy';
import { cn } from '@/lib/utils';
import { useInjuries } from './use-injuries';
import {
  buildTimeline,
  formatInjuryDate,
  severityMeta,
  sinceOnset,
  statusMeta,
  suggestsPause,
  toneColorVar,
  transitionsFor,
  type InjuryTimelineEntry,
} from './injury-presentation';
import {
  AdaptSessionsDialog,
  InjuryPauseDialog,
  InjuryUpdateDialog,
  RegisterInjuryDialog,
  type AdaptableSession,
} from './injury-dialogs';

const BY_LABEL: Record<'athlete' | 'coach', string> = { athlete: 'Atleta', coach: 'Coach' };

/** "Rodilla · tendinitis rotuliana" — canonical zone label + the coach's free-text type. */
function zoneAndTypeLabel(injury: InjuryDTO): string {
  const zone = INJURY_ZONE_LABEL[injury.zone];
  return injury.type ? `${zone} · ${injury.type}` : zone;
}

type DialogState =
  | { kind: 'register' }
  | { kind: 'update'; injury: InjuryDTO; target: InjuryStatus | null }
  | { kind: 'adapt'; injury: InjuryDTO }
  | { kind: 'pause'; injury: InjuryDTO }
  | null;

/** Upcoming, still-scheduled coach sessions from the loaded plan — what a coach adapts. */
function flattenAdaptable(plan: AthletePlanPayload | null): AdaptableSession[] {
  if (!plan) return [];
  const today = todayIsoLocal();
  const out: AdaptableSession[] = [];
  for (const week of plan.weeks) {
    for (const day of week.days) {
      for (const s of day.sessions) {
        if (s.status !== 'scheduled' || s.iso_date < today) continue;
        out.push({
          assignment_id: s.assignment_id,
          iso_date: s.iso_date,
          title: s.title,
          date_label: dateLabel(s.iso_date),
        });
      }
    }
  }
  return out;
}

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return dt
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '');
}

// ── Timeline ────────────────────────────────────────────────────────────────────
function Timeline({ entries }: { entries: InjuryTimelineEntry[] }) {
  return (
    <ol className="mt-3 flex flex-col gap-2.5 border-l border-[color:var(--v2-border-strong)] pl-3.5">
      {entries.map((e) => (
        <li key={e.key} className="relative">
          <span
            aria-hidden
            className="absolute -left-[18px] top-1 h-2 w-2 rounded-full"
            style={{ background: 'var(--v2-accent)' }}
          />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="v2-num text-label font-semibold text-[color:var(--v2-faint)]">
              {formatInjuryDate(e.at)} · {BY_LABEL[e.by]}
            </span>
            {e.kind === 'created' ? (
              <Pill tone="neutral" className="px-1.5 py-0 text-eyebrow">
                registrada
              </Pill>
            ) : null}
            {e.status ? (
              <Pill tone={statusMeta(e.status).tone} variant="soft" className="px-1.5 py-0 text-eyebrow">
                → {statusMeta(e.status).label}
              </Pill>
            ) : null}
          </div>
          {e.note ? (
            <p className="mt-0.5 text-xs leading-snug text-[color:var(--v2-muted)]">{e.note}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────────
function CardButton({
  icon,
  label,
  onClick,
  variant = 'ghost',
  colorVar,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  variant?: 'ghost' | 'accent' | 'toned';
  colorVar?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border px-2.5 text-xs font-semibold transition-colors',
        variant === 'accent'
          ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]'
          : variant === 'toned'
            ? 'border-[color:var(--v2-border)] hover:border-[color:var(--v2-border-strong)]'
            : 'border-[color:var(--v2-border)] text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
      )}
      style={variant === 'toned' && colorVar ? { color: `var(${colorVar})` } : undefined}
    >
      <MIcon name={icon} size={15} />
      {label}
    </button>
  );
}

// ── Open injury card ────────────────────────────────────────────────────────────
function OpenInjuryCard({
  injury,
  athleteId,
  showPause,
  onAction,
}: {
  injury: InjuryDTO;
  athleteId: string;
  showPause: boolean;
  onAction: (d: DialogState) => void;
}) {
  const status = statusMeta(injury.status);
  const severity = severityMeta(injury.severity);
  const meta = [
    severity.label,
    sinceOnset(injury.onset_date),
    injury.expected_return ? `retorno est. ${formatInjuryDate(injury.expected_return)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const timeline = buildTimeline(injury);

  return (
    <div
      className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3.5"
      style={{ borderLeft: `3px solid var(${toneColorVar(status.tone)})` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-[color:var(--v2-fg)]">
              {zoneAndTypeLabel(injury)}
            </span>
            <Pill tone={status.tone} variant="soft">
              {status.label}
            </Pill>
            <Pill tone={severity.tone} variant="outline" className="px-1.5 py-0">
              {severity.label}
            </Pill>
          </div>
          <p className="v2-num mt-1 text-label text-[color:var(--v2-muted)]">{meta}</p>
        </div>
      </div>

      <Timeline entries={timeline} />

      <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
        {transitionsFor(injury.status).map((t) => (
          <CardButton
            key={t.to}
            icon={t.icon}
            label={t.label}
            variant="toned"
            colorVar={toneColorVar(t.tone)}
            onClick={() => onAction({ kind: 'update', injury, target: t.to })}
          />
        ))}
        <CardButton
          icon="add_comment"
          label="Añadir evolución"
          onClick={() => onAction({ kind: 'update', injury, target: null })}
        />
        <CardButton
          icon="tune"
          label="Adaptar sesiones"
          variant="accent"
          onClick={() => onAction({ kind: 'adapt', injury })}
        />
        {showPause ? (
          <CardButton
            icon="pause_circle"
            label="Pausar plan"
            onClick={() => onAction({ kind: 'pause', injury })}
          />
        ) : null}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[color:var(--v2-border)] pt-2.5">
        <p className="text-label leading-snug text-[color:var(--v2-faint)]">
          Las sesiones adaptadas no cuentan como fallo de adherencia.
        </p>
        <Link
          href={`/atletas/${athleteId}?tab=sesiones`}
          className="v2-focus inline-flex shrink-0 items-center gap-1 text-label font-semibold text-[color:var(--v2-accent)]"
        >
          <MIcon name="north_east" size={13} /> Ver 1:1
        </Link>
      </div>
    </div>
  );
}

// ── Resolved (histórico) row ──────────────────────────────────────────────────────
function ResolvedRow({ injury }: { injury: InjuryDTO }) {
  const range = [
    formatInjuryDate(injury.onset_date),
    injury.resolved_date ? formatInjuryDate(injury.resolved_date) : null,
  ]
    .filter(Boolean)
    .join(' → ');
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] px-3 py-2">
      <div className="min-w-0">
        <span className="truncate text-body font-semibold text-[color:var(--v2-fg)]">
          {zoneAndTypeLabel(injury)}
        </span>
        <span className="v2-num ml-2 text-label text-[color:var(--v2-faint)]">{range}</span>
      </div>
      <Pill tone="ok" variant="soft" className="shrink-0">
        {severityMeta(injury.severity).label}
      </Pill>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────────
export function InjuryPanel({
  athleteId,
  lifecycle,
  plan,
}: {
  athleteId: string;
  lifecycle: DetalleLifecycle;
  plan: AthletePlanPayload | null;
}) {
  const { injuries, loading, loadError, reload, create, update, adapt } = useInjuries(athleteId);
  const [dialog, setDialog] = useState<DialogState>(null);

  const adaptable = flattenAdaptable(plan);
  const isActivo = lifecycle.status === 'activo';

  const open = (injuries ?? []).filter((i) => i.status !== 'resuelta');
  const resolved = (injuries ?? []).filter((i) => i.status === 'resuelta');

  return (
    <Panel
      title="Lesiones"
      action={
        <button
          type="button"
          onClick={() => setDialog({ kind: 'register' })}
          className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2.5 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
        >
          <MIcon name="add" size={14} /> Registrar
        </button>
      }
      bodyClassName="flex flex-col gap-3"
    >
      {loading ? (
        <div className="flex flex-col gap-2" aria-hidden>
          <div className="h-16 animate-pulse rounded-[var(--v2-r-m)] bg-[color:var(--v2-surface-2)]" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-start gap-2 py-2">
          <p className="text-sm text-[color:var(--v2-danger)]">{loadError}</p>
          <button
            type="button"
            onClick={() => reload()}
            className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]"
          >
            <MIcon name="refresh" size={15} /> Reintentar
          </button>
        </div>
      ) : open.length === 0 && resolved.length === 0 ? (
        <EmptyState
          icon="health_and_safety"
          title="Sin lesiones registradas"
          description="Cuando el atleta o tú registréis una lesión, aparecerá aquí con su evolución y las sesiones adaptadas."
          className="border-none py-6"
        />
      ) : (
        <>
          {open.map((injury) => (
            <OpenInjuryCard
              key={injury.id}
              injury={injury}
              athleteId={athleteId}
              showPause={isActivo && suggestsPause(injury.severity, injury.expected_return)}
              onAction={setDialog}
            />
          ))}

          {resolved.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="v2-micro">Histórico</span>
              {resolved.map((injury) => (
                <ResolvedRow key={injury.id} injury={injury} />
              ))}
            </div>
          ) : null}
        </>
      )}

      {/* Dialogs */}
      {dialog?.kind === 'register' ? (
        <RegisterInjuryDialog onClose={() => setDialog(null)} onSubmit={create} />
      ) : null}
      {dialog?.kind === 'update' ? (
        <InjuryUpdateDialog
          injury={dialog.injury}
          target={dialog.target}
          onClose={() => setDialog(null)}
          onSubmit={(input) => update(dialog.injury.id, input)}
        />
      ) : null}
      {dialog?.kind === 'adapt' ? (
        <AdaptSessionsDialog
          sessions={adaptable}
          onClose={() => setDialog(null)}
          onSubmit={(adaptations) => adapt(dialog.injury.id, adaptations)}
        />
      ) : null}
      {dialog?.kind === 'pause' ? (
        <InjuryPauseDialog
          athleteId={athleteId}
          expectedReturn={dialog.injury.expected_return}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </Panel>
  );
}
