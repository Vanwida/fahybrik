import type { TrendsBlock } from '@/lib/coach/deep-dive-types';
import {
  Sparkline,
  SleepBars,
  ComplianceStrip,
  CtlAtlChart,
  ZoneTimeBar,
} from './Trend';

interface TrendSparklinesProps {
  trends: TrendsBlock;
}

export function TrendSparklines({ trends }: TrendSparklinesProps) {
  const last = trends.ctl_atl_tsb[trends.ctl_atl_tsb.length - 1];
  const ctlLabel = last ? `CTL ${last.ctl} · TSB ${last.tsb >= 0 ? '+' : ''}${last.tsb}` : '—';

  return (
    <section
      aria-label="Tendencias últimos 30 días"
      className="rounded-[var(--r-l)] border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-3"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
          Tendencias · últ. 30d
        </h3>
        <Legend />
      </header>

      <ul className="mt-3 flex flex-col gap-3">
        <TrendRow label="CTL/ATL/TSB" right={ctlLabel}>
          <CtlAtlChart points={trends.ctl_atl_tsb} />
        </TrendRow>

        <TrendRow
          label="HRV"
          right={trends.hrv_baseline_ms != null ? `baseline ${trends.hrv_baseline_ms} ms` : '—'}
        >
          <Sparkline points={trends.hrv} baseline={trends.hrv_baseline_ms ?? null} ariaLabel="HRV 30d" />
        </TrendRow>

        <TrendRow
          label="Sleep"
          right={trends.sleep_avg_h != null ? `avg ${formatHours(trends.sleep_avg_h)}` : '—'}
        >
          <SleepBars points={trends.sleep} />
        </TrendRow>

        <TrendRow
          label="Compliance"
          right={trends.compliance_pct != null
            ? `${trends.compliance_pct}% (${trends.compliance_done}/${trends.compliance_total})`
            : '—'}
        >
          <ComplianceStrip points={trends.compliance} />
        </TrendRow>

        <TrendRow
          label="Zone time"
          right={`Z2 ${trends.zone_time.z2} · Z3 ${trends.zone_time.z3} · Z4 ${trends.zone_time.z4} · Z5 ${trends.zone_time.z5}`}
        >
          <div className="flex h-8 items-center">
            <ZoneTimeBar {...trends.zone_time} />
          </div>
        </TrendRow>
      </ul>
    </section>
  );
}

function TrendRow({
  label,
  right,
  children,
}: {
  label: string;
  right: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[120px_1fr_auto] items-center gap-3 text-[12px]">
      <span className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)]">{label}</span>
      <span className="block">{children}</span>
      <span className="font-mono tabular-nums text-[11px] text-[color:var(--muted)]">{right}</span>
    </li>
  );
}

function Legend() {
  return (
    <span aria-hidden className="hidden items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)] sm:flex">
      <Dot color="var(--accent)" /> CTL
      <Dot color="var(--warning)" /> ATL
      <Dot color="var(--muted)" /> TSB
    </span>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-1.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

function formatHours(h: number): string {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h${String(minutes).padStart(2, '0')}`;
}
