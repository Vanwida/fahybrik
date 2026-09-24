'use client';

// Negocio › Embudo — dónde se cae la gente entre que deja su correo y empieza a
// entrenar contigo. La cohorte = quien empezó el formulario en el periodo;
// cada persona se sigue por sus etapas (una cohorte reciente aún madura). Con
// cero leads, una línea y nada más: no 1.300 px de ceros.

import { useRouter } from '@/i18n/navigation';
import { Funnel } from 'lucide-react';
import { SESSION_OUTCOMES, SESSION_OUTCOME_LABEL } from '@fahybrid/shared/domain/sessions/outcome';
import { leadCodes, leadOptionLabel } from '@fahybrid/shared/domain/leads/questions';
import type { FunnelMetrics, MetricsRange } from '@/lib/dashboard/coach/metrics';
import {
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  KPI,
  KPIRow,
  SegmentedControl,
  Sparkline,
  type DataTableColumn,
  type KpiDelta,
} from '@/components/v2/ui';
import { FunnelBars } from './FunnelBars';
import { formatCount, formatDayShort, formatDelta, formatEur, formatIsoDayShort, formatPct1 } from './format';
import { useCoachTimeZone } from '@/lib/coach/coach-timezone-context';

const RANGES: { value: MetricsRange; label: string }[] = [
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'todo', label: 'Todo' },
];

function delta(r: number | null | undefined): KpiDelta | undefined {
  const d = formatDelta(r ?? null);
  if (!d) return undefined;
  return { value: d.pct, direction: d.dir, good: d.dir === 'flat' ? undefined : d.dir === 'up' };
}

interface ObjetivoRow {
  code: string;
  label: string;
  onboardings: number;
  citas: number;
  altas: number;
  conversion: number | null;
}

const OBJ_COLUMNS: DataTableColumn<ObjetivoRow>[] = [
  { id: 'objetivo', header: 'Objetivo', cell: (r) => r.label, sortValue: (r) => r.label },
  { id: 'form', header: 'Formularios', cell: (r) => formatCount(r.onboardings), sortValue: (r) => r.onboardings, align: 'right' },
  { id: 'citas', header: 'Llamadas', cell: (r) => formatCount(r.citas), sortValue: (r) => r.citas, align: 'right', hideBelow: 'sm' },
  { id: 'altas', header: 'Atletas', cell: (r) => formatCount(r.altas), sortValue: (r) => r.altas, align: 'right' },
  {
    id: 'conv',
    header: 'Conversión',
    cell: (r) => formatPct1(r.conversion),
    sortValue: (r) => r.conversion ?? -1,
    align: 'right',
    defaultDir: 'desc',
  },
];

