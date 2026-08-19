'use client';

// BIOMETRÍA — Whoop Recovery / Oura Readiness for the COACH (not a watch dump).
// Hierarchy: verdict → acute (vs baseline + last night) → subjective check-in →
// 30d trends → slow fitness (VO₂, weight). Alarm states always offer a path to
// Plan. Data from BodyPayload + check-in already on the ficha — nothing mocked.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { Panel, Sparkline } from './parts';
import { ComoSeEncuentraPanel } from './ComoSeEncuentraPanel';
import {
  deriveRecoveryVerdict,
  hrvVsBaseline,
  lastSleepNight,
  rhrVsBaseline,
  type RecoveryBand,
  type SignalVsBaseline,
} from '@/lib/dashboard/coach/biometria-recovery';
import type { CheckinContent, CheckinWeekSlot } from '@/lib/dashboard/coach/checkin-presentation';
import type { BodyPayload, BodyPoint } from '@/lib/dashboard/coach/deep-dive-body';
import { cn } from '@/lib/utils';

const TREND_DAYS = 30;

const BAND_META: Record<
  RecoveryBand,
  { tone: 'ok' | 'warn' | 'danger' | 'neutral'; border: string; bg: string; icon: string }
> = {
  green: {
    tone: 'ok',
    border: 'var(--v2-ok)',
    bg: 'var(--v2-ok-soft)',
    icon: 'check_circle',
  },
  yellow: {
    tone: 'warn',
    border: 'var(--v2-warn)',
    bg: 'var(--v2-warn-soft)',
    icon: 'warning',
  },
  red: {
    tone: 'danger',
    border: 'var(--v2-danger)',
    bg: 'var(--v2-danger-soft)',
    icon: 'priority_high',
  },
  unknown: {
    tone: 'neutral',
    border: 'var(--v2-border)',
    bg: 'var(--v2-surface-2)',
    icon: 'help',
  },
};

function lastReal(vals: Array<number | null>, fmt: (n: number) => string): string | null {
  for (let i = vals.length - 1; i >= 0; i--) {
    const v = vals[i];
    if (v != null) return fmt(v);
  }
  return null;
}

function lastNonNull(points: BodyPoint[]): BodyPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i]!.value != null) return points[i]!;
  }
  return null;
}

function fmtDelta(delta: number | null, unit: string, invertGood = false): {
  text: string;
  tone: 'ok' | 'warn' | 'danger' | 'muted';
} | null {
  if (delta == null) return null;
  const rounded = Math.round(delta * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  const text = `${sign}${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} ${unit}`;
  if (rounded === 0) return { text, tone: 'muted' };
  // For HRV, up is good; for RHR, up is bad.
  const positiveIsGood = !invertGood;
  const good = positiveIsGood ? rounded > 0 : rounded < 0;
  return { text, tone: good ? 'ok' : Math.abs(rounded) >= 5 ? 'danger' : 'warn' };
}

const TONE_TEXT: Record<'ok' | 'warn' | 'danger' | 'muted', string> = {
  ok: 'text-[color:var(--v2-ok)]',
  warn: 'text-[color:var(--v2-warn)]',
  danger: 'text-[color:var(--v2-danger)]',
  muted: 'text-[color:var(--v2-faint)]',
};

const SYNC_FMT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
});

const DAY_FMT = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: 'numeric',
  timeZone: 'Europe/Madrid',
});

