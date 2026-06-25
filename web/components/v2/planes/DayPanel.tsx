'use client';

// Screen 6 · Panel ③ Día/sesión — the working canvas for the selected day. Day
// chips (L–D, modality-tinted) switch the day; the selected day shows its real
// sessions (modality-tagged, "✎ editar bloques →" linking to the microcycle day
// editor when a microcycle exists) or a dashed "+ añadir sesión" drop target.
// Below: candidate sessions from the coach's library + a suggestion card, and a
// pinned borrador → publicar gate (notice + Vista previa / Publicar fase).

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { Card } from '@/components/v2/Card';
import { EmptyState } from '@/components/v2/EmptyState';
import { ModalityTag, ModalityDot } from '@/components/v2/planes/parts';
import {
  DAY_LABELS_FULL,
  DAY_LABELS_SHORT,
  type DayModalityInfo,
  type PlanPhase,
} from '@/lib/dashboard/v2/planes-model';
import { MODALITY_META } from '@/components/v2/constants';
import type { PlanSessionCandidate } from '@/components/v2/planes/PlanPorFases';
import { cn } from '@/lib/utils';

function DayChips({
  week,
  dayIndex,
  onSelect,
}: {
  week: DayModalityInfo[];
  dayIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {week.map((d, i) => {
        const active = i === dayIndex;
        const mod = d.dominant;
        return (
          <button
            key={d.day_of_week}
            type="button"
            onClick={() => onSelect(i)}
            aria-pressed={active}
            aria-label={DAY_LABELS_FULL[i]}
            className={cn(
              'v2-focus flex flex-col items-center gap-1 rounded-[var(--v2-r-s)] border py-1.5 transition-colors',
              active
                ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)]'
                : 'border-[color:var(--v2-border)] hover:border-[color:var(--v2-border-strong)]',
            )}
          >
            <span className="text-[10px] font-bold uppercase text-[color:var(--v2-muted)]">
              {DAY_LABELS_SHORT[i]}
            </span>
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: mod ? `var(${MODALITY_META[mod].colorVar})` : 'var(--v2-faint)',
                opacity: mod ? 1 : 0.4,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

export function DayPanel({
  phase,
  week,
  weekIndex,
  day,
  dayIndex,
  onSelectDay,
  candidates,
  first_month_id,
}: {
  phase: PlanPhase | null;
  week: DayModalityInfo[];
  weekIndex: number;
  day: DayModalityInfo;
  dayIndex: number;
  onSelectDay: (i: number) => void;
  candidates: PlanSessionCandidate[];
  first_month_id: string | null;
}) {
  const dayLabel = DAY_LABELS_FULL[dayIndex] ?? '';
  const hasSessions = day.session_count > 0;
  const draft = phase?.status === 'draft';
  const editHref =
    first_month_id != null
      ? `/microciclos/${first_month_id}/dia/${dayIndex}`
      : null;

  return (
    <section
      className="flex flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]"
      aria-label="Sesiones del día"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[color:var(--v2-border)] px-3 py-2.5">
        <h2 className="v2-micro">
          {phase ? `${phase.name} · Semana ${weekIndex + 1}` : 'Día'}
        </h2>
        {hasSessions ? (
          <Pill tone="ok" variant="soft">
            <span className="v2-num">{day.session_count}</span>&nbsp;sesión
            {day.session_count > 1 ? 'es' : ''}
          </Pill>
        ) : (
          <Pill tone="neutral" variant="soft">
            descanso
          </Pill>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-3 p-3">
        {/* Day selector */}
        <DayChips week={week} dayIndex={dayIndex} onSelect={onSelectDay} />

        {/* Selected day's sessions */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-[color:var(--v2-fg)]">{dayLabel}</p>

          {hasSessions ? (
            day.modalities.length > 0 ? (
              <Card className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
                      Sesión del día
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {day.modalities.map((m) => (
                        <ModalityTag key={m} modality={m} />
                      ))}
                    </div>
                  </div>
                  {editHref ? (
                    <Link
                      href={editHref}
                      className="v2-focus inline-flex shrink-0 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2 py-1 text-[11px] font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
                    >
                      <MIcon name="edit" size={14} /> editar bloques
                    </Link>
                  ) : null}
                </div>
                <p className="v2-num mt-2 text-[11px] text-[color:var(--v2-faint)]">
                  {day.block_count} bloque{day.block_count !== 1 ? 's' : ''}
                </p>
              </Card>
            ) : (
              <Card className="p-3 text-xs text-[color:var(--v2-muted)]">
                Sesión programada — abre el editor de día para ver los bloques.
              </Card>
            )
          ) : (
            <EmptyState
              icon="add_circle"
              title="Día libre"
              description="Añade una sesión o arrastra una de la biblioteca."
              className="py-6"
            />
          )}

          {/* + añadir / arrastrar de biblioteca (drop target) */}
          <button
            type="button"
            // TODO(endpoint): wire add-session to plan-by-phase persistence once
            // the plan/day write endpoint exists (the day editor handles real
            // microcycle days today).
            className="v2-focus flex items-center justify-center gap-1.5 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] py-2.5 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="add" size={16} /> Añadir sesión · arrastrar de biblioteca
          </button>
        </div>

        {/* Library candidates */}
        <div className="flex flex-col gap-2">
          <p className="v2-micro">Biblioteca · arrastra al día</p>
          {candidates.length === 0 ? (
            <EmptyState
              icon="folder_open"
              title="Sin sesiones en la biblioteca"
              description="Crea sesiones en la biblioteca para arrastrarlas aquí."
              className="py-6"
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              {candidates.slice(0, 5).map((c) => (
                <Link
                  key={c.id}
                  href={`/biblioteca/sesion/${c.id}`}
                  className="v2-focus flex items-center gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2 transition-colors hover:border-[color:var(--v2-border-strong)]"
                  style={{
                    borderLeftWidth: '3px',
                    borderLeftColor: `var(${MODALITY_META[c.modality].colorVar})`,
                  }}
                >
                  <ModalityDot modality={c.modality} />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[color:var(--v2-fg)]">
                    {c.name}
                  </span>
                  <span className="v2-num shrink-0 text-[10px] text-[color:var(--v2-faint)]">
                    {c.block_count} bl
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Suggestion card (info) */}
        <Card
          className="flex items-start gap-2 p-2.5"
          style={{ background: 'var(--v2-info-soft)', borderColor: 'transparent' }}
        >
          <span className="mt-0.5 shrink-0 text-[color:var(--v2-info)]">
            <MIcon name="auto_awesome" size={16} />
          </span>
          <p className="text-[11px] leading-relaxed text-[color:var(--v2-fg)]">
            <span className="font-semibold">Sugerencia.</span> En {phase?.name ?? 'esta fase'} el
            día tras una sesión de intensidad suele ir Zona 2 o descanso activo. Revisa la carga
            antes de publicar.
          </p>
        </Card>
      </div>

      {/* Pinned borrador → publicar gate */}
      {draft ? (
        <div className="rounded-b-[var(--v2-r-l)] border-t border-[color:var(--v2-border)] bg-[color:var(--v2-warn-soft)] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--v2-warn)]">
            <MIcon name="warning" size={14} />
            Esta fase está en borrador — no visible para el atleta.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              // TODO(endpoint): wire preview once the plan preview route exists.
              className="v2-focus inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]"
            >
              <MIcon name="visibility" size={15} /> Vista previa
            </button>
            <button
              type="button"
              // TODO(endpoint): wire to the phase publish mutation.
              className="v2-focus inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
            >
              Publicar fase
              <MIcon name="arrow_forward" size={15} />
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-b-[var(--v2-r-l)] border-t border-[color:var(--v2-border)] bg-[color:var(--v2-ok-soft)] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--v2-ok)]">
            <MIcon name="check_circle" size={14} />
            Fase publicada — visible en el plan del atleta.
          </p>
        </div>
      )}
    </section>
  );
}