export function EmbudoScreen({ snapshot, outcomes, weekly, by_objetivo }: FunnelMetrics) {
  const tz = useCoachTimeZone();
  const router = useRouter();
  const { range, stages, conversions, cohort_since, cohort_until } = snapshot;
  const setRange = (r: MetricsRange) => router.push(`/negocio/embudo?rango=${r}`);

  const rangeControl = (
    <SegmentedControl aria-label="Periodo" items={RANGES} value={range} onValueChange={setRange} />
  );

  if (stages.iniciado === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">{rangeControl}</div>
        <EmptyState
          variant="page"
          icon={Funnel}
          title={range === 'todo' ? 'Todavía no ha empezado nadie tu formulario' : 'Nadie ha empezado tu formulario en este periodo'}
          description={
            range === 'todo'
              ? 'El embudo se dibuja con la primera persona que deje su correo.'
              : 'Mira «Todo» para ver la cohorte entera.'
          }
        />
      </div>
    );
  }

  const cohortPhrase =
    cohort_since === null
      ? 'desde el principio'
      : `del ${formatDayShort(cohort_since, tz)} al ${formatDayShort(cohort_until, tz)}`;

  const byObjetivo: ObjetivoRow[] = (() => {
    const byCode = new Map(by_objetivo.map((r) => [r.objetivo, r]));
    return leadCodes('objetivo')
      .map((code) => {
        const r = byCode.get(code);
        return {
          code,
          label: leadOptionLabel('objetivo', code),
          onboardings: r?.onboardings ?? 0,
          citas: r?.citas ?? 0,
          altas: r?.altas ?? 0,
          conversion: r?.conversion ?? null,
        };
      })
      .filter((r) => r.onboardings > 0);
  })();

  const trendHasData = weekly.some((p) => p.onboardings + p.citas + p.altas > 0);
  const weekLabels = weekly.map((p) => `sem. ${formatIsoDayShort(p.week_start)}`);
  const totalCalls = SESSION_OUTCOMES.reduce((s, o) => s + outcomes.counts[o], 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="t-body-sm text-v2-muted">
          <span className="text-v2-fg t-tnum">{formatCount(stages.iniciado)}</span> personas empezaron tu formulario{' '}
          {cohortPhrase}. Cada una se sigue por sus etapas.
        </p>
        {rangeControl}
      </div>

      <KPIRow>
        <KPI label="Formularios completos" value={formatCount(stages.completado)} delta={delta(snapshot.deltas?.completado)} />
        <KPI label="Llamadas reservadas" value={formatCount(stages.cita)} delta={delta(snapshot.deltas?.cita)} />
        <KPI label="Llamadas hechas" value={formatCount(stages.llamada)} delta={delta(snapshot.deltas?.llamada)} />
        <KPI label="Nuevos atletas" value={formatCount(stages.convertido)} delta={delta(snapshot.deltas?.convertido)} />
        <KPI
          label="Formulario → atleta"
          value={formatPct1(conversions.onboarding_to_alta)}
          caption={`${formatCount(stages.convertido)} de ${formatCount(stages.completado)}`}
        />
      </KPIRow>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Dónde se cae la gente" subtitle="% = cuántos pasan desde la etapa anterior" />
          <FunnelBars snapshot={snapshot} />
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Últimas 8 semanas" subtitle="por semana" />
            {trendHasData ? (
              <div className="flex flex-col gap-3">
                {(
                  [
                    ['Formularios completos', weekly.map((p) => p.onboardings)],
                    ['Llamadas reservadas', weekly.map((p) => p.citas)],
                    ['Nuevos atletas', weekly.map((p) => p.altas)],
                  ] as const
                ).map(([label, values]) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="t-body-sm text-v2-fg">{label}</span>
                      <span className="t-meta text-v2-faint t-tnum">esta semana {values[values.length - 1] ?? 0}</span>
                    </div>
                    <Sparkline values={[...values]} labels={weekLabels} width={140} height={32} aria-label={`${label}, últimas 8 semanas`} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Sin movimiento en 8 semanas" />
            )}
          </Card>
          <Card>
            <CardHeader
              title="Cómo acaban las llamadas"
              subtitle={outcomes.avg_price_eur != null ? `Precio medio propuesto: ${formatEur(outcomes.avg_price_eur)} (${outcomes.priced_call_count} con precio)` : 'en el periodo'}
            />
            {totalCalls === 0 ? (
              <EmptyState title="Ningún parte de llamada en el periodo" />
            ) : (
              <dl className="flex flex-col">
                {SESSION_OUTCOMES.map((o) => (
                  <div key={o} className="flex items-baseline justify-between gap-3 border-b border-v2-border py-1.5 last:border-b-0">
                    <dt className="t-body-sm text-v2-muted">{SESSION_OUTCOME_LABEL[o]}</dt>
                    <dd className="t-body font-medium text-v2-fg t-tnum">{formatCount(outcomes.counts[o])}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
        </div>
      </div>

      {byObjetivo.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="t-title-sm text-v2-fg">Por objetivo</h2>
          <DataTable
            rows={byObjetivo}
            columns={OBJ_COLUMNS}
            getRowId={(r) => r.code}
            defaultSort={{ id: 'form', dir: 'desc' }}
            aria-label="Conversión por objetivo"
          />
        </section>
      ) : null}

      <ul className="flex flex-col gap-1 t-meta text-v2-faint">
        <li>Una cohorte reciente aún madura: quien entró ayer no ha tenido tiempo de reservar ni de empezar.</li>
        <li>«Hacen la llamada» = hay un parte registrado o la cita se marcó hecha. Quien no vino no cuenta.</li>
        {snapshot.visitas ? (
          <li>Las visitas se cuentan sin cookies ni datos personales, desde el día en que empezó la medición.</li>
        ) : null}
      </ul>
    </div>
  );
}