export function BiometriaTab({
  body,
  athleteId,
  checkin,
  checkinWeek,
}: {
  body: BodyPayload | null;
  athleteId: string;
  checkin: CheckinContent | null;
  checkinWeek: CheckinWeekSlot[];
}) {
  if (!body || !body.has_any_data) {
    return (
      <EmptyState
        icon="monitor_heart"
        title="Sin señales biométricas todavía"
        description="Cuando el atleta sincronice su reloj (HealthKit, Garmin, Polar…) o registre check-ins, verás aquí su recuperación al estilo Whoop/Oura: si puede cargar, mantener o descargar."
      />
    );
  }

  const verdict = deriveRecoveryVerdict(body);
  const band = BAND_META[verdict.band];
  const hrv = hrvVsBaseline(body);
  const rhr = rhrVsBaseline(body);
  const night = lastSleepNight(body);

  const syncPoint = lastNonNull(body.hrv.daily) ?? lastNonNull(body.rhr.daily);
  const syncLabel = syncPoint ? SYNC_FMT.format(new Date(syncPoint.iso_date)) : null;

  const showPlanCta = verdict.band === 'yellow' || verdict.band === 'red';

  return (
    <div className="flex flex-col gap-5">
      {/* Sync recency — quiet, like Oura’s last-sync line */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--v2-muted)]">
        <MIcon name="sync" size={16} className="text-[color:var(--v2-faint)]" />
        <span>
          Señales reloj + check-in
          {syncLabel ? (
            <>
              {' '}
              · última lectura{' '}
              <span className="v2-num font-semibold text-[color:var(--v2-fg)]">{syncLabel}</span>
            </>
          ) : null}
        </span>
      </div>

      {/* ── 1 · VERDICT (Whoop Recovery / Oura Readiness hero) ─────────────── */}
      <section
        className="flex flex-col gap-3 rounded-[var(--v2-r-l)] border p-4 shadow-[var(--v2-shadow-card)] sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: band.border, background: band.bg }}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--v2-surface)', color: band.border }}
          >
            <MIcon name={band.icon} size={24} filled={verdict.band !== 'unknown'} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="v2-micro text-[color:var(--v2-muted)]">Recuperación · hoy</span>
            <h2 className="v2-display text-2xl text-[color:var(--v2-fg)] sm:text-3xl">
              {verdict.label}
            </h2>
            <p className="max-w-[52ch] text-xs leading-relaxed text-[color:var(--v2-muted)]">
              {verdict.detail}
            </p>
          </div>
        </div>
        {showPlanCta ? (
          <Link
            href={`/atletas/${athleteId}?tab=plan`}
            className="v2-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3 text-body font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]"
          >
            Ver plan y ajustar
            <MIcon name="arrow_forward" size={16} />
          </Link>
        ) : null}
      </section>

      {/* ── 2 · ACUTE vs baseline (the three Whoop/Oura pillars) ───────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BaselineCard
          label="VFC"
          unit="ms"
          signal={hrv}
          invertGood={false}
          emptyHint="Sin VFC reciente"
        />
        <BaselineCard
          label="FC reposo"
          unit="bpm"
          signal={rhr}
          invertGood
          emptyHint="Sin FC reposo"
        />
        <SleepCard nightHours={night?.total_hours ?? null} night={night} avgHours={body.sleep.avg_total_hours} />
      </div>

      {/* Last-night sleep architecture when the stream has stages */}
      {night && (night.deep_hours != null || night.efficiency_pct != null || night.wakeups != null) ? (
        <Panel title="Sueño · última noche con datos" bodyClassName="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Total" value={night.total_hours != null ? `${night.total_hours.toFixed(1)} h` : '—'} />
            <MiniStat
              label="Eficiencia"
              value={night.efficiency_pct != null ? `${Math.round(night.efficiency_pct)}%` : '—'}
            />
            <MiniStat
              label="Profundo"
              value={night.deep_hours != null ? `${night.deep_hours.toFixed(1)} h` : '—'}
            />
            <MiniStat
              label="Despertares"
              value={night.wakeups != null ? `${Math.round(night.wakeups)}` : '—'}
            />
          </div>
          {body.sleep.bedtime_variance_min != null ? (
            <p className="text-label text-[color:var(--v2-muted)]">
              Regularidad de horario (30d): varianza de acostarse ≈{' '}
              <span className="v2-num font-semibold text-[color:var(--v2-fg)]">
                {Math.round(body.sleep.bedtime_variance_min)} min
              </span>
              {body.sleep.bedtime_variance_min > 60
                ? '. Horarios irregulares restan recuperación.'
                : '.'}
            </p>
          ) : null}
        </Panel>
      ) : null}

      {/* ── 3 · SUBJECTIVE (same check-in as Plan — one circle) ───────────── */}
      <ComoSeEncuentraPanel checkin={checkin} week={checkinWeek} />

      {/* ── 4 · CHRONIC trends (30d, baseline on HRV) ──────────────────────── */}
      <TrendPanel body={body} />

      {/* 7-day table for scan */}
      <WeekTable body={body} />

      {/* ── 5 · SLOW fitness (Oura “long-term”, secondary) ─────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Panel title="Fitness · VO₂" bodyClassName="flex flex-col gap-1">
          {body.vo2max.current_value != null ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="v2-display text-3xl tabular-nums text-[color:var(--v2-fg)]">
                  {Math.round(body.vo2max.current_value)}
                </span>
                <span className="v2-num text-xs text-[color:var(--v2-faint)]">ml/kg/min</span>
                {body.vo2max.delta_3m != null ? (
                  <span
                    className={cn(
                      'v2-num text-xs font-semibold',
                      body.vo2max.delta_3m >= 0 ? 'text-[color:var(--v2-ok)]' : 'text-[color:var(--v2-danger)]',
                    )}
                  >
                    {body.vo2max.delta_3m > 0 ? '+' : ''}
                    {body.vo2max.delta_3m.toFixed(1)} · 3m
                  </span>
                ) : null}
              </div>
              <p className="text-label text-[color:var(--v2-faint)]">
                Tendencia lenta, no mueve el veredicto de hoy.
              </p>
            </>
          ) : (
            <p className="py-2 text-xs text-[color:var(--v2-faint)]">Sin VO₂ medido todavía.</p>
          )}
        </Panel>

        <Panel title="Composición · peso" bodyClassName="flex flex-col gap-1">
          {body.composition.current_weight_kg != null ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="v2-display text-3xl tabular-nums text-[color:var(--v2-fg)]">
                  {body.composition.current_weight_kg.toFixed(1)}
                </span>
                <span className="v2-num text-xs text-[color:var(--v2-faint)]">kg</span>
                {body.composition.weight_delta_30d_kg != null ? (
                  <span className="v2-num text-xs font-semibold text-[color:var(--v2-muted)]">
                    {body.composition.weight_delta_30d_kg > 0 ? '+' : ''}
                    {body.composition.weight_delta_30d_kg.toFixed(1)} kg · 30d
                  </span>
                ) : null}
              </div>
              {body.composition.body_fat_pct != null ? (
                <p className="text-label text-[color:var(--v2-muted)]">
                  Grasa corporal{' '}
                  <span className="v2-num font-semibold text-[color:var(--v2-fg)]">
                    {body.composition.body_fat_pct.toFixed(1)}%
                  </span>
                </p>
              ) : (
                <p className="text-label text-[color:var(--v2-faint)]">
                  Contexto de bloque, no mueve el veredicto de hoy.
                </p>
              )}
            </>
          ) : (
            <p className="py-2 text-xs text-[color:var(--v2-faint)]">Sin peso registrado.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ── Baseline metric card (vs own line — Whoop’s core trick) ───────────────────

function BaselineCard({
  label,
  unit,
  signal,
  invertGood,
  emptyHint,
}: {
  label: string;
  unit: string;
  signal: SignalVsBaseline;
  invertGood: boolean;
  emptyHint: string;
}) {
  const delta = fmtDelta(signal.delta, unit, invertGood);
  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3.5 shadow-[var(--v2-shadow-card)]">
      <span className="v2-micro">{label}</span>
      {signal.value != null ? (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="v2-display text-3xl tabular-nums text-[color:var(--v2-fg)]">
              {Math.round(signal.value)}
            </span>
            <span className="v2-num text-xs text-[color:var(--v2-faint)]">{unit}</span>
            {delta ? (
              <span className={cn('v2-num text-xs font-semibold', TONE_TEXT[delta.tone])}>
                {delta.text}
              </span>
            ) : null}
          </div>
          <span className="text-label text-[color:var(--v2-faint)]">
            {signal.baseline != null
              ? `vs su baseline ${Math.round(signal.baseline)} ${unit}`
              : 'sin baseline aún (pocos días)'}
          </span>
        </>
      ) : (
        <span className="py-2 text-xs text-[color:var(--v2-faint)]">{emptyHint}</span>
      )}
    </div>
  );
}

function SleepCard({
  nightHours,
  night,
  avgHours,
}: {
  nightHours: number | null;
  night: { efficiency_pct: number | null; wakeups: number | null } | null;
  avgHours: number | null;
}) {
  const low = nightHours != null && nightHours < 6.5;
  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3.5 shadow-[var(--v2-shadow-card)]">
      <span className="v2-micro">Sueño anoche</span>
      {nightHours != null ? (
        <>
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                'v2-display text-3xl tabular-nums',
                low ? 'text-[color:var(--v2-warn)]' : 'text-[color:var(--v2-fg)]',
              )}
            >
              {nightHours.toFixed(1)}
            </span>
            <span className="v2-num text-xs text-[color:var(--v2-faint)]">h</span>
          </div>
          <span className="text-label text-[color:var(--v2-faint)]">
            {avgHours != null ? `media 30d ${avgHours.toFixed(1)} h` : 'última noche con datos'}
            {night?.wakeups != null ? ` · ${Math.round(night.wakeups)} desp.` : ''}
          </span>
        </>
      ) : (
        <span className="py-2 text-xs text-[color:var(--v2-faint)]">Sin sueño reciente</span>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--v2-r-m)] bg-[color:var(--v2-surface-2)] px-2.5 py-2">
      <span className="v2-micro text-nano">{label}</span>
      <span className="v2-num text-sm font-semibold text-[color:var(--v2-fg)]">{value}</span>
    </div>
  );
}

function TrendPanel({ body }: { body: BodyPayload }) {
  const hrv = body.hrv.daily.slice(-TREND_DAYS).map((p) => p.value);
  const hrvBase = body.hrv.baseline_28d.slice(-TREND_DAYS).map((p) => p.value);
  const rhr = body.rhr.daily.slice(-TREND_DAYS).map((p) => p.value);
  const sleep = body.sleep.nights.slice(-TREND_DAYS).map((n) => n.total_hours);

  const metrics = [
    {
      key: 'hrv',
      label: 'VFC',
      unit: 'ms',
      colorVar: '--v2-info',
      values: hrv,
      baseline: hrvBase,
      current: lastReal(hrv, (n) => `${Math.round(n)}`),
    },
    {
      key: 'rhr',
      label: 'FC reposo',
      unit: 'bpm',
      colorVar: '--v2-fg',
      values: rhr,
      current: lastReal(rhr, (n) => `${Math.round(n)}`),
    },
    {
      key: 'sleep',
      label: 'Sueño',
      unit: 'h',
      colorVar: '--v2-accent',
      values: sleep,
      current: lastReal(sleep, (n) => n.toFixed(1)),
    },
  ];
  const any = metrics.some((m) => m.values.some((v) => v != null));

  return (
    <Panel title="Tendencia · 30 días" bodyClassName="px-3.5 py-1">
      {any ? (
        <div className="divide-y divide-[color:var(--v2-border)]">
          {metrics.map((m) => {
            const present = m.values.some((v) => v != null);
            return (
              <div key={m.key} className="flex items-center gap-3 py-2.5">
                <div className="flex w-24 shrink-0 flex-col">
                  <span className="text-xs font-semibold text-[color:var(--v2-fg)]">{m.label}</span>
                  <span className="v2-num text-label text-[color:var(--v2-faint)]">
                    {present && m.current != null ? (
                      <>
                        <span className="text-[color:var(--v2-muted)]">{m.current}</span> {m.unit}
                      </>
                    ) : (
                      'sin datos'
                    )}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  {present ? (
                    <Sparkline
                      values={m.values}
                      baseline={'baseline' in m ? m.baseline : undefined}
                      strokeVar={m.colorVar}
                      height={40}
                    />
                  ) : (
                    <div className="flex h-10 items-center text-label text-[color:var(--v2-faint)]">
                      Sin lecturas en {TREND_DAYS} d
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 py-6 text-xs text-[color:var(--v2-faint)]">
          <MIcon name="show_chart" size={16} />
          Aún no hay tendencia de 30 días.
        </div>
      )}
    </Panel>
  );
}

function WeekTable({ body }: { body: BodyPayload }) {
  const hrv = new Map(body.hrv.daily.map((p) => [p.iso_date, p.value]));
  const rhr = new Map(body.rhr.daily.map((p) => [p.iso_date, p.value]));
  const sleep = new Map(body.sleep.nights.map((n) => [n.iso_date, n.total_hours]));
  const dates = Array.from(new Set([...hrv.keys(), ...rhr.keys(), ...sleep.keys()]))
    .sort()
    .reverse()
    .slice(0, 7);

  if (dates.length === 0) return null;

  return (
    <Panel title="Últimos 7 días" bodyClassName="p-0 overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[color:var(--v2-border)]">
            <th className="v2-micro py-2 pl-3.5 text-left">Día</th>
            <th className="v2-micro py-2 px-2 text-right">VFC</th>
            <th className="v2-micro py-2 px-2 text-right">FC rep</th>
            <th className="v2-micro py-2 pr-3.5 text-right">Sueño</th>
          </tr>
        </thead>
        <tbody>
          {dates.map((iso) => (
            <tr key={iso} className="border-b border-[color:var(--v2-border)] last:border-0">
              <td className="py-2 pl-3.5 pr-2 text-xs font-medium capitalize text-[color:var(--v2-fg)]">
                {DAY_FMT.format(new Date(iso)).replace('.', '')}
              </td>
              <td className="v2-num py-2 px-2 text-right text-xs text-[color:var(--v2-muted)]">
                {hrv.get(iso) != null ? Math.round(hrv.get(iso)!) : '—'}
              </td>
              <td className="v2-num py-2 px-2 text-right text-xs text-[color:var(--v2-muted)]">
                {rhr.get(iso) != null ? Math.round(rhr.get(iso)!) : '—'}
              </td>
              <td className="v2-num py-2 pr-3.5 text-right text-xs text-[color:var(--v2-muted)]">
                {sleep.get(iso) != null ? `${sleep.get(iso)!.toFixed(1)} h` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
