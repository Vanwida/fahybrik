'use client';

// DayHeader — la cabecera de la hoja del día (rediseño de microciclos): ‹ ›
// navegan de día, título en v2-display, contador honesto «N sesiones · N bloques
// · N ejercicios», toggle Entreno/Descanso, «Copiar día a…» y Guardar con el
// punto ámbar de cambios sin guardar. Extraída de DayEditor.tsx (techo de 500
// líneas); el estado vive en el orquestador.

import { Link } from '@/i18n/navigation';
import type { WeekDayKind } from '@fahybrid/shared/schema/program-templates';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { SAVE_ICON, SAVE_LABEL, type SaveState } from './day-editor-io';

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

const NAV_BTN =
  'v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)] disabled:cursor-not-allowed disabled:opacity-40';

export function DayHeader({
  dayLabel,
  embedded,
  onBackToWeek,
  backHref,
  backBehindRail,
  showNav,
  onPrev,
  onNext,
  isRest,
  sessionCount,
  blockCount,
  exerciseCount,
  recoveryCount,
  kind,
  onChangeKind,
  showCopy,
  copyEnabled,
  copyTitle,
  onCopy,
  saveState,
  canSave,
  saveBlockedReason,
  dirty,
  onSave,
}: {
  dayLabel: string;
  embedded: boolean;
  onBackToWeek?: () => void;
  /** Vuelta standalone (sin canvas): enlace a la semana. */
  backHref?: string | null;
  /** El carril ya lleva «← Semana» en ancho: la vuelta de cabecera se esconde ahí. */
  backBehindRail: boolean;
  showNav: boolean;
  /** null = borde de la semana (deshabilitado). */
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  isRest: boolean;
  sessionCount: number;
  blockCount: number;
  exerciseCount: number;
  recoveryCount: number;
  kind: WeekDayKind;
  onChangeKind: (kind: WeekDayKind) => void;
  showCopy: boolean;
  copyEnabled: boolean;
  copyTitle: string;
  onCopy: () => void;
  saveState: SaveState;
  canSave: boolean;
  saveBlockedReason: string | null;
  dirty: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        {onBackToWeek ? (
          <button
            type="button"
            onClick={onBackToWeek}
            className={cn(
              'v2-focus inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]',
              backBehindRail && 'min-[900px]:hidden',
            )}
          >
            <MIcon name="arrow_back" size={15} />
            Semana
          </button>
        ) : backHref ? (
          <Link
            href={backHref}
            scroll={false}
            className="v2-focus inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="arrow_back" size={15} />
            Volver a la semana
          </Link>
        ) : null}

        {/* Título del día con ‹ › — pasan de día; deshabilitado en los bordes. */}
        <div className="flex min-w-0 items-center gap-1.5">
          {showNav ? (
            <button
              type="button"
              onClick={() => onPrev?.()}
              disabled={!onPrev}
              aria-label="Día anterior"
              className={NAV_BTN}
            >
              <MIcon name="chevron_left" size={18} />
            </button>
          ) : null}
          <h1
            className={
              embedded
                ? 'v2-display min-w-0 truncate text-2xl sm:text-3xl'
                : 'v2-display min-w-0 truncate text-3xl sm:text-4xl'
            }
          >
            {dayLabel}
          </h1>
          {showNav ? (
            <button
              type="button"
              onClick={() => onNext?.()}
              disabled={!onNext}
              aria-label="Día siguiente"
              className={NAV_BTN}
            >
              <MIcon name="chevron_right" size={18} />
            </button>
          ) : null}
        </div>

        {/* Contador honesto del contenido del día. */}
        <p className="text-body text-[color:var(--v2-muted)]">
          {isRest ? (
            <>
              Descanso
              {recoveryCount > 0 ? (
                <>
                  {' · '}
                  <span className="v2-num">{recoveryCount}</span>{' '}
                  {plural(recoveryCount, 'sugerencia', 'sugerencias')}
                </>
              ) : null}
            </>
          ) : (
            <>
              <span className="v2-num">{sessionCount}</span>{' '}
              {plural(sessionCount, 'sesión', 'sesiones')} ·{' '}
              <span className="v2-num">{blockCount}</span>{' '}
              {plural(blockCount, 'bloque', 'bloques')} ·{' '}
              <span className="v2-num">{exerciseCount}</span>{' '}
              {plural(exerciseCount, 'ejercicio', 'ejercicios')}
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <DayKindToggle kind={kind} onChange={onChangeKind} />
        {showCopy ? (
          <button
            type="button"
            onClick={onCopy}
            disabled={!copyEnabled}
            title={copyTitle}
            className="v2-focus inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3.5 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:opacity-50"
          >
            <MIcon name="content_copy" size={16} />
            Copiar día a…
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSave}
          disabled={saveState === 'saving' || !canSave}
          aria-live="polite"
          title={canSave ? undefined : saveBlockedReason ?? undefined}
          className={cn(
            'v2-focus relative inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-s)] px-4 text-sm font-bold transition-colors',
            saveState === 'error'
              ? 'bg-[color:var(--v2-danger)] text-white'
              : 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)] disabled:opacity-60',
          )}
        >
          <MIcon name={SAVE_ICON[saveState]} size={17} />
          {SAVE_LABEL[saveState]}
          {/* Punto ámbar: hay cambios sin guardar. */}
          {dirty && saveState === 'idle' ? (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[color:var(--v2-bg)] bg-[color:var(--v2-warn)]"
            />
          ) : null}
        </button>
      </div>
    </div>
  );
}

// Entreno / Descanso — el día tipado (#47). 'workout' activo = acento (estado
// primario); 'rest' activo = relleno neutro + luna, para que nunca se lea como
// la acción naranja primaria. Los dos siempre visibles para alternar.
function DayKindToggle({
  kind,
  onChange,
}: {
  kind: WeekDayKind;
  onChange: (kind: WeekDayKind) => void;
}) {
  const base =
    'v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-pill)] px-3.5 py-1.5 text-xs font-semibold transition-colors';
  return (
    <div
      role="group"
      aria-label="Tipo del día"
      className="inline-flex items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-0.5"
    >
      <button
        type="button"
        onClick={() => onChange('workout')}
        aria-pressed={kind === 'workout'}
        className={
          kind === 'workout'
            ? `${base} bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]`
            : `${base} text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]`
        }
      >
        Entreno
      </button>
      <button
        type="button"
        onClick={() => onChange('rest')}
        aria-pressed={kind === 'rest'}
        className={
          kind === 'rest'
            ? `${base} text-[color:var(--v2-fg)]`
            : `${base} text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]`
        }
        style={
          kind === 'rest'
            ? { background: 'color-mix(in srgb, var(--v2-fg) 12%, transparent)' }
            : undefined
        }
      >
        <MIcon name="bedtime" size={14} />
        Descanso
      </button>
    </div>
  );
}
