import type { AthleteSubscriptionStatus } from '@/lib/dashboard/coach/subscription-status';
import type {
  SubscriptionPlanType,
  SubscriptionStatus,
} from '@fahybrid/shared/schema/_primitives';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

interface SubscriptionStatusCardProps {
  subscription: AthleteSubscriptionStatus | null;
}

const PLAN_LABEL: Record<SubscriptionPlanType, string> = {
  individual: 'Individual',
  dobles: 'Dobles',
  pro_elite: 'Pro',
};

type BadgeTone = 'success' | 'warning' | 'danger' | 'info';

interface StatusMeta {
  label: string;
  tone: BadgeTone;
}

const STATUS_META: Record<SubscriptionStatus, StatusMeta> = {
  active: { label: 'Activa', tone: 'success' },
  trialing: { label: 'Trial', tone: 'info' },
  past_due: { label: 'Pago pendiente', tone: 'warning' },
  incomplete: { label: 'Pago pendiente', tone: 'warning' },
  canceled: { label: 'Cancelada', tone: 'danger' },
};

// Token-driven badge colors. Uses color-mix over surface for a tinted chip.
const TONE_CLASS: Record<BadgeTone, string> = {
  success:
    'border-[color:color-mix(in_srgb,var(--status-success)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--status-success)_14%,transparent)] text-[color:var(--status-success)]',
  warning:
    'border-[color:color-mix(in_srgb,var(--status-warning)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--status-warning)_14%,transparent)] text-[color:var(--status-warning)]',
  danger:
    'border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_14%,transparent)] text-[color:var(--danger)]',
  info: 'border-[color:color-mix(in_srgb,var(--tertiary)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--tertiary)_14%,transparent)] text-[color:var(--tertiary)]',
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function SubscriptionStatusCard({ subscription }: SubscriptionStatusCardProps) {
  return (
    <article className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
          Suscripción
        </h3>
        <MIcon name="payments" size={20} className="text-[color:var(--text-muted)]" />
      </div>

      {subscription == null ? (
        <p className="text-sm text-[color:var(--text-muted)]">Sin suscripción activa aún.</p>
      ) : (
        <SubscriptionBody subscription={subscription} />
      )}
    </article>
  );
}

function SubscriptionBody({ subscription }: { subscription: AthleteSubscriptionStatus }) {
  const meta = STATUS_META[subscription.status];
  const planLabel = PLAN_LABEL[subscription.plan_type];
  const renewIso = formatDate(subscription.current_period_end);
  const cancels = subscription.cancel_at_period_end && subscription.status !== 'canceled';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-[var(--r-pill)] border px-2.5 py-1',
            'text-[10px] font-bold uppercase tracking-[0.08em]',
            TONE_CLASS[meta.tone],
          )}
        >
          {meta.label}
        </span>
        <span className="text-sm font-semibold text-[color:var(--fg)]">{planLabel}</span>
        {subscription.is_partner ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
            · Pareja
          </span>
        ) : null}
      </div>

      {cancels && renewIso ? (
        <p className="text-xs text-[color:var(--danger)]">Cancela el {renewIso}</p>
      ) : renewIso && subscription.status !== 'canceled' ? (
        <p className="text-xs text-[color:var(--text-muted)]">
          Próximo cobro · <span className="text-[color:var(--fg)]">{renewIso}</span>
        </p>
      ) : null}
    </div>
  );
}
