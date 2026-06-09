'use client';

import { useEffect, useState } from 'react';
import type {
  BodyPayload,
  BodyPoint,
  RhrSection,
  SleepSection,
  WellnessMetric,
} from '@/lib/dashboard/coach/deep-dive-body';
import { cn } from '@/lib/utils';

interface AthleteBodyViewProps {
  athlete_id: string;
}

type ApiResponse = { body: BodyPayload } | { error: { code: string; message: string } };

export function AthleteBodyView({ athlete_id }: AthleteBodyViewProps) {
  const [data, setData] = useState<BodyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset de loading/error síncrono antes del fetch: sincronización legítima al
  // cambio de `athlete_id`, no un setState derivado en cada render. Disable acotado.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/coach/athletes/${athlete_id}/body`, { credentials: 'include' })
      .then(async (res) => {
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if (!res.ok || 'error' in json) {
          setError(
            'error' in json ? json.error.message : 'No se pudieron cargar las métricas de cuerpo.',
          );
          setData(null);
        } else {
          setData(json.body);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError('Error de red al cargar Cuerpo.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [athlete_id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) return <SectionSkeleton />;
  if (error) return <ErrorCard message={error} />;
  if (!data) return null;

  if (!data.has_any_data) {
    return (
      <EmptyState
        title="Sin biometría sincronizada"
        detail="Pídele al atleta que conecte HealthKit o Garmin desde la app. Los datos de HRV, sueño y frecuencia cardiaca aparecerán aquí en cuanto haya primera sincronización."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* HRV + RHR + Recovery composite row */}
      <section className="grid grid-cols-1 gap-[var(--gutter)] md:grid-cols-3">
        <HrvCard data={data.hrv} />
        <RhrCard data={data.rhr} />
        <ReadinessCard sleep={data.sleep} wellness={data.wellness.metrics} />
      </section>

      {/* Sleep */}
      <section>
        <SectionHeader title="Sueño" subtitle="Últimas 30 noches" />
        <SleepCard data={data.sleep} />
      </section>

      {/* Composición */}
      <section>
        <SectionHeader title="Composición corporal" subtitle="Peso, %grasa, hidratación" />
        <CompositionCard data={data.composition} />
      </section>

      {/* Wellness check-in */}
      <section>
        <SectionHeader
          title="Check-in subjetivo"
          subtitle={`${data.wellness.checkins_done_30d}/${data.wellness.checkins_total_30d} días con check-in`}
        />
        <WellnessGrid metrics={data.wellness.metrics} />
      </section>

      {/* VO2max */}
      {data.vo2max.current_value != null ? (
        <section>
          <SectionHeader title="VO2max" subtitle="Tendencia 12 meses" />
          <Vo2MaxCard data={data.vo2max} />
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-cards
// ---------------------------------------------------------------------------

function HrvCard({ data }: { data: BodyPayload['hrv'] }) {
  const last = data.last_value_ms;
  const delta = data.last_delta_ms;
  const tone = delta == null ? 'muted' : delta >= 0 ? 'success' : 'danger';
  return (
    <Card label="HRV">
      <BigValue value={last != null ? String(last) : '—'} unit={last != null ? 'ms' : undefined} />
      {delta != null ? (
        <DeltaTag tone={tone}>
          {delta >= 0 ? '+' : ''}
          {delta} vs baseline 28d
        </DeltaTag>
      ) : null}
      <Sparkline points={data.daily} />
      <Footnote>
        Baseline {data.current_baseline_ms ?? '—'} ms · {data.drops_count} caídas /{' '}
        {data.spikes_count} picos
      </Footnote>
    </Card>
  );
}

function RhrCard({ data }: { data: RhrSection }) {
  const last = data.last_bpm;
  const delta = data.delta_30d_bpm;
  const tone = delta == null ? 'muted' : delta <= 0 ? 'success' : 'warning';
  return (
    <Card label="Frec. reposo">
      <BigValue value={last != null ? String(last) : '—'} unit={last != null ? 'bpm' : undefined} />
      {delta != null ? (
        <DeltaTag tone={tone}>
          {delta > 0 ? '+' : ''}
          {delta} vs baseline 30d
        </DeltaTag>
      ) : null}
      <Sparkline points={data.daily} />
      <Footnote>
        Tendencia 30d: {data.trend_30d ?? '—'} · baseline {data.baseline_30d ?? '—'} bpm
      </Footnote>
    </Card>
  );
}

function ReadinessCard({
  sleep,
  wellness,
}: {
  sleep: SleepSection;
  wellness: WellnessMetric[];
}) {
  // Composite: avg sleep + avg fatigue inversion + avg motivation
  const sleepScore = sleep.avg_total_hours != null ? Math.min(100, (sleep.avg_total_hours / 8) * 100) : null;
  const fatigueMetric = wellness.find((m) => m.key === 'fatigue');
  const moodMetric = wellness.find((m) => m.key === 'mood');
  const motivationMetric = wellness.find((m) => m.key === 'motivation');
  const fatigueScore = fatigueMetric?.avg != null ? (1 - (fatigueMetric.avg - 1) / 4) * 100 : null;
  const moodScore = moodMetric?.avg != null ? ((moodMetric.avg - 1) / 4) * 100 : null;
  const motivationScore =
    motivationMetric?.avg != null ? ((motivationMetric.avg - 1) / 4) * 100 : null;
  const parts = [sleepScore, fatigueScore, moodScore, motivationScore].filter(
    (v): v is number => v != null,
  );
  const composite = parts.length > 0 ? Math.round(parts.reduce((s, v) => s + v, 0) / parts.length) : null;
  const tone =
    composite == null ? 'muted' : composite >= 70 ? 'success' : composite >= 45 ? 'warning' : 'danger';

  return (
    <Card label="Recovery composite">
      <BigValue value={composite != null ? String(composite) : '—'} unit={composite != null ? '/100' : undefined} />
      <DeltaTag tone={tone}>
        {composite == null
          ? 'Sin datos'
          : composite >= 70
            ? 'Bien recuperado'
            : composite >= 45
              ? 'Moderado'
              : 'Bajo — revisar'}
      </DeltaTag>
      <Footnote>
        Sueño {sleep.avg_total_hours ?? '—'} h · fatiga {fatigueMetric?.avg ?? '—'}/5 · ánimo{' '}
        {moodMetric?.avg ?? '—'}/5
      </Footnote>
    </Card>
  );
}

function SleepCard({ data }: { data: SleepSection }) {
  const series: BodyPoint[] = data.nights.map((n) => ({
    iso_date: n.iso_date,
    value: n.total_hours,
  }));
  return (
    <article className="grid grid-cols-1 gap-6 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-5 md:grid-cols-3">
      <div>
        <SmallLabel>Horas medias</SmallLabel>
        <BigValue
          value={data.avg_total_hours != null ? data.avg_total_hours.toFixed(1) : '—'}
          unit={data.avg_total_hours != null ? 'h' : undefined}
        />
        <Footnote>
          Eficiencia {data.avg_efficiency_pct ?? '—'}% · {data.avg_wakeups ?? '—'} despertares
        </Footnote>
      </div>
      <div className="md:col-span-2">
        <SmallLabel>Distribución 30 noches</SmallLabel>
        <Sparkline points={series} height={64} />
        <Footnote>
          Var hora dormir ±{data.bedtime_variance_min ?? '—'} min · var hora despertar ±
          {data.waketime_variance_min ?? '—'} min
        </Footnote>
      </div>
    </article>
  );
}

function CompositionCard({ data }: { data: BodyPayload['composition'] }) {
  return (
    <article className="grid grid-cols-1 gap-6 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-5 md:grid-cols-3">
      <div>
        <SmallLabel>Peso</SmallLabel>
        <BigValue
          value={data.current_weight_kg != null ? data.current_weight_kg.toFixed(1) : '—'}
          unit={data.current_weight_kg != null ? 'kg' : undefined}
        />
        {data.weight_delta_30d_kg != null ? (
          <DeltaTag tone={Math.abs(data.weight_delta_30d_kg) < 1 ? 'success' : 'warning'}>
            {data.weight_delta_30d_kg > 0 ? '+' : ''}
            {data.weight_delta_30d_kg} kg / 30d
          </DeltaTag>
        ) : null}
      </div>
      <div>
        <SmallLabel>% Grasa</SmallLabel>
        <BigValue
          value={data.body_fat_pct != null ? data.body_fat_pct.toFixed(1) : '—'}
          unit={data.body_fat_pct != null ? '%' : undefined}
        />
        {data.body_fat_delta_30d_pct != null ? (
          <DeltaTag tone={data.body_fat_delta_30d_pct <= 0 ? 'success' : 'warning'}>
            {data.body_fat_delta_30d_pct > 0 ? '+' : ''}
            {data.body_fat_delta_30d_pct} pp / 30d
          </DeltaTag>
        ) : null}
      </div>
      <div>
        <SmallLabel>Hidratación</SmallLabel>
        <BigValue
          value={data.hydration_avg_l != null ? String(data.hydration_avg_l) : '—'}
          unit={data.hydration_avg_l != null ? 'L/d' : undefined}
        />
        <Footnote>Media últimos 7 días</Footnote>
      </div>
      <div className="md:col-span-3">
        <SmallLabel>Peso (media semanal · 12 sem)</SmallLabel>
        <Sparkline points={data.weight_weekly_avg} height={56} />
      </div>
    </article>
  );
}

function WellnessGrid({ metrics }: { metrics: WellnessMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-[var(--gutter)] md:grid-cols-5">
      {metrics.map((m) => {
        const tone =
          m.trend == null
            ? 'muted'
            : m.trend === 'up'
              ? m.key === 'fatigue' || m.key === 'soreness'
                ? 'warning'
                : 'success'
              : m.trend === 'down'
                ? m.key === 'fatigue' || m.key === 'soreness'
                  ? 'success'
                  : 'warning'
                : 'muted';
        return (
          <Card key={m.key} label={m.label}>
            <BigValue value={m.avg != null ? m.avg.toFixed(1) : '—'} unit={m.avg != null ? '/5' : undefined} />
            <DeltaTag tone={tone}>{m.trend ?? '—'}</DeltaTag>
            <Sparkline points={m.series} height={36} />
          </Card>
        );
      })}
    </div>
  );
}

function Vo2MaxCard({ data }: { data: BodyPayload['vo2max'] }) {
  return (
    <article className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <SmallLabel>Valor actual</SmallLabel>
          <BigValue
            value={data.current_value != null ? data.current_value.toFixed(1) : '—'}
            unit={data.current_value != null ? 'ml/kg/min' : undefined}
          />
        </div>
        {data.delta_3m != null ? (
          <DeltaTag tone={data.delta_3m >= 0 ? 'success' : 'warning'}>
            {data.delta_3m > 0 ? '+' : ''}
            {data.delta_3m} vs hace 3m
          </DeltaTag>
        ) : null}
      </div>
      <div className="mt-4">
        <Sparkline
          points={data.monthly.map((m) => ({ iso_date: m.iso_month, value: m.value_ml_kg_min }))}
          height={56}
        />
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Primitives shared with Performance
// ---------------------------------------------------------------------------

export function Card({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-5">
      <SmallLabel>{label}</SmallLabel>
      {children}
    </article>
  );
}

export function SmallLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
      {children}
    </h3>
  );
}

export function BigValue({ value, unit }: { value: string; unit?: string | undefined }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-display-xl leading-none text-[color:var(--fg)]">{value}</span>
      {unit ? <span className="text-xs text-[color:var(--text-muted)]">{unit}</span> : null}
    </div>
  );
}

export function DeltaTag({
  tone,
  children,
}: {
  tone: 'success' | 'warning' | 'danger' | 'muted';
  children: React.ReactNode;
}) {
  const map: Record<typeof tone, string> = {
    success: 'text-[color:var(--status-success)]',
    warning: 'text-[color:var(--status-warning)]',
    danger: 'text-[color:var(--danger)]',
    muted: 'text-[color:var(--text-muted)]',
  };
  return <p className={cn('text-xs font-bold uppercase tracking-wide', map[tone])}>{children}</p>;
}

export function Footnote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[color:var(--text-muted)]">{children}</p>;
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:var(--border-subtle)] pb-2">
      <h2 className="font-heading uppercase text-[color:var(--fg)]">{title}</h2>
      {subtitle ? (
        <span className="text-xs text-[color:var(--text-muted)]">{subtitle}</span>
      ) : null}
    </div>
  );
}

export function Sparkline({
  points,
  height = 48,
}: {
  points: ReadonlyArray<BodyPoint>;
  height?: number;
}) {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 3) {
    return (
      <p className="text-xs text-[color:var(--text-muted)]">Pocos datos para tendencia</p>
    );
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 200;
  const h = height;
  const stepX = points.length > 1 ? w / (points.length - 1) : 0;
  const pts = points
    .map((p, i) => {
      if (p.value == null) return null;
      const x = i * stepX;
      const y = h - ((p.value - min) / span) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter((s): s is string => s != null)
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="mt-1 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-8 text-center">
      <p className="font-heading uppercase text-[color:var(--fg)]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[color:var(--text-muted)]">{detail}</p>
    </div>
  );
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--danger)] bg-[color:var(--surface-card)] p-6 text-center">
      <p className="text-sm text-[color:var(--danger)]">{message}</p>
    </div>
  );
}

export function SectionSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-[var(--gutter)] md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]"
        />
      ))}
    </div>
  );
}
