// Sticky footer gate bar for the V2 intake review. LEFT: micro-label "Listo para
// asignar" + a row of gate chips reflecting LIVE state (Evento · Nivel ·
// Estructura · Avisos a/t · Bienvenida), each color+icon+label by satisfied/
// unsatisfied. RIGHT: a muted sub-line naming what's blocking + the primary
// "Asignar plan" button (orange, disabled until canAssign; "Asignando…" while
// pending). Submit error renders role=alert above the bar.

import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { cn } from '@/lib/utils';

export interface GateState {
  hasEvent: boolean;
  levelOk: boolean;
  blocksValid: boolean;
  ackedCount: number;
  totalWarnings: number;
  welcomeValid: boolean;
}

export function IntakeGateBar({
  gates,
  canAssign,
  pending,
  blockingLabel,
  errorMessage,
  onAssign,
}: {
  gates: GateState;
  canAssign: boolean;
  pending: boolean;
  /** Short muted sub-line naming what's blocking; null when all clear. */
  blockingLabel: string | null;
  errorMessage: string | null;
  onAssign: () => void;
}) {
  const warningsOk = gates.ackedCount >= gates.totalWarnings;

  return (
    <div className="sticky bottom-0 z-30 mt-2 border-t border-[color:var(--v2-border)] bg-[color:color-mix(in_srgb,var(--v2-bg)_92%,transparent)] backdrop-blur-md">
      {errorMessage ? (
        <p
          role="alert"
          className="mt-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-danger)] bg-[color:var(--v2-danger-soft)] px-3 py-2.5 text-sm text-[color:var(--v2-fg)]"
        >
          {errorMessage}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 py-3">
        <div className="flex flex-col gap-1.5">
          <span className="v2-micro">Listo para asignar</span>
          <div className="flex flex-wrap items-center gap-2">
            <GateChip ok={gates.hasEvent} label="Evento" />
            <GateChip ok={gates.levelOk} label="Nivel" />
            <GateChip ok={gates.blocksValid} label="Estructura" />
            <GateChip
              ok={warningsOk}
              label={`Avisos ${gates.ackedCount}/${gates.totalWarnings}`}
            />
            <GateChip ok={gates.welcomeValid} label="Bienvenida" />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-4">
          {blockingLabel ? (
            <span className="v2-num hidden text-xs text-[color:var(--v2-muted)] sm:inline">
              {blockingLabel}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onAssign}
            disabled={!canAssign}
            aria-busy={pending}
            className={cn(
              'v2-focus inline-flex items-center justify-center gap-2 rounded-[var(--v2-r-m)] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
              'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]',
              'hover:bg-[color:var(--v2-accent-press)]',
              'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[color:var(--v2-accent)]',
            )}
          >
            <MIcon name={canAssign ? 'rocket_launch' : 'lock'} size={16} aria-hidden />
            {pending ? 'Asignando…' : 'Asignar plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GateChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Pill tone={ok ? 'ok' : 'danger'} variant="soft">
      <MIcon name={ok ? 'check' : 'close'} size={12} aria-hidden />
      {label}
    </Pill>
  );
}
