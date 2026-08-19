'use client';

// Resumen — «¿cómo va este atleta y qué toca esta semana?»
// Spec 1a. Un dato solo entra si cambia una decisión. Lo vacío es una línea.

import { useRouter } from '@/i18n/navigation';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { BENCH_BACK_SQUAT_1RM, BENCH_DEADLIFT_1RM, BENCH_RUN_5K } from '@fahybrid/shared/domain/coach/benchmark-slugs';
import type { V2AthleteDetalle } from '@/lib/dashboard/v2/atleta-detalle-types';
import {
  checkinRespondido,
  diasDeLaSemana,
  formatFechaCorta,
  formatRaceTime,
  formatRangoSemana,
  formatSleepHours,
  interpretarAdherencia,
  semanasHasta,
  tendenciaAdherencia,
} from '@/lib/dashboard/v2/ficha-resumen';
import { mondayOfWeek, isoDateString, startOfDayInBox, addDays } from '@fahybrid/shared/domain/dates';
import { FichaCard, FichaLabel, FilaVacia, PillEstado } from './resumen/piezas';
import { LesionCard } from './resumen/LesionCard';
import { cn } from '@/lib/utils';

const DAY_SHORT = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'] as const;

function todayIsoLocal(): string {
  return isoDateString(startOfDayInBox(new Date()));
}

function dayNumber(iso: string): string {
  return iso.slice(8, 10).replace(/^0/, '');
}

