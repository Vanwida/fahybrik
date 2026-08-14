'use client';

// PendingCitasCard → "Próximas llamadas": the coach's upcoming confirmed videollamadas at
// the top of /leads, soonest first. Auto-accept (#2/#4) means a booking is already
// confirmed — there is no Aceptar/Rechazar here anymore. Each row jumps to the lead detail
// (where Cancelar / Completada / No asistió live) and offers the Meet join link if set.
// The parent only renders this when there is at least one upcoming call.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/v2/Pill';
import { formatCitaDateTime } from '@/components/v2/citas/format';
import type { UpcomingCall } from '@/lib/citas/store';

export function PendingCitasCard({ calls }: { calls: UpcomingCall[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <MIcon name="event_upcoming" size={18} className="text-[color:var(--v2-accent)]" />
          <h2 className="text-sm font-semibold text-[color:var(--v2-fg)]">Próximas llamadas</h2>
          <Pill tone="info" variant="soft">
            <span className="v2-num">{calls.length}</span>
          </Pill>
        </div>
        <Link
          href="/disponibilidad"
          className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="calendar_month" size={15} />
          Disponibilidad
        </Link>
      </div>

      <ul>
        {calls.map((c) => {
          const name = c.lead_nombre?.trim() || c.lead_email;
          return (
            <li
              key={c.id}
              className="flex flex-col gap-3 border-b border-[color:var(--v2-border)] px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <Link
                href={`/leads/${c.lead_id}`}
                className="v2-focus group flex min-w-0 items-center gap-2.5 rounded-[var(--v2-r-s)]"
              >
                <AthleteAvatar name={name} size="sm" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)] transition-colors group-hover:text-[color:var(--v2-accent)]">
                    {name}
                  </span>
                  <span className="v2-num truncate text-label text-[color:var(--v2-muted)]">
                    {formatCitaDateTime(c.requested_start)} · {c.duration_minutes} min
                  </span>
                </div>
              </Link>

              {c.meet_link ? (
                <a
                  href={c.meet_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="v2-focus inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2.5 text-xs font-semibold text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]"
                >
                  <MIcon name="videocam" size={15} />
                  Unirse
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
