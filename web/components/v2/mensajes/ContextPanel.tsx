// ContextPanel — the right column (248px) of the Mensajes screen. Keeps the
// active athlete's training context one glance away while the coach replies:
// a status/phase "context" card, two KPI tiles (adherencia 30d · readiness), and
// quick actions (ver plan / ver ficha / reprogramar). All data is REAL, projected
// from the roster row server-side; when the athlete isn't in the roster load the
// panel shows a calm fallback instead of fabricating numbers.

'use client';

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Card } from '@/components/v2/Card';
import { Pill } from '@/components/v2/Pill';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { StatusDot } from '@/components/v2/StatusDot';
import { StatTile } from '@/components/v2/StatTile';
import type { MensajesThread } from '@/lib/dashboard/v2/mensajes-types';
import { cn } from '@/lib/utils';

const ATHLETE_ROUTE = '/atletas';

export function ContextPanel({
  thread,
  onReprogram,
}: {
  thread: MensajesThread | null;
  /** Optional hook for the "Reprogramar" action; falls back to the plan link. */
  onReprogram?: () => void;
}) {
  if (!thread) {
    return (
      <aside className="hidden h-full min-h-0 flex-col border-l border-[color:var(--v2-border)] xl:flex">
        <PanelHeader />
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-[20rem] text-balance text-center text-xs leading-relaxed text-[color:var(--v2-muted)]">
            Selecciona una conversación para ver el contexto del atleta.
          </p>
        </div>
      </aside>
    );
  }

  const ctx = thread.context;

  return (
    <aside className="hidden h-full min-h-0 flex-col border-l border-[color:var(--v2-border)] xl:flex">
      <PanelHeader />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Athlete identity */}
        <div className="flex flex-wrap items-center gap-2">
          {ctx ? <LevelBadge level={ctx.level} /> : null}
          {ctx ? <StatusDot status={ctx.status} showLabel /> : null}
        </div>

        {/* Sesión de hoy / fase actual */}
        <section>
          <h4 className="v2-micro mb-1.5">Sesión de hoy</h4>
          <Card className="p-3">
            {ctx?.phase_label ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
                    {ctx.phase_label}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--v2-muted)]">
                  Fase actual del microciclo del atleta.
                </p>
                {/* TODO(endpoint): surface the literal session scheduled for today
                    (name · modalidad · min · estado). The per-day session loader
                    (program-months) isn't joined into the chat context yet — the
                    plan link below opens where that data lives. */}
              </>
            ) : (
              <p className="text-xs leading-relaxed text-[color:var(--v2-muted)]">
                Sin plan activo esta semana.
              </p>
            )}
          </Card>
          {ctx?.alert_label ? (
            <div className="mt-2">
              <Pill tone="warn" variant="soft">
                <MIcon name="warning" size={13} />
                {ctx.alert_label}
              </Pill>
            </div>
          ) : null}
        </section>

        {/* KPI tiles */}
        <section className="grid grid-cols-2 gap-3">
          <Card className="p-3">
            <StatTile
              label="Adher. 30d"
              tone={adherTone(ctx?.adherence_pct ?? null)}
              value={ctx?.adherence_pct != null ? `${ctx.adherence_pct}%` : '—'}
            />
          </Card>
          <Card className="p-3">
            <StatTile
              label="Readiness"
              tone={readinessTone(ctx?.readiness_score ?? null)}
              value={ctx?.readiness_score != null ? `${ctx.readiness_score}` : '—'}
            />
          </Card>
        </section>

        {/* Actions */}
        <section className="space-y-2">
          <h4 className="v2-micro mb-0.5">Acciones</h4>
          <ActionLink
            href={`${ATHLETE_ROUTE}/${thread.athlete_id}?tab=plan`}
            icon="calendar_month"
            label="Ver plan"
          />
          <ActionLink
            href={`${ATHLETE_ROUTE}/${thread.athlete_id}`}
            icon="person"
            label="Ver ficha"
          />
          <ActionButton
            icon="event_repeat"
            label="Reprogramar"
            onClick={onReprogram}
            href={onReprogram ? undefined : `${ATHLETE_ROUTE}/${thread.athlete_id}?tab=plan`}
          />
        </section>
      </div>
    </aside>
  );
}

function PanelHeader() {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--v2-border)] px-4 py-3">
      <MIcon name="info" size={16} className="text-[color:var(--v2-faint)]" />
      <span className="v2-micro">Contexto</span>
    </div>
  );
}

const ACTION_BASE =
  'v2-focus flex w-full items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:bg-[color:var(--v2-surface-2)]';

function ActionLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link href={href} className={ACTION_BASE}>
      <MIcon name={icon} size={16} className="text-[color:var(--v2-muted)]" />
      {label}
      <MIcon name="chevron_right" size={16} className="ml-auto text-[color:var(--v2-faint)]" />
    </Link>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  href,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  if (href) {
    return <ActionLink href={href} icon={icon} label={label} />;
  }
  return (
    <button type="button" onClick={onClick} className={cn(ACTION_BASE)}>
      <MIcon name={icon} size={16} className="text-[color:var(--v2-muted)]" />
      {label}
      <MIcon name="chevron_right" size={16} className="ml-auto text-[color:var(--v2-faint)]" />
    </button>
  );
}

// ── Tone helpers (color is paired with the numeric value, never alone) ──────────

function adherTone(pct: number | null): 'fg' | 'ok' | 'warn' | 'danger' {
  if (pct == null) return 'fg';
  if (pct >= 75) return 'ok';
  if (pct >= 60) return 'warn';
  return 'danger';
}

function readinessTone(score: number | null): 'fg' | 'ok' | 'warn' | 'danger' {
  if (score == null) return 'fg';
  if (score >= 55) return 'ok';
  if (score >= 45) return 'warn';
  return 'danger';
}
