// v2 · ALTAS · QUEUE — the list of athletes awaiting intake review. Each card
// links to the per-athlete review screen (/atletas/[id]/intake). Honest empty
// state when there are no pending altas. Pure presentation over the loader data.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { EmptyState } from '@/components/v2/EmptyState';
import { Pill } from '@/components/v2/Pill';
import type { PendingIntakeAthlete } from '@/lib/coach/intake';
import { cn } from '@/lib/utils';

/** "hace N días/horas" tenure from the onboarding timestamp. */
function waitingLabel(hours: number): string {
  if (hours < 1) return 'recién llegado';
  if (hours < 24) return `esperando ${hours} h`;
  const days = Math.floor(hours / 24);
  return `esperando ${days} ${days === 1 ? 'día' : 'días'}`;
}

/** A-event date "12 oct 2026" from an ISO date, or null. */
function eventDateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(d)
    .replace(/\.$/, '');
}

export function AltasQueue({ pending }: { pending: PendingIntakeAthlete[] }) {
  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="v2-display text-3xl sm:text-4xl">
          <span className="text-[color:var(--v2-fg)]">Altas</span>
          {pending.length > 0 ? (
            <span className="text-[color:var(--v2-muted)]"> · {pending.length}</span>
          ) : null}
        </h1>
        <p className="text-sm text-[color:var(--v2-muted)]">
          Atletas que completaron el alta y esperan tu revisión antes de arrancar.
        </p>
      </div>

      {pending.length === 0 ? (
        <EmptyState
          icon="how_to_reg"
          title="No hay altas pendientes"
          description="Cuando un atleta nuevo complete su onboarding, aparecerá aquí para que revises su intake y le asignes su primer plan."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {pending.map((a) => {
            const eventDate = eventDateLabel(a.a_event_iso);
            return (
              <li key={a.athlete_id}>
                <Link
                  href={`/atletas/${a.athlete_id}/intake`}
                  className={cn(
                    'v2-focus group flex items-center gap-3.5 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3.5 shadow-[var(--v2-shadow-card)] transition-colors',
                    'hover:border-[color:var(--v2-border-strong)]',
                  )}
                >
                  <AthleteAvatar name={a.full_name} size="md" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
                        {a.full_name}
                      </span>
                      <Pill tone="info" variant="soft">
                        <MIcon name="hourglass_top" size={12} className="mr-0.5" />
                        {waitingLabel(a.hours_since_onboarded)}
                      </Pill>
                    </div>
                    <span className="truncate text-xs text-[color:var(--v2-muted)]">
                      {a.a_event_name ? (
                        <>
                          <MIcon name="flag" size={12} className="mr-1 align-middle" />
                          {a.a_event_name}
                          {eventDate ? ` · ${eventDate}` : ''}
                        </>
                      ) : (
                        <>
                          <MIcon
                            name="error"
                            size={12}
                            className="mr-1 align-middle text-[color:var(--v2-warn)]"
                          />
                          Sin evento objetivo configurado
                        </>
                      )}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--v2-accent)]">
                    Revisar alta
                    <MIcon
                      name="arrow_forward"
                      size={15}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
