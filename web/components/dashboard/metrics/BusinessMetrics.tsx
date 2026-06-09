import type { BusinessMetrics as BusinessMetricsData } from '@/lib/dashboard/coach/business-metrics';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

interface BusinessMetricsProps {
  metrics: BusinessMetricsData;
}

const EUR = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

type StatTone = 'accent' | 'neutral' | 'warning';

interface StatCardProps {
  label: string;
  value: string;
  caption?: string;
  icon: string;
  tone?: StatTone;
}

const TONE_ICON: Record<StatTone, string> = {
  accent: 'text-[color:var(--accent)]',
  neutral: 'text-[color:var(--text-muted)]',
  warning: 'text-[color:var(--status-warning)]',
};

function StatCard({ label, value, caption, icon, tone = 'neutral' }: StatCardProps) {
  return (
    <article className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-5">
      <div className="mb-4 flex items-start justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
          {label}
        </h3>
        <MIcon name={icon} size={20} className={TONE_ICON[tone]} />
      </div>
      <p className="font-display-xl leading-none text-[color:var(--fg)]">{value}</p>
      {caption ? (
        <p className="mt-3 text-xs text-[color:var(--text-muted)]">{caption}</p>
      ) : null}
    </article>
  );
}

export function BusinessMetrics({ metrics }: BusinessMetricsProps) {
  if (metrics.is_empty) {
    return (
      <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-10 text-center">
        <MIcon name="payments" size={32} className="text-[color:var(--text-muted)]" />
        <p className="mt-3 font-headline-md text-[color:var(--fg)]">
          Sin suscripciones activas aún
        </p>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">
          Las métricas de negocio aparecerán cuando se registren las primeras suscripciones.
        </p>
      </div>
    );
  }

  const churnCaption =
    metrics.churn_pct == null
      ? 'Sin base de cálculo este mes'
      : `${metrics.canceled_this_month} cancelada${metrics.canceled_this_month === 1 ? '' : 's'} de ${metrics.active_at_month_start} activas a inicio de mes`;

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-1 gap-[var(--gutter)] sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="MRR"
          value={EUR.format(metrics.mrr_eur)}
          caption={`${metrics.active_count} suscripción${metrics.active_count === 1 ? '' : 'es'} activa${metrics.active_count === 1 ? '' : 's'}`}
          icon="payments"
          tone="accent"
        />
        <StatCard
          label="Churn mensual"
          value={metrics.churn_pct == null ? '—' : `${metrics.churn_pct}%`}
          caption={churnCaption}
          icon="trending_down"
          tone={metrics.churn_pct != null && metrics.churn_pct > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Altas este mes"
          value={String(metrics.new_this_month)}
          caption="Nuevas suscripciones en el mes actual"
          icon="person_add"
        />
        <StatCard
          label="Renovaciones · 30d"
          value={String(metrics.renewals_next_30d)}
          caption="Cobros previstos en los próximos 30 días"
          icon="event_repeat"
        />
      </section>

      <section>
        <h2 className="mb-4 border-b border-[color:var(--border-subtle)] pb-2 font-heading uppercase text-[color:var(--fg)]">
          Desglose por modalidad
        </h2>
        <div className="grid grid-cols-1 gap-[var(--gutter)] sm:grid-cols-3">
          {metrics.breakdown.map((entry) => (
            <article
              key={entry.plan_type}
              className={cn(
                'rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-5',
                entry.count === 0 ? 'opacity-60' : null,
              )}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                  {entry.label}
                </h3>
                <span className="text-xs text-[color:var(--text-muted)]">
                  {EUR.format(entry.mrr_eur)} MRR
                </span>
              </div>
              <p className="mt-3 font-display-xl leading-none text-[color:var(--fg)]">
                {entry.count}
              </p>
              <p className="mt-2 text-xs text-[color:var(--text-muted)]">
                activo{entry.count === 1 ? '' : 's'}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
