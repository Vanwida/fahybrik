'use client';

// SemanaBoard — el zoom SEMANA del microciclo, según la maqueta aprobada
// (docs/design/microciclos-editor-rediseno-mockup.html · pantalla «Semana»):
//   · weekstrip: sesiones/bloques/ejercicios + barra apilada de modalidades +
//     chip ámbar «N bloques sin dosis» + Copiar a…/Duplicar semana.
//   · 7 columnas de día con TARJETAS DE SESIÓN (chip de slot + título + bloques
//     con lomo de modalidad, título bold y dosis en mono) y pie con mini-barra.
//   · día vacío = tarjeta compacta con tres acciones (＋ Entreno · Descanso ·
//     Copiar otro día aquí) — NUNCA una columna fantasma a toda altura.
// El color nunca es la única señal: toda barra/lomo va acompañada de texto.

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { MODALITY_META } from '@/components/v2/constants';
import { ModalityTag, SessionLine } from '@/components/v2/SessionLine';
import { OptionalBadge } from '@/components/v2/editor/compositor-chrome';
import { DAY_LABELS_FULL, dayCanvasHref, type DayModalityInfo } from '@/lib/dashboard/v2/planes-model';
import type { DaySessionInfo, DayBlockInfo } from '@/lib/dashboard/v2/planes-model';
import type { MicroWeek } from '@/components/v2/planes/MicrocicloEditor';
import { CopyIntoDayModal } from '@/components/v2/planes/CopyIntoDayModal';
import { StackBar, WeekStrip } from '@/components/v2/planes/WeekStrip';
import {
  blockSinDosis,
  dayBlocks,
  modalitySegments,
  slotLabelForIndex,
} from '@/components/v2/planes/semana-model';
import { cn } from '@/lib/utils';

// Nombre compartido de view-transition (v2-theme.css `.vt-day-editor`): la
// tarjeta clicada lo lleva imperativamente (ida) y la columna del día lo lleva
// por className cuando el editor colapsa de vuelta (vuelta).
export const VT_DAY_EDITOR = 'vt-day-editor';
// Cinturón y tirantes alrededor del API + reduced-motion (el CSS también guarda).
export function vtEnabled(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Copy del estado «sin dosis» — una sola grafía en tablero y chip (contrato §6).
const SIN_DOSIS_COPY = 'sin dosis · tócalo y escríbela';

// ── Una línea de bloque dentro de la tarjeta de sesión ───────────────────────
// Lomo de color = modalidad (neutro si no clasifica); título bold; debajo su
// dosis resumida en mono (el formateador es el de siempre: prescriptionToText
// vía planes-model, la MISMA línea que ya alimentaba los chips). Bloque sin
// dosis utilizable → punto ámbar + texto en --v2-warn (el punto es decorativo,
// el texto es la señal).
// Un bloque de la plantilla, con la MISMA voz que una sesión en la semana de la
// ficha (átomo compartido `SessionLine`): modalidad → título → dosis. Lo propio
// del editor se conserva: el acento lateral por modalidad, el badge de opcional
// y el aviso «sin dosis» (que aquí es un hueco a rellenar, no un dato ausente).
function BlockLine({ block }: { block: DayBlockInfo }) {
  const sinDosis = blockSinDosis(block);
  const first = block.lines[0];
  const doseLine = first ? `${first.name}${first.dose ? ` · ${first.dose}` : ''}` : null;
  return (
    <div
      className="min-w-0 rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface-2)] py-1 pl-2 pr-1.5"
      style={{
        borderLeft: `3px solid ${
          block.modality ? `var(${MODALITY_META[block.modality].colorVar})` : 'var(--v2-border-strong)'
        }`,
      }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <OptionalBadge optional={block.optional} />
        {block.modality ? <ModalityTag modality={block.modality} /> : null}
        {sinDosis ? (
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--v2-warn)]"
          />
        ) : null}
      </div>
      <SessionLine
        title={block.title}
        doseLines={!sinDosis && doseLine ? [doseLine] : []}
        doseMore={!sinDosis && doseLine ? Math.max(0, block.item_count - 1) : 0}
        fallback={
          sinDosis ? (
            <span className="font-semibold text-[color:var(--v2-warn)]">{SIN_DOSIS_COPY}</span>
          ) : null
        }
      />
    </div>
  );
}