export function ResumenTab({ detalle }: { detalle: V2AthleteDetalle }) {
  const id = detalle.header.athlete_id;
  const today = todayIsoLocal();
  const monday = isoDateString(mondayOfWeek(startOfDayInBox(new Date())));
  const sunday = isoDateString(addDays(mondayOfWeek(startOfDayInBox(new Date())), 6));

  const week = detalle.plan?.weeks.find((w) => w.week_start === monday) ?? detalle.plan?.weeks[0] ?? null;
  const dias = week ? diasDeLaSemana(week.days, today) : [];
  const hechas = dias.filter((d) => d.estado === 'hecha').length;
  const programadas = dias.filter((d) => d.estado !== 'descanso').length;

  const macro = detalle.resumen?.macro;
  const span = macro?.block_spans.find((s) => s.block_type === macro.block);
  const fase =
    macro?.block && macro.block_week != null
      ? `${macro.block} · sem ${macro.block_week}${span?.week_count ? ` de ${span.week_count}` : ''}`
      : (detalle.header.phase_label ?? null);

  const weeks = detalle.ficha.adherence_weeks;
  const trend = tendenciaAdherencia(weeks);
  const frase = interpretarAdherencia(weeks, week?.days ?? null, today);

  const checkin = detalle.resumen?.checkin ?? null;
  const respondido = checkinRespondido(checkin?.recorded_for ?? null, detalle.chat?.messages ?? []);
  const sleep = detalle.ficha.sleep_hours;
  const delta = detalle.ficha.readiness_delta;
  const readiness = detalle.resumen?.readiness_score ?? null;

  const squat = detalle.strength_maxes.find((m) => m.exercise_slug === BENCH_BACK_SQUAT_1RM);
  const muerto = detalle.strength_maxes.find((m) => m.exercise_slug === BENCH_DEADLIFT_1RM);
  const squatDelta =
    squat && squat.history.length >= 2
      ? squat.one_rm_kg - squat.history[squat.history.length - 2]!.one_rm_kg
      : null;
  const cincoK = detalle.benchmarks.find((b) => b.exercise_slug === BENCH_RUN_5K);
  const testsPendientes = detalle.tests.filter((t) => t.result_pending).length;
  const sinZonas = detalle.zone_profiles.length === 0;

  const race = detalle.resumen?.target_race ?? detalle.resumen?.next_race ?? null;
  const raceDate = detalle.ficha.race_date;
  const goal = detalle.ficha.race_goal_time_seconds;

  const ajuste = detalle.ficha.week_adjustment;
  const nota = detalle.ficha.private_note;

  return (
    <div className="mx-auto grid w-full max-w-[1300px] grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_328px]">
      <div className="flex min-w-0 flex-col gap-4">
        <FichaCard className="p-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <FichaLabel className="m-0">Esta semana</FichaLabel>
              <span className="v2-num text-[12px] text-[color:var(--v2-muted)]">
                {formatRangoSemana(week?.week_start ?? monday, week?.week_end ?? sunday)}
                {fase ? ` · ${fase}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {programadas > 0 ? (
                <span className="text-[12px] text-[color:var(--v2-muted)]">
                  {hechas} de {programadas} hechas
                </span>
              ) : null}
              <Link
                href={`/atletas/${id}?tab=plan`}
                className="text-[12.5px] font-semibold text-[color:var(--v2-accent)] hover:underline"
              >
                Abrir semana →
              </Link>
            </div>
          </div>

          {dias.length === 7 ? (
            <div className="grid grid-cols-1 gap-2 px-4 pb-4 pt-3 sm:grid-cols-2 lg:grid-cols-7">
              {dias.map((d, i) => {
                const href = d.assignment_id
                  ? `/atletas/${id}?tab=plan&sesion=${d.assignment_id}`
                  : `/atletas/${id}?tab=plan`;
                const vacio = d.estado === 'descanso';
                return (
                  <Link
                    key={d.iso}
                    href={href}
                    className={cn(
                      'flex min-h-[92px] flex-col gap-1 rounded-[var(--v2-r-m)] border px-2.5 py-2.5',
                      vacio
                        ? 'border-dashed border-[color:var(--v2-border)] bg-transparent'
                        : 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface)]',
                      d.is_today && 'border-[1.5px] border-[color:var(--v2-fg)]',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="v2-num text-[10px] uppercase tracking-[0.06em] text-[color:var(--v2-muted)]">
                        {DAY_SHORT[i]} {dayNumber(d.iso)}
                      </span>
                      {d.is_today ? (
                        <span className="ml-auto inline-flex items-center rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[color:var(--v2-accent-fg)]">
                          Hoy
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        'line-clamp-2 text-[12.5px] font-semibold leading-snug',
                        vacio ? 'text-[color:var(--v2-faint)]' : 'text-[color:var(--v2-fg)]',
                      )}
                    >
                      {d.titulo ?? 'Descanso'}
                    </span>
                    {d.estado !== 'descanso' ? <PillEstado estado={d.estado} /> : null}
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-4 pb-4 pt-3">
              <FilaVacia texto="Sin plan esta semana" cta="Asignar" href={`/atletas/${id}?tab=plan`} />
            </div>
          )}

          {ajuste ? (
            <BandaAjuste
              athleteId={id}
              proposalId={ajuste.proposal_id}
              summary={ajuste.summary}
            />
          ) : null}
        </FichaCard>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FichaCard>
            <div className="flex items-baseline justify-between gap-2">
              <FichaLabel>Adherencia · 4 semanas</FichaLabel>
              {trend === 'cayendo' ? (
                <span className="text-[11.5px] font-semibold text-[color:var(--v2-danger)]">▼ cayendo</span>
              ) : trend === 'subiendo' ? (
                <span className="text-[11.5px] font-semibold text-[color:var(--v2-ok)]">▲ subiendo</span>
              ) : null}
            </div>
            {weeks.some((w) => w.pct != null) ? (
              <>
                <div className="mt-4 flex items-end gap-3">
                  {weeks.map((w) => {
                    const h = w.pct == null ? 8 : Math.max(12, Math.round((w.pct / 100) * 88));
                    const actual = w === weeks[weeks.length - 1];
                    const baja = actual && w.pct != null && w.pct < 60;
                    return (
                      <div key={w.week_start} className="flex flex-1 flex-col items-center gap-1.5">
                        {w.pct != null ? (
                          <span className="v2-num text-[11px] font-medium text-[color:var(--v2-fg)]">
                            {Math.round(w.pct)}%
                          </span>
                        ) : (
                          <span className="text-[11px] text-[color:var(--v2-faint)]">—</span>
                        )}
                        {/* La semana actual habla en tinta (o en danger si va baja);
                            las pasadas en un neutro que SÍ se ve sobre la card
                            (surface-2 se fundía con el fondo y las barras
                            desaparecían: solo se leían los números). */}
                        <div
                          className={cn(
                            'w-full rounded-[6px]',
                            baja
                              ? 'bg-[color:var(--v2-danger)]'
                              : actual
                                ? 'bg-[color:var(--v2-fg)]'
                                : 'bg-[color:var(--v2-border-strong)]',
                          )}
                          style={{ height: h }}
                        />
                        <span className="v2-num text-[10.5px] text-[color:var(--v2-muted)]">
                          {formatFechaCorta(w.week_start)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {frase ? (
                  <p className="mt-3 text-[13px] text-[color:var(--v2-muted)]">{frase}</p>
                ) : null}
              </>
            ) : (
              <p className="mt-3 text-[13px] text-[color:var(--v2-muted)]">
                Todavía no hay semanas que contar.
              </p>
            )}
          </FichaCard>

          <FichaCard>
            <div className="flex items-baseline justify-between gap-2">
              <FichaLabel>Último check-in</FichaLabel>
              {checkin ? (
                <span className="v2-num text-[11.5px] text-[color:var(--v2-muted)]">
                  {checkin.days_ago === 0
                    ? `hoy · ${checkin.time_label}`
                    : checkin.days_ago === 1
                      ? `ayer · ${formatFechaCorta(checkin.recorded_for)}`
                      : `hace ${checkin.days_ago} d`}
                </span>
              ) : null}
            </div>
            {checkin ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <Cifra
                    valor={readiness != null ? String(Math.round(readiness)) : '—'}
                    label="Readiness"
                    extra={delta != null ? `${delta > 0 ? '+' : ''}${Math.round(delta)}` : null}
                  />
                  <Cifra
                    valor={sleep != null ? formatSleepHours(sleep) : '—'}
                    label="Sueño"
                  />
                  <Cifra valor={`${checkin.soreness ?? '—'}/5`} label="Agujetas" />
                </div>
                {checkin.notes ? (
                  <blockquote className="mt-3 rounded-[var(--v2-r-m)] bg-[color:var(--v2-surface-2)] px-3 py-2.5 text-[13.5px] leading-snug text-[color:var(--v2-fg)]">
                    «{checkin.notes}»
                  </blockquote>
                ) : null}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[12.5px] text-[color:var(--v2-muted)]">
                    {respondido ? 'respondido' : 'sin responder'}
                  </span>
                  {!respondido ? (
                    <Link
                      href={`/atletas/${id}?tab=mensajes`}
                      className="v2-focus inline-flex h-[32px] items-center rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 text-[12.5px] font-semibold text-[color:var(--v2-accent-fg)]"
                    >
                      Responder
                    </Link>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="mt-3 text-[13px] text-[color:var(--v2-muted)]">Todavía no ha hecho check-in.</p>
            )}
          </FichaCard>
        </div>

        <FichaCard>
          <div className="flex items-baseline justify-between gap-2">
            <FichaLabel>Referencias</FichaLabel>
            {squat?.recorded_at ? (
              <span className="text-[11.5px] text-[color:var(--v2-muted)]">
                medidas {relativeWeeks(squat.recorded_at)}
              </span>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-1 divide-y divide-[color:var(--v2-border)] overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <RefCell
              label="Sentadilla"
              value={squat ? String(Math.round(squat.one_rm_kg)) : null}
              unit="kg"
              delta={squatDelta}
            />
            <RefCell
              label="Peso muerto"
              value={muerto ? String(Math.round(muerto.one_rm_kg)) : null}
              unit="kg"
            />
            <RefCell
              label="FC máx medida"
              value={detalle.max_hr_bpm != null ? String(Math.round(detalle.max_hr_bpm)) : null}
              unit="bpm"
            />
          </div>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {sinZonas ? (
              <FilaVacia texto="Zonas · sin calcular" cta="Registrar" href={`/atletas/${id}?tab=rendimiento&vista=ritmos`} />
            ) : null}
            {testsPendientes > 0 ? (
              <FilaVacia
                texto={`${testsPendientes} ${testsPendientes === 1 ? 'test' : 'tests'} sin resultado`}
                cta="Ver"
                href={`/atletas/${id}?tab=rendimiento&vista=fuerza`}
              />
            ) : null}
            {!cincoK || cincoK.results.length === 0 ? (
              <FilaVacia
                texto="5 km · sin registro"
                cta="Programar"
                href={`/atletas/${id}?tab=rendimiento&vista=fuerza`}
              />
            ) : null}
          </div>
        </FichaCard>
      </div>

      <div className="flex flex-col gap-4">
        <LesionCard athleteId={id} />

        {race ? (
          <FichaCard>
            <div className="flex items-start justify-between gap-2">
              <FichaLabel>Próxima carrera</FichaLabel>
              <span className="text-[11px] uppercase tracking-[0.06em] text-[color:var(--v2-faint)]">
                {[detalle.ficha.race_format, detalle.ficha.race_division].filter(Boolean).join(' · ')}
              </span>
            </div>
            <p className="mt-2 font-[family-name:var(--v2-font-display)] text-[20px] font-extrabold leading-none tracking-[-0.03em] text-[color:var(--v2-fg)]">
              {race.name}
            </p>
            <p className="mt-3 font-[family-name:var(--v2-font-display)] text-[42px] font-extrabold leading-none text-[color:var(--v2-fg)]">
              {semanasHasta(race.days_until)}
              <span className="ml-2 align-middle text-[12px] font-semibold tracking-[0.06em] text-[color:var(--v2-faint)]">
                SEMANAS
                {raceDate ? ` · ${formatFechaCorta(raceDate).toUpperCase()}` : ''}
              </span>
            </p>
            {goal != null ? (
              <dl className="mt-4 space-y-1 border-t border-[color:var(--v2-border)] pt-3 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-[color:var(--v2-muted)]">Objetivo</dt>
                  <dd className="v2-num font-medium text-[color:var(--v2-fg)]">{formatRaceTime(goal)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[color:var(--v2-muted)]">Proyección actual</dt>
                  <dd className="text-[color:var(--v2-faint)]">sin dato</dd>
                </div>
              </dl>
            ) : null}
          </FichaCard>
        ) : (
          <FilaVacia texto="Sin carrera asignada" cta="Añadir objetivo" href={`/atletas/${id}?tab=atleta`} />
        )}

        {nota ? (
          <section className="rounded-[14px] border border-dashed border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <FichaLabel>Nota privada</FichaLabel>
              <span className="text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--v2-faint)]">
                solo tú
              </span>
            </div>
            <p className="mt-2 text-[13.5px] leading-snug text-[color:var(--v2-fg)]">{nota.body}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Cifra({ valor, label, extra }: { valor: string; label: string; extra?: string | null }) {
  return (
    <div>
      <p className="font-[family-name:var(--v2-font-display)] text-[28px] font-extrabold leading-none tracking-[-0.03em] text-[color:var(--v2-fg)]">
        {valor}
        {extra ? (
          <span className="ml-1 align-top text-[12px] font-semibold text-[color:var(--v2-muted)]">
            {extra}
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[color:var(--v2-muted)]">
        {label}
      </p>
    </div>
  );
}

function RefCell({
  label,
  value,
  unit,
  delta,
}: {
  label: string;
  value: string | null;
  unit: string;
  delta?: number | null;
}) {
  return (
    <div className="px-3.5 py-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[color:var(--v2-muted)]">
        {label}
      </p>
      {value ? (
        <p className="mt-1 font-[family-name:var(--v2-font-display)] text-[28px] font-extrabold leading-none tracking-[-0.03em]">
          {value}
          <span className="ml-1 text-[12px] font-medium text-[color:var(--v2-muted)]">{unit}</span>
          {delta != null && delta !== 0 ? (
            <span className={cn('ml-1.5 text-[12px] font-semibold', delta > 0 ? 'text-[color:var(--v2-ok)]' : 'text-[color:var(--v2-danger)]')}>
              {delta > 0 ? '+' : ''}
              {Math.round(delta)}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="mt-1 text-[13px] text-[color:var(--v2-faint)]">sin registro</p>
      )}
    </div>
  );
}

function relativeWeeks(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const days = Math.max(0, Math.round((Date.now() - then) / 86_400_000));
  if (days < 7) return 'hace unos días';
  const w = Math.round(days / 7);
  return w === 1 ? 'hace 1 sem' : `hace ${w} sem`;
}

function BandaAjuste({
  athleteId,
  proposalId,
  summary,
}: {
  athleteId: string;
  proposalId: number;
  summary: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function aceptar() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/coach/athletes/${athleteId}/week-adjustment/${proposalId}/approve`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? 'No se pudo aplicar.');
        return;
      }
      router.refresh();
    } catch {
      setError('No se pudo aplicar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--v2-border)] bg-[color:var(--v2-accent-soft)] px-4 py-3">
      <p className="min-w-0 flex-1 text-[13px] text-[color:var(--v2-fg)]">
        <span className="font-semibold">Propuesta: </span>
        {summary}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {error ? <span className="text-[12px] text-[color:var(--v2-danger)]">{error}</span> : null}
        <button
          type="button"
          onClick={() => void aceptar()}
          disabled={busy}
          className="v2-focus inline-flex h-[32px] items-center rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 text-[12.5px] font-semibold text-[color:var(--v2-accent-fg)] disabled:opacity-60"
        >
          {busy ? 'Aplicando…' : 'Aceptar'}
        </button>
        <Link
          href={`/atletas/${athleteId}?tab=plan`}
          className="v2-focus inline-flex h-[32px] items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] px-3.5 text-[12.5px] font-semibold"
        >
          Ver
        </Link>
      </div>
    </div>
  );
}
