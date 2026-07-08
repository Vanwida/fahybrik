// v2 · MÉTRICAS DEL FUNNEL (#20) — the presentation. Server component (no client
// state): the range selector is server-nav link-buttons that swap `?rango=`, so
// the whole page stays server-rendered. Layout + copy mirror the approved mockup,
// rebuilt on the REAL v2 primitives and tokens. All numbers come from the
// aggregator (lib/dashboard/coach/metrics.ts) — nothing is invented here.

import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Card, StatTile, Pill } from '@/components/v2';
import { Panel } from '@/components/v2/atleta-detalle/parts';
import {
  SESSION_OUTCOMES,
  SESSION_OUTCOME_LABEL,
  SESSION_OUTCOME_TONE,
} from '@fahybrid/shared/domain/sessions/outcome';
import { leadOptionLabel, leadCodes } from '@fahybrid/shared/domain/leads/questions';
import type { FunnelMetrics, MetricsRange } from '@/lib/dashboard/coach/metrics';
import { FunnelChart } from './FunnelChart';
import { TrendPanel } from './TrendPanel';
import {
  formatCount,
  formatPct1,
  formatEur,
  formatDelta,
  formatDayShort,
  DELTA_COLOR_VAR,
  DELTA_ARROW,
} from './format';

// ── Range selector (server-nav link buttons, styled as a segmented control) ────────
const RANGE_OPTIONS: { value: MetricsRange; label: string }[] = [
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'todo', label: 'Todo' },
];

const RANGE_SUFFIX: Record<MetricsRange, string> = { '7d': '7 d', '30d': '30 d', todo: 'todo' };