// ── Tarjeta de UNA sesión (chip de slot + título + sus bloques) ──────────────
function SessionCard({
  session,
  sessionIndex,
  dayLabel,
  href,
  onNavigate,
}: {
  session: DaySessionInfo;
  sessionIndex: number;
  dayLabel: string;
  href: string;
  onNavigate: (href: string) => void;
}) {
  const slot = slotLabelForIndex(sessionIndex);
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!vtEnabled()) return; // Link soft-nav normal (instantáneo)
    e.preventDefault();
    e.currentTarget.style.setProperty('view-transition-name', VT_DAY_EDITOR);
    onNavigate(href);
  };
  return (
    <Link
      href={href}
      scroll={false}
      onClick={handleClick}
      aria-label={`${dayLabel} · ${slot}${session.focus ? ` · ${session.focus}` : ''} · ${session.blocks.length} ${session.blocks.length === 1 ? 'bloque' : 'bloques'}`}
      className="v2-focus block min-w-0 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-card)] transition-[transform,border-color] hover:border-[color:var(--v2-border-strong)] motion-safe:hover:-translate-y-0.5"
    >
      <div className="flex min-w-0 items-center gap-1.5 px-2 pt-1.5">
        <span className="shrink-0 text-eyebrow font-extrabold uppercase tracking-[0.08em] text-[color:var(--v2-accent-text)]">
          {slot}
        </span>
        {session.focus ? (
          <span className="truncate text-label font-bold text-[color:var(--v2-fg)]">
            {session.focus}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 px-1.5 pb-1.5 pt-1">
        {session.blocks.map((b, i) => (
          <BlockLine key={i} block={b} />
        ))}
        {session.blocks.length === 0 ? (
          <span className="px-0.5 pb-0.5 text-label text-[color:var(--v2-faint)]">
            sesión sin bloques
          </span>
        ) : null}
      </div>
    </Link>
  );
}

// ── Día vacío: tres acciones, cero columna fantasma ──────────────────────────
function EmptyDayCard({
  onAddWorkout,
  onMarkRest,
  onCopyHere,
  restBusy,
  restError,
}: {
  onAddWorkout: () => void;
  onMarkRest: () => void;
  onCopyHere: () => void;
  restBusy: boolean;
  restError: boolean;
}) {
  const action =
    'v2-focus flex w-full items-center gap-1.5 rounded-[var(--v2-r-s)] px-2 py-1.5 text-left text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)] disabled:opacity-60';
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border-strong)] p-1.5">
      <button type="button" onClick={onAddWorkout} className={action}>
        <MIcon name="add" size={15} />
        Entreno
      </button>
      <button type="button" onClick={onMarkRest} disabled={restBusy} className={action}>
        <MIcon name={restBusy ? 'progress_activity' : 'bedtime'} size={15} />
        {restBusy ? 'Marcando…' : 'Descanso'}
      </button>
      <button type="button" onClick={onCopyHere} className={action}>
        <MIcon name="content_copy" size={15} />
        Copiar otro día aquí
      </button>
      {restError ? (
        <p className="px-2 pb-1 text-nano font-semibold text-[color:var(--v2-danger)]">
          No se pudo marcar el descanso.
        </p>
      ) : null}
    </div>
  );
}

// ── Una columna de día del tablero ───────────────────────────────────────────
function DayColumn({
  day,
  dayIndex,
  href,
  onNavigate,
  carryMorphName,
  onMarkRest,
  onCopyHere,
  restBusy,
  restError,
}: {
  day: DayModalityInfo;
  dayIndex: number;
  href: string;
  onNavigate: (href: string) => void;
  carryMorphName: boolean;
  onMarkRest: () => void;
  onCopyHere: () => void;
  restBusy: boolean;
  restError: boolean;
}) {
  const label = DAY_LABELS_FULL[dayIndex];
  const hasContent = day.session_count > 0;

  const restClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!vtEnabled()) return;
    e.preventDefault();
    e.currentTarget.style.setProperty('view-transition-name', VT_DAY_EDITOR);
    onNavigate(href);
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', carryMorphName && VT_DAY_EDITOR)}>
      <div className="flex items-baseline justify-between gap-1 px-0.5">
        <span className="v2-display truncate text-body uppercase tracking-wide text-[color:var(--v2-fg)]">
          {label}
        </span>
        {day.block_count > 0 ? (
          <span className="v2-num shrink-0 text-eyebrow text-[color:var(--v2-faint)]">
            {day.block_count} bl
          </span>
        ) : null}
      </div>

      {hasContent ? (
        <>
          {day.sessions.map((s, i) => (
            <SessionCard
              key={i}
              session={s}
              sessionIndex={i}
              dayLabel={label}
              href={href}
              onNavigate={onNavigate}
            />
          ))}
          <div className="flex items-center gap-2 px-0.5">
            <StackBar
              segments={modalitySegments(dayBlocks(day))}
              heightClass="h-1"
              className="flex-1"
            />
            <span className="v2-num shrink-0 text-eyebrow text-[color:var(--v2-faint)]">
              {day.item_count} ej
            </span>
          </div>
        </>
      ) : day.is_rest ? (
        <Link
          href={href}
          scroll={false}
          onClick={restClick}
          aria-label={`${label} · descanso`}
          className="v2-focus flex flex-col items-center gap-1 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2 py-3 text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)]"
        >
          <MIcon name="bedtime" size={18} />
          <span className="text-label font-semibold">Descanso</span>
          {day.focus ? (
            <span className="px-1 text-center text-nano text-[color:var(--v2-faint)]">
              {day.focus}
            </span>
          ) : null}
          {day.has_recovery ? (
            <span
              className="inline-flex items-center gap-1 text-nano font-semibold"
              style={{ color: 'var(--v2-ok)' }}
            >
              <MIcon name="spa" size={11} />
              Recuperación
            </span>
          ) : null}
        </Link>
      ) : (
        <EmptyDayCard
          onAddWorkout={() => onNavigate(href)}
          onMarkRest={onMarkRest}
          onCopyHere={onCopyHere}
          restBusy={restBusy}
          restError={restError}
        />
      )}
    </div>
  );
}

