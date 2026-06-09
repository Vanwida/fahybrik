'use client';

// Card de la cola de HOY — anatomía spec §1: avatar · chip de tipo (color
// semántico error/warning/accent/tertiary) · título · contexto · acciones a
// la derecha (desktop) / debajo (móvil). Crítico = full-width + ring accent.
// Visual: docs/design/ux-redesign/mockups/01-hoy.html.

import { Link } from '@/i18n/navigation';
import type { InboxItem, InboxWeekAdjustmentItem } from '@/lib/dashboard/coach/inbox';
import { AthleteAvatar } from '@/components/dashboard/atoms/AthleteAvatar';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

// ── Shared visual atoms (tokens only) ───────────────────────────────────────

type ChipTone = 'error' | 'warning' | 'accent' | 'tertiary' | 'neutral';

const CHIP_TONE_CLASS: Record<ChipTone, string> = {
  error: 'text-[color:var(--danger)] bg-[color:color-mix(in_srgb,var(--danger)_12%,transparent)]',
  warning:
    'text-[color:var(--warning)] bg-[color:color-mix(in_srgb,var(--warning)_12%,transparent)]',
  accent: 'text-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]',
  tertiary:
    'text-[color:var(--tertiary)] bg-[color:color-mix(in_srgb,var(--tertiary)_12%,transparent)]',
  neutral:
    'text-[color:var(--text-muted)] bg-[color:var(--surface-container)] border border-[color:var(--border-subtle)]',
};

function TypeChip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-[var(--r-s)] px-2 py-[3px]',
        'text-[10px] font-bold uppercase tracking-[0.08em]',
        CHIP_TONE_CLASS[tone],
      )}
    >
      {children}
    </span>
  );
}

const BTN_BASE =
  'focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-m)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors';
export const BTN_PRIMARY = cn(
  BTN_BASE,
  'bg-[color:var(--accent)] text-[color:var(--accent-on)] hover:bg-[color:var(--accent-press)]',
);
export const BTN_SECONDARY = cn(
  BTN_BASE,
  'border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] text-[color:var(--fg)] hover:bg-[color:var(--surface-container-high)]',
);
export const BTN_GHOST = cn(
  BTN_BASE,
  'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container)] hover:text-[color:var(--fg)]',
);
export const BTN_APPROVE = cn(
  BTN_BASE,
  'border border-[color:color-mix(in_srgb,var(--ok)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--ok)_14%,var(--surface-container))] text-[color:var(--ok)] hover:bg-[color:color-mix(in_srgb,var(--ok)_24%,var(--surface-container))]',
);

// ── Formatting helpers ───────────────────────────────────────────────────────

const DAY_MONTH = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

function dayMonthLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return DAY_MONTH.format(new Date(Date.UTC(y!, m! - 1, d!))).replace(/\.$/, '');
}

/** "Semana 12–18 jun" from the Monday ISO date. */
function weekRangeLabel(weekStartIso: string): string {
  const [y, m, d] = weekStartIso.split('-').map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, d!));
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startLabel = sameMonth ? String(start.getUTCDate()) : dayMonthLabel(weekStartIso);
  return `Semana ${startLabel}–${DAY_MONTH.format(end).replace(/\.$/, '')}`;
}

function hoursLabel(hours: number): string {
  if (hours < 24 * 3) return `${hours} h`;
  return `${Math.floor(hours / 24)} días`;
}

function messageTimeLabel(iso: string | null): string {
  if (!iso) return '';
  // Postgres `timestamptz::text` llega con espacio ("2026-06-09 07:42:13+00");
  // normalizar a ISO para que Safari también lo parsee.
  const t = new Date(iso.replace(' ', 'T'));
  if (!Number.isFinite(t.getTime())) return '';
  const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(t);
  const isToday = new Date().toDateString() === t.toDateString();
  return isToday ? `hoy · ${time}` : `${DAY_MONTH.format(t).replace(/\.$/, '')} · ${time}`;
}