function RangeSelector({ range }: { range: MetricsRange }) {
  return (
    <div
      role="group"
      aria-label="Periodo"
      className="inline-flex items-center gap-0.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-0.5"
    >
      {RANGE_OPTIONS.map((o) => {
        const active = o.value === range;
        return (
          <Link
            key={o.value}
            href={`/metricas?rango=${o.value}`}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'v2-focus rounded-[var(--v2-r-pill)] px-3.5 py-1.5 text-xs font-semibold transition-colors',
              active
                ? 'bg-[color:var(--v2-fg)] text-[color:var(--v2-bg)]'
                : 'text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

// ── KPI strip ──────────────────────────────────────────────────────────────────────
function DeltaLine({ r }: { r: number | null }) {
  const d = formatDelta(r);
  if (!d) return null;
  return (
    <span className="v2-num text-[11.5px] font-semibold text-[color:var(--v2-muted)]">
      <span style={{ color: DELTA_COLOR_VAR[d.dir] }}>
        {DELTA_ARROW[d.dir]} {d.pct}
      </span>{' '}
      vs. periodo previo
    </span>
  );
}

function KpiCard({
  label,
  value,
  tone = 'fg',
  sub,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'fg' | 'accent' | 'ok';
  sub?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <StatTile label={label} value={value} tone={tone} />
      {sub}
    </Card>
  );
}

// ── Call outcomes + average price ────────────────────────────────────────────────────
const OUTCOME_TONE_VAR: Record<'ok' | 'info' | 'warn' | 'neutral', string> = {
  ok: '--v2-ok',
  info: '--v2-info',
  warn: '--v2-warn',
  neutral: '--v2-muted',
};

function OutcomesPanel({ outcomes }: { outcomes: FunnelMetrics['outcomes'] }) {
  const totalCalls = SESSION_OUTCOMES.reduce((sum, o) => sum + outcomes.counts[o], 0);
  return (
    <Panel title="Resultado de las llamadas" action={<Pill tone="neutral">en el periodo</Pill>}>
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <StatTile label="Precio medio propuesto" value={formatEur(outcomes.avg_price_eur)} />
          <span className="text-right text-[10.5px] leading-tight text-[color:var(--v2-faint)]">
            sobre <span className="v2-num">{formatCount(outcomes.priced_call_count)}</span>
            <br />
            {outcomes.priced_call_count === 1 ? 'llamada con precio' : 'llamadas con precio'}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          {SESSION_OUTCOMES.map((o) => (
            <div key={o} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: `var(${OUTCOME_TONE_VAR[SESSION_OUTCOME_TONE[o]]})` }}
              />
              <span className="flex-1 text-[12.5px] text-[color:var(--v2-fg)]">
                {SESSION_OUTCOME_LABEL[o]}
              </span>
              <span className="v2-num text-[13px] font-semibold text-[color:var(--v2-fg)]">
                {formatCount(outcomes.counts[o])}
              </span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-[color:var(--v2-border)] pt-2">
            <span className="v2-micro">Total partes</span>
            <span className="v2-num text-[13px] font-bold text-[color:var(--v2-fg)]">
              {formatCount(totalCalls)}
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ── By-objetivo segmentation table ───────────────────────────────────────────────────
function ObjetivoTable({ rows }: { rows: FunnelMetrics['by_objetivo'] }) {
  const codes = leadCodes('objetivo');
  const byCode = new Map(rows.map((r) => [r.objetivo, r]));
  const ordered = codes.map((code) => {
    const r = byCode.get(code);
    return {
      code,
      label: leadOptionLabel('objetivo', code),
      onboardings: r?.onboardings ?? 0,
      citas: r?.citas ?? 0,
      altas: r?.altas ?? 0,
      conversion: r?.conversion ?? null,
    };
  });
  const maxConv = Math.max(0, ...ordered.map((r) => r.conversion ?? 0));

  return (
    <Panel
      title="Conversión por objetivo · a qué vienen"
      action={
        <Pill tone="neutral" variant="outline" className="hidden sm:inline-flex">
          onboarding → alta
        </Pill>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[color:var(--v2-border)] text-[color:var(--v2-faint)]">
              <th scope="col" className="px-2.5 py-2 text-left font-bold uppercase tracking-wide text-[10.5px]">
                Objetivo
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-bold uppercase tracking-wide text-[10.5px]">
                Onboardings
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-bold uppercase tracking-wide text-[10.5px]">
                Citas
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-bold uppercase tracking-wide text-[10.5px]">
                Altas
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-bold uppercase tracking-wide text-[10.5px]">
                Conversión
              </th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((r) => (
              <tr
                key={r.code}
                className="border-b border-[color:var(--v2-border)] last:border-b-0"
              >
                <th
                  scope="row"
                  className="px-2.5 py-2.5 text-left font-semibold text-[color:var(--v2-fg)]"
                >
                  {r.label}
                </th>
                <td className="v2-num px-2.5 py-2.5 text-right text-[color:var(--v2-fg)]">
                  {formatCount(r.onboardings)}
                </td>
                <td className="v2-num px-2.5 py-2.5 text-right text-[color:var(--v2-fg)]">
                  {formatCount(r.citas)}
                </td>
                <td className="v2-num px-2.5 py-2.5 text-right text-[color:var(--v2-fg)]">
                  {formatCount(r.altas)}
                </td>
                <td className="px-2.5 py-2.5 text-right">
                  <span className="inline-flex items-center justify-end gap-2">
                    <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-[color:var(--v2-surface-2)] sm:inline-block">
                      <span
                        className="block h-full rounded-full bg-[color:var(--v2-accent)]"
                        style={{
                          width: `${maxConv > 0 ? ((r.conversion ?? 0) / maxConv) * 100 : 0}%`,
                        }}
                      />
                    </span>
                    <span className="v2-num min-w-[42px] text-right font-bold text-[color:var(--v2-fg)]">
                      {formatPct1(r.conversion)}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── Honest notes ─────────────────────────────────────────────────────────────────────
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-[11.5px] leading-relaxed text-[color:var(--v2-muted)]">
      <span
        aria-hidden
        className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[color:var(--v2-faint)]"
      />
      <span>{children}</span>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────────────
export function MetricasPanel({ snapshot, outcomes, weekly, by_objetivo }: FunnelMetrics) {
  const { range, stages, conversions, cohort_since, cohort_until } = snapshot;

  const cohortRangePhrase =
    cohort_since === null
      ? 'desde el principio'
      : `entre el ${formatDayShort(cohort_since)} y el ${formatDayShort(cohort_until)}`;

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
      {/* Header */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="v2-display text-[clamp(28px,5vw,42px)] text-[color:var(--v2-fg)]">
              Métricas del funnel{' '}
              <span className="text-[color:var(--v2-faint)]">· {RANGE_SUFFIX[range]}</span>
            </h1>
            <p className="mt-2 max-w-[62ch] text-sm text-[color:var(--v2-muted)]">
              Cohorte de los{' '}
              <span className="font-semibold text-[color:var(--v2-fg)]">
                <span className="v2-num">{formatCount(stages.iniciado)}</span> leads
              </span>{' '}
              que iniciaron el onboarding {cohortRangePhrase}. Sigue a cada persona por sus etapas
              — mide dónde se cae el ingreso.
            </p>
          </div>
          <RangeSelector range={range} />
        </div>
      </header>

      {/* KPI strip */}
      <section
        aria-label="Indicadores clave"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <KpiCard
          label="Onboardings"
          value={formatCount(stages.completado)}
          sub={<DeltaLine r={snapshot.deltas?.completado ?? null} />}
        />
        <KpiCard
          label="Citas reservadas"
          value={formatCount(stages.cita)}
          sub={<DeltaLine r={snapshot.deltas?.cita ?? null} />}
        />
        <KpiCard
          label="Llamadas hechas"
          value={formatCount(stages.llamada)}
          sub={<DeltaLine r={snapshot.deltas?.llamada ?? null} />}
        />
        <KpiCard
          label="Altas"
          value={formatCount(stages.convertido)}
          tone="accent"
          sub={<DeltaLine r={snapshot.deltas?.convertido ?? null} />}
        />
        <KpiCard
          label="Onboarding → alta"
          value={formatPct1(conversions.onboarding_to_alta)}
          tone="ok"
          sub={
            <span className="v2-num text-[11.5px] font-semibold text-[color:var(--v2-muted)]">
              {formatCount(stages.convertido)} de {formatCount(stages.completado)} completados
            </span>
          }
        />
      </section>

      {/* Funnel + right column */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.55fr_1fr]">
        <FunnelChart snapshot={snapshot} />
        <div className="flex flex-col gap-4">
          <TrendPanel weekly={weekly} />
          <OutcomesPanel outcomes={outcomes} />
        </div>
      </div>

      {/* Segmentation */}
      <ObjetivoTable rows={by_objetivo} />

      {/* Honest notes */}
      <div className="mt-1 flex flex-col gap-2">
        <Note>
          <b className="font-semibold text-[color:var(--v2-fg)]">Visitas web · pendiente de instrumentar.</b>{' '}
          El tráfico de la landing aún no se mide, así que el funnel arranca en “Onboarding
          iniciado”. Cuando se despliegue la medición, se añade la parte de arriba del embudo.
        </Note>
        <Note>
          <b className="font-semibold text-[color:var(--v2-fg)]">Cohortes recientes</b> siguen
          madurando: un lead que entró ayer no ha tenido tiempo de reservar ni darse de alta, así
          que el último tramo del funnel se llena con los días.
        </Note>
        <Note>
          <b className="font-semibold text-[color:var(--v2-fg)]">Llamada realizada</b> = hay un
          parte de la sesión registrado (o la cita se marcó completada). Los no-show no cuentan como
          llamada.
        </Note>
      </div>
    </div>
  );
}