// ── El tablero completo (weekstrip + 7 columnas) ─────────────────────────────
export function SemanaBoard({
  microcycleId,
  week,
  weekIndex,
  weeks,
  dayBase,
  onNavigate,
  collapseDay,
  onChanged,
  canCopyWeek,
  onCopyWeek,
  onDuplicateWeek,
  duplicating,
  duplicateError,
}: {
  microcycleId: string;
  week: MicroWeek;
  weekIndex: number;
  weeks: MicroWeek[];
  /** Índice plano del lunes de esta semana (weekIndex * 7). */
  dayBase: number;
  onNavigate: (href: string) => void;
  /** Columna 0-based en la que colapsa el editor de día (morph de vuelta). */
  collapseDay: number | null;
  /** Tras una mutación (descanso / copia) — el padre refresca el server data. */
  onChanged: () => void;
  canCopyWeek: boolean;
  onCopyWeek: () => void;
  onDuplicateWeek: () => void;
  duplicating: boolean;
  duplicateError: boolean;
}) {
  // «Descanso» de un día vacío: el MISMO guardado de día que usa el editor
  // (PUT program-weeks/[id]/day con kind:'rest' y cero sesiones), sin salir del
  // tablero. Transparencia: es una escritura real → estado busy + error honesto.
  const [restBusyDow, setRestBusyDow] = useState<number | null>(null);
  const [restErrorDow, setRestErrorDow] = useState<number | null>(null);
  const markRest = async (dow: number) => {
    if (restBusyDow != null) return;
    setRestBusyDow(dow);
    setRestErrorDow(null);
    try {
      const res = await fetch(`/api/coach/program-weeks/${week.id}/day`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ day_of_week: dow, kind: 'rest', sessions: [] }),
      });
      if (!res.ok) throw new Error(`rest failed (${res.status})`);
      onChanged();
    } catch {
      setRestErrorDow(dow);
    } finally {
      setRestBusyDow(null);
    }
  };

  // «Copiar otro día aquí» — el destino es el día vacío pulsado (1..7).
  const [copyIntoDow, setCopyIntoDow] = useState<number | null>(null);

  return (
    <>
      <WeekStrip
        week={week}
        onOpenSinDosis={(dow) => onNavigate(dayCanvasHref(microcycleId, dayBase + dow - 1))}
        canCopyWeek={canCopyWeek}
        onCopyWeek={onCopyWeek}
        onDuplicateWeek={onDuplicateWeek}
        duplicating={duplicating}
        duplicateError={duplicateError}
      />

      <div className="grid grid-cols-2 items-start gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {week.days.map((day, i) => (
          <DayColumn
            key={day.day_of_week}
            day={day}
            dayIndex={i}
            href={dayCanvasHref(microcycleId, dayBase + i)}
            onNavigate={onNavigate}
            carryMorphName={i === collapseDay}
            onMarkRest={() => void markRest(day.day_of_week)}
            onCopyHere={() => setCopyIntoDow(day.day_of_week)}
            restBusy={restBusyDow === day.day_of_week}
            restError={restErrorDow === day.day_of_week}
          />
        ))}
      </div>

      {copyIntoDow != null ? (
        <CopyIntoDayModal
          destWeekId={week.id}
          destWeekIndex={weekIndex}
          destDayOfWeek={copyIntoDow}
          weeks={weeks}
          onCopied={() => {
            setCopyIntoDow(null);
            onChanged();
          }}
          onClose={() => setCopyIntoDow(null)}
        />
      ) : null}
    </>
  );
}