// ── Per-type content ─────────────────────────────────────────────────────────

function DiffTable({ item }: { item: InboxWeekAdjustmentItem }) {
  if (item.diff_rows.length === 0) return null;
  return (
    <div className="mt-3">
      <table className="w-full overflow-hidden rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] text-[12.5px]">
        <caption className="micro-label px-3 pt-2 text-left">
          {weekRangeLabel(item.week_start)}
        </caption>
        <thead>
          <tr className="bg-[color:var(--surface-container-low)]">
            <th scope="col" className="micro-label px-3 py-1.5 text-left font-bold">
              Día
            </th>
            <th scope="col" className="micro-label px-3 py-1.5 text-left font-bold">
              Antes
            </th>
            <th scope="col" className="micro-label px-3 py-1.5 text-left font-bold">
              Propuesto
            </th>
          </tr>
        </thead>
        <tbody>
          {item.diff_rows.map((row) => (
            <tr
              key={`${row.day_label}-${row.after}`}
              className="border-t border-[color:var(--border-subtle)]"
            >
              <td className="metric-num w-[52px] px-3 py-2 align-top text-[11px] font-semibold uppercase text-[color:var(--text-muted)]">
                {row.day_label}
              </td>
              <td className="px-3 py-2 align-top text-[color:var(--text-muted)] line-through decoration-[color:color-mix(in_srgb,var(--text-muted)_55%,transparent)]">
                {row.before}
              </td>
              <td className="px-3 py-2 align-top font-medium text-[color:var(--fg)]">{row.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {item.extra_change_count > 0 ? (
        <Link
          href={`/atletas/${item.athlete_id}/plan?focus=review`}
          className="focus-ring mt-2 inline-flex items-center gap-1 rounded-[var(--r-s)] px-1 py-0.5 text-xs font-semibold text-[color:var(--text-muted)] hover:text-[color:var(--accent)]"
        >
          <MIcon name="unfold_more" size={14} />
          +{item.extra_change_count} cambio{item.extra_change_count === 1 ? '' : 's'} más
        </Link>
      ) : null}
    </div>
  );
}

function CardBody({ item }: { item: InboxItem }) {
  switch (item.type) {
    case 'intake_pending':
      return (
        <>
          <h3
            className={cn(
              'mb-1 text-[15px] font-medium',
              item.severity === 'critical'
                ? 'font-semibold text-[color:var(--accent)]'
                : 'text-[color:var(--fg)]',
            )}
          >
            Terminó el onboarding hace {hoursLabel(item.hours_since_onboarded)} y sigue sin plan
          </h3>
          <p className="max-w-[56ch] text-[13.5px] leading-relaxed text-[color:var(--text-muted)]">
            Revisa su intake para cerrar el handoff y asignarle el primer microciclo.
          </p>
        </>
      );
    case 'week_adjustment':
      return (
        <>
          <h3 className="mb-1 text-[15px] font-medium text-[color:var(--fg)]">{item.title}</h3>
          <p className="max-w-[56ch] text-[13.5px] leading-relaxed text-[color:var(--text-muted)]">
            {item.summary}
          </p>
          <DiffTable item={item} />
        </>
      );
    case 'monthly_block':
      return (
        <>
          <h3 className="mb-1 text-[15px] font-medium text-[color:var(--fg)]">
            Nuevo mes propuesto:{' '}
            <strong className="font-semibold text-[color:var(--fg)]">{item.month_name}</strong>
          </h3>
          <p className="max-w-[56ch] text-[13.5px] leading-relaxed text-[color:var(--text-muted)]">
            {item.rationale ? `${item.rationale} · ` : ''}Inicio: lunes{' '}
            <span className="metric-num text-[color:var(--fg)]">
              {dayMonthLabel(item.proposed_start_date)}
            </span>
            .
          </p>
        </>
      );
    case 'alert_inactivity':
      return (
        <>
          <h3 className="mb-1 text-[15px] font-medium text-[color:var(--fg)]">
            {item.days_inactive} día{item.days_inactive === 1 ? '' : 's'} sin actividad ni check-in
          </h3>
          <p className="max-w-[56ch] text-[13.5px] leading-relaxed text-[color:var(--text-muted)]">
            {item.last_session_label ? (
              <>Última sesión completada: {item.last_session_label}. </>
            ) : null}
            {item.race_name && item.race_days != null ? (
              <>
                Tiene {item.race_name} en{' '}
                <span className="metric-num text-[color:var(--fg)]">{item.race_days} días</span>.
              </>
            ) : null}
          </p>
        </>
      );
    case 'alert_payment_failed':
      return (
        <>
          <h3 className="mb-1 text-[15px] font-medium text-[color:var(--fg)]">
            Pago fallido en su suscripción
          </h3>
          <p className="max-w-[56ch] text-[13.5px] leading-relaxed text-[color:var(--text-muted)]">
            El último cobro no se completó. Revisa el estado de la suscripción en su ficha.
          </p>
        </>
      );
    case 'alert_renewal':
      return (
        <>
          <h3 className="mb-1 text-[15px] font-medium text-[color:var(--fg)]">
            Su suscripción termina en{' '}
            <span className="metric-num">{item.days_to_period_end}</span> día
            {item.days_to_period_end === 1 ? '' : 's'}
          </h3>
          <p className="max-w-[56ch] text-[13.5px] leading-relaxed text-[color:var(--text-muted)]">
            No se renovará automáticamente. Habla con el atleta si quieres que continúe.
          </p>
        </>
      );
    case 'message':
      return (
        <blockquote className="mt-1 max-w-[56ch] rounded-r-[var(--r-m)] border-l-2 border-[color:var(--tertiary)] bg-[color:var(--surface-container-lowest)] px-4 py-3 text-[13.5px] italic leading-relaxed text-[color:var(--fg)]">
          “{item.preview ?? 'Nuevo mensaje'}”
          <span className="metric-num mt-2 block text-[11px] not-italic text-[color:var(--text-muted)]">
            {messageTimeLabel(item.last_message_at)}
          </span>
        </blockquote>
      );
  }
}

function cardChip(item: InboxItem): { tone: ChipTone; label: string } {
  switch (item.type) {
    case 'intake_pending':
      return {
        tone: item.severity === 'critical' ? 'error' : 'accent',
        label: `Intake · ${hoursLabel(item.hours_since_onboarded)}`,
      };
    case 'week_adjustment':
      return { tone: 'accent', label: 'Ajuste semanal' };
    case 'monthly_block':
      return { tone: 'tertiary', label: 'Transición de bloque' };
    case 'alert_inactivity':
      return { tone: 'warning', label: 'Inactividad' };
    case 'alert_payment_failed':
      return { tone: 'error', label: 'Pago fallido' };
    case 'alert_renewal':
      return { tone: 'warning', label: 'Renovación' };
    case 'message':
      return { tone: 'tertiary', label: 'Mensaje' };
  }
}

// ── Actions column ───────────────────────────────────────────────────────────

interface CardActionsProps {
  item: InboxItem;
  onApprove: (item: InboxItem) => void;
  onPostpone: (item: InboxItem) => void;
}

function CardActions({ item, onApprove, onPostpone }: CardActionsProps) {
  const ficha = `/atletas/${item.athlete_id}`;
  const planReview = `/atletas/${item.athlete_id}/plan?focus=review`;

  switch (item.type) {
    case 'intake_pending':
      return (
        <>
          <Link href={`/atletas/${item.athlete_id}/intake`} className={BTN_PRIMARY}>
            <MIcon name="assignment_ind" size={15} />
            Revisar intake
          </Link>
          <Link href={ficha} className={BTN_SECONDARY}>
            Ver ficha
          </Link>
        </>
      );
    case 'week_adjustment':
      return (
        <>
          <button type="button" className={BTN_APPROVE} onClick={() => onApprove(item)}>
            <MIcon name="check" size={15} />
            Aprobar
          </button>
          <Link href={planReview} className={BTN_SECONDARY}>
            Ajustar
          </Link>
          <button type="button" className={BTN_GHOST} onClick={() => onPostpone(item)}>
            Posponer
          </button>
        </>
      );
    case 'monthly_block':
      return (
        <>
          <button type="button" className={BTN_APPROVE} onClick={() => onApprove(item)}>
            <MIcon name="check" size={15} />
            Aprobar
          </button>
          <Link href={planReview} className={BTN_SECONDARY}>
            Revisar
          </Link>
        </>
      );
    case 'alert_inactivity':
    case 'alert_payment_failed':
    case 'alert_renewal':
      return (
        <Link href={ficha} className={BTN_SECONDARY}>
          <MIcon name="person" size={15} />
          Abrir atleta
        </Link>
      );
    case 'message':
      return (
        <Link href={ficha} className={BTN_SECONDARY}>
          <MIcon name="reply" size={15} />
          Responder
        </Link>
      );
  }
}

// ── Card shell ───────────────────────────────────────────────────────────────

export interface InboxItemCardProps extends CardActionsProps {
  /** Inline failure banner ("No se pudo aprobar — reintentar"), set by the queue. */
  error_message?: string | null;
  onRetry?: (item: InboxItem) => void;
}

export function InboxItemCard({
  item,
  onApprove,
  onPostpone,
  error_message,
  onRetry,
}: InboxItemCardProps) {
  const critical = item.severity === 'critical';
  const chip = cardChip(item);

  return (
    <article
      className={cn(
        'card-elevated relative overflow-hidden p-6',
        critical &&
          'border-[color:var(--accent)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent),0_1px_0_rgba(255,255,255,0.04)_inset,0_12px_28px_-12px_rgba(0,0,0,0.7)] hover:border-[color:var(--accent)]',
      )}
      aria-label={`${chip.label} — ${item.athlete_name}`}
    >
      {critical ? (
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-[color:color-mix(in_srgb,var(--accent)_6%,transparent)]"
        />
      ) : null}

      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex min-w-0 flex-1 gap-4">
          <AthleteAvatar
            name={item.athlete_name}
            size="sm"
            variant={critical ? 'critical' : 'default'}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-[color:var(--fg)]">
                {item.athlete_name}
              </span>
              <TypeChip tone={chip.tone}>{chip.label}</TypeChip>
              {item.type === 'intake_pending' && item.a_event_name ? (
                <TypeChip tone="neutral">
                  <MIcon name="flag" size={12} />
                  {item.a_event_name}
                  {item.a_event_days != null ? (
                    <span className="metric-num"> · {item.a_event_days} d</span>
                  ) : null}
                </TypeChip>
              ) : null}
            </div>
            <CardBody item={item} />
            {error_message ? (
              <div
                role="alert"
                className="mt-3 flex flex-wrap items-center gap-3 rounded-[var(--r-m)] border border-[color:color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-[12.5px] text-[color:var(--danger)]"
              >
                <span>{error_message}</span>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={() => onRetry(item)}
                    className="focus-ring rounded-[var(--r-s)] px-1 text-[11px] font-bold uppercase tracking-[0.08em] underline underline-offset-2"
                  >
                    Reintentar
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            'flex shrink-0 flex-wrap gap-2 border-t border-[color:var(--border-subtle)] pt-4',
            'md:min-w-[164px] md:flex-col md:border-t-0 md:pt-0',
            critical && 'md:justify-center',
          )}
        >
          <CardActions item={item} onApprove={onApprove} onPostpone={onPostpone} />
        </div>
      </div>
    </article>
  );
}
