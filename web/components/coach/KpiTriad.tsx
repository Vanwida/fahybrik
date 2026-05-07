import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type {
  KpiCarga,
  KpiCompliance,
  KpiReadiness,
} from '@/lib/coach/deep-dive-types';

interface KpiTriadProps {
  carga: KpiCarga;
  compliance: KpiCompliance;
  readiness: KpiReadiness;
}

export function KpiTriad({ carga, compliance, readiness }: KpiTriadProps) {
  return (
    <section
      aria-label="KPI principales"
      className="grid grid-cols-1 gap-3 md:grid-cols-3"
    >
      <Card title="Carga">
        <Row label="CTL" value={fmt(carga.ctl)} trend={carga.ctl_trend} />
        <Row label="ATL" value={fmt(carga.atl)} trend={carga.atl_trend} />
        <Row
          label="TSB"
          value={carga.tsb != null ? `${carga.tsb >= 0 ? '+' : ''}${fmt(carga.tsb)}` : '—'}
          hint={carga.tsb_label}
        />
        <Row
          label="ACR"
          value={carga.acr != null ? carga.acr.toFixed(2) : '—'}
          hint={carga.acr_label}
          warn={carga.acr_label === 'alto'}
        />
        <Row
          label="Z3-4 7d"
          value={carga.z34_pct_7d != null ? `${carga.z34_pct_7d}%` : '—'}
        />
        {carga.polarization_pct ? (
          <Row
            label="Pol"
            value={`${carga.polarization_pct.low}/${carga.polarization_pct.mid}/${carga.polarization_pct.high}`}
            warn={carga.polarization_warn}
          />
        ) : null}
      </Card>

      <Card title="Compliance">
        <Row
          label="7d"
          value={pctOrDash(compliance.pct_7d)}
          dots={compliance.pct_7d != null ? Math.round(compliance.pct_7d / 20) : null}
        />
        <Row label="30d"   value={pctOrDash(compliance.pct_30d)} />
        <Row label="Total" value={pctOrDash(compliance.pct_total)} />
        <Row label="Streak" value={compliance.streak_days != null ? `${compliance.streak_days}d` : '—'} />
        <Row label="Check-in" value={`${compliance.checkin_done_7d ?? 0}/7`} />
      </Card>

      <Card title="Readiness">
        <Row
          label="Race ready"
          value={readiness.race_readiness != null ? `${readiness.race_readiness}` : '—'}
          trend={readiness.race_readiness_trend}
          hero
        />
        <Row
          label="HRV"
          value={readiness.hrv_ms != null ? `${readiness.hrv_ms} ms` : '—'}
          delta={readiness.hrv_delta_ms}
          deltaInverted={false}
        />
        <Row
          label="Sleep"
          value={readiness.sleep_avg_h != null ? `${formatHours(readiness.sleep_avg_h)}` : '—'}
        />
        <Row
          label="RHR"
          value={readiness.rhr != null ? `${readiness.rhr}` : '—'}
          delta={readiness.rhr_delta}
          deltaInverted
        />
        <Row label="Recov" value={readiness.recovery_pct != null ? `${readiness.recovery_pct}%` : '—'} />
        <Row
          label="Mood/Fatiga"
          value={
            readiness.mood != null && readiness.fatigue != null
              ? `${readiness.mood}/${readiness.fatigue}`
              : '—'
          }
        />
      </Card>
    </section>
  );
}

interface CardProps {
  title: string;
  children: React.ReactNode;
}
function Card({ title, children }: CardProps) {
  return (
    <article className="flex flex-col gap-1 rounded-[var(--r-l)] border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-3">
      <h3 className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">{title}</h3>
      <div className="mt-2 flex flex-col divide-y divide-[color:var(--hairline)]/60">
        {children}
      </div>
    </article>
  );
}

interface RowProps {
  label: string;
  value: string;
  hint?: string | null;
  trend?: 'up' | 'down' | 'flat' | null;
  delta?: number | null;
  deltaInverted?: boolean;     // for RHR — lower is better
  dots?: number | null;
  warn?: boolean;
  hero?: boolean;
}

function Row({ label, value, hint, trend, delta, deltaInverted, dots, warn, hero }: RowProps) {
  const deltaColor =
    delta == null ? null
    : (deltaInverted ? delta < 0 : delta > 0)
      ? 'text-[color:var(--ok)]'
      : 'text-[color:var(--danger)]';
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted)]">{label}</span>
      <span className="flex items-center gap-1.5">
        {dots != null ? (
          <span aria-hidden className="flex gap-[2px]">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={`size-1.5 rounded-full ${i < dots ? 'bg-[color:var(--ok)]' : 'bg-[color:var(--surface-elevated)]'}`}
              />
            ))}
          </span>
        ) : null}
        <span
          className={`font-mono tabular-nums ${
            hero ? 'text-[20px] font-bold' : 'text-[14px] font-semibold'
          } ${warn ? 'text-[color:var(--warning)]' : 'text-[color:var(--fg)]'}`}
        >
          {value}
        </span>
        {trend ? <TrendIcon trend={trend} /> : null}
        {hint ? (
          <span className={`text-[10px] uppercase tracking-[0.12em] ${warn ? 'text-[color:var(--warning)]' : 'text-[color:var(--muted)]'}`}>
            {hint}
          </span>
        ) : null}
        {delta != null && delta !== 0 ? (
          <span className={`font-mono text-[10px] ${deltaColor}`}>
            {delta > 0 ? '+' : ''}{delta}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <ArrowUp className="size-3 text-[color:var(--ok)]" aria-label="al alza" strokeWidth={2} />;
  if (trend === 'down') return <ArrowDown className="size-3 text-[color:var(--danger)]" aria-label="a la baja" strokeWidth={2} />;
  return <Minus className="size-3 text-[color:var(--muted)]" aria-label="estable" strokeWidth={2} />;
}

function fmt(v: number | null): string {
  return v == null ? '—' : `${v}`;
}
function pctOrDash(v: number | null): string {
  return v == null ? '—' : `${v}%`;
}
function formatHours(h: number): string {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}
