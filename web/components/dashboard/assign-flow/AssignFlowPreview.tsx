'use client';

import type {
  PublishPreview,
  PreviewSession,
  PreviewWeek,
} from '@/lib/dashboard/coach/publish-preview';
import {
  DAY_NAMES,
  addDaysIso,
  dayOfMonth,
  fmtRangeShort,
} from '@/components/dashboard/assign-flow/helpers';

// =============================================================================
// AssignFlow · zona 2 — preview SIEMPRE visible (mockup 04).
// Mini-calendario real semana a semana (datos de publish-preview, cero
// inventado) + línea resumen "N sesiones · fecha–fecha · fase X".
// Estados: hint (falta selección) / skeleton / error con reintentar / datos.
// =============================================================================

interface AssignFlowPreviewProps {
  /** Nombre de pila del atleta para "Recibe María" (null → "Recibe el atleta"). */
  athlete_first_name: string | null;
  /** true cuando atleta + microciclo están elegidos (el preview puede cargar). */
  ready: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  preview: PublishPreview | null;
  /** Etiqueta de fase ATR ("Acumulación") o null si el microciclo no la define. */
  phase_label: string | null;
}

export function AssignFlowPreview({
  athlete_first_name,
  ready,
  loading,
  error,
  onRetry,
  preview,
  phase_label,
}: AssignFlowPreviewProps) {
  return (
    <section
      aria-label={`Vista previa: lo que recibe ${athlete_first_name ?? 'el atleta'}`}
      aria-busy={loading}
      className="mx-6 rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--bg)] p-4"
    >
      <header className="flex flex-wrap items-baseline gap-3 pb-3">
        <p className="micro-label">
          Recibe {athlete_first_name ?? 'el atleta'}
        </p>
        {preview ? (
          <p className="ml-auto text-[12.5px] font-medium text-[color:var(--fg)]">
            <span className="metric-num font-semibold">{preview.session_count}</span>{' '}
            {preview.session_count === 1 ? 'sesión' : 'sesiones'}
            <span className="mx-1.5 text-[color:var(--text-muted)]">·</span>
            <span className="metric-num">
              {fmtRangeShort(preview.start_date, preview.end_date)}
            </span>
            {phase_label ? (
              <>
                <span className="mx-1.5 text-[color:var(--text-muted)]">·</span>
                fase{' '}
                <span className="font-semibold text-[color:var(--accent)]">{phase_label}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </header>

      {!ready ? (
        <p className="py-8 text-center text-sm text-[color:var(--text-muted)]">
          Elige atleta y bloque para ver la vista previa.
        </p>
      ) : error ? (
        <div role="alert" className="grid justify-items-center gap-3 py-8 text-center">
          <p className="text-sm text-[color:var(--danger)]">
            No se pudo generar la vista previa: {error}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="focus-ring rounded-[var(--r-m)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[color:var(--fg)] hover:border-[color:var(--hairline)]"
          >
            Reintentar
          </button>
        </div>
      ) : loading && !preview ? (
        <PreviewSkeleton />
      ) : preview ? (
        <div className={loading ? 'opacity-60 transition-opacity' : undefined}>
          {preview.session_count === 0 ? (
            <p
              role="alert"
              className="mb-3 rounded-[var(--r-m)] border border-[color:var(--warning)] bg-[color:color-mix(in_srgb,var(--warning)_12%,transparent)] px-3 py-2 text-xs text-[color:var(--warning)]"
            >
              Este bloque no tiene sesiones con estructura: crearlo no entregaría
              ninguna sesión. Añade contenido antes de programarlo.
            </p>
          ) : null}
          <PreviewCalendar weeks={preview.weeks} />
        </div>
      ) : (
        <PreviewSkeleton />
      )}
    </section>
  );
}

function PreviewSkeleton() {
  return (
    <div aria-hidden className="grid animate-pulse gap-2 py-2">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-14 rounded-[var(--r-m)] bg-[color:var(--surface-container-low)]"
        />
      ))}
      <p className="sr-only">Generando vista previa…</p>
    </div>
  );
}

function PreviewCalendar({ weeks }: { weeks: PreviewWeek[] }) {
  return (
    <div className="grid grid-cols-[88px_repeat(7,minmax(0,1fr))]">
      <span aria-hidden />
      {DAY_NAMES.map((d) => (
        <span
          key={d}
          className="py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--text-muted)]"
        >
          {d}
        </span>
      ))}

      {weeks.map((week) => (
        <WeekRow key={week.week_number} week={week} />
      ))}
    </div>
  );
}

function WeekRow({ week }: { week: PreviewWeek }) {
  const byDow = new Map(week.days.map((d) => [d.day_of_week, d]));
  const isDeload = /deload/i.test(week.name);

  return (
    <>
      <div className="grid content-center gap-0.5 border-t border-[color:var(--border-subtle)] py-2 pr-2">
        <span className="font-display text-xs font-extrabold uppercase italic tracking-[0.03em]">
          Sem {week.week_number}
        </span>
        <span className="metric-num text-[10px] text-[color:var(--text-muted)]">
          {fmtRangeShort(week.week_start, week.week_end)}
        </span>
        {isDeload ? (
          <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[color:var(--tertiary)]">
            Deload
          </span>
        ) : null}
      </div>

      {DAY_NAMES.map((_, idx) => {
        const dow = idx + 1;
        const day = byDow.get(dow);
        const dateIso = addDaysIso(week.week_start, idx);
        const sessions = day?.sessions ?? [];
        return (
          <div
            key={dow}
            className="grid min-h-[64px] content-start gap-1 border-l border-t border-[color:var(--border-subtle)] p-1"
          >
            <span className="metric-num px-1 text-[10px] text-[color:var(--text-muted)]">
              {dayOfMonth(dateIso)}
            </span>
            {sessions.length === 0 ? (
              <span className="px-1 text-[10px] text-[color:var(--text-muted)] opacity-50">
                Descanso
              </span>
            ) : (
              sessions.map((s, si) => <SessionPill key={`${dateIso}-${si}`} session={s} />)
            )}
          </div>
        );
      })}
    </>
  );
}

function SessionPill({ session }: { session: PreviewSession }) {
  const label = sessionPillLabel(session);
  const needsReview = session.blocks.some((b) => b.needs_review);
  const isEmpty = !session.materializes && session.blocks.length === 0;
  const title = pillTitle(session, needsReview, isEmpty);

  return (
    <span
      title={title}
      className={
        isEmpty
          ? 'truncate rounded-[var(--r-s)] bg-[color:var(--surface-container-low)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--text-muted)]'
          : needsReview
            ? 'truncate rounded-[var(--r-s)] bg-[color:color-mix(in_srgb,var(--warning)_14%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--warning)]'
            : 'truncate rounded-[var(--r-s)] bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--accent)]'
      }
    >
      {label}
    </span>
  );
}

function sessionPillLabel(s: PreviewSession): string {
  if (s.template_name) return s.template_name;
  if (s.focus) return s.focus;
  const block = s.blocks[0]?.title;
  if (block) return block;
  return slotLabel(s.slot);
}

// Tooltip honesto: slot + detalle + avisos (bloque sin desglosar / vacía).
function pillTitle(s: PreviewSession, needsReview: boolean, isEmpty: boolean): string {
  const parts = [slotLabel(s.slot)];
  if (s.focus) parts.push(s.focus);
  if (s.template_name) parts.push(s.template_name);
  for (const b of s.blocks) {
    parts.push(b.exercises.length > 0 ? `${b.title}: ${b.exercises.join(', ')}` : b.title);
  }
  if (needsReview) parts.push('Bloque sin desglosar — el atleta verá la prescripción.');
  if (isEmpty) parts.push('Sesión vacía — no se entregará.');
  return parts.join(' · ');
}

function slotLabel(slot: string): string {
  if (slot === 'am') return 'AM';
  if (slot === 'pm') return 'PM';
  return slot.replace('slot:', 'Sesión ');
}
