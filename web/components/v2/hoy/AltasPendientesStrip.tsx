// AltasPendientesStrip — decision strip for athletes who completed onboarding but
// whose intake the coach hasn't reviewed yet (intake_pending). Rendered above the
// Hoy board, matching the other decision strips. Each card links to the per-athlete
// intake review; the header links to the full /altas queue.

import { Link } from '@/i18n/navigation';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { MIcon } from '@/components/ui/MIcon';
import type { PendingIntakeAthlete } from '@/lib/coach/intake';

function waitingLabel(hours: number): string {
  if (hours < 1) return 'recién llegado';
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'día' : 'días'}`;
}

export function AltasPendientesStrip({ pending }: { pending: PendingIntakeAthlete[] }) {
  if (pending.length === 0) return null;

  return (
    <section aria-label="Altas sin revisar" className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <MIcon name="how_to_reg" size={16} className="text-[color:var(--v2-accent)]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]">
          Altas sin revisar
        </span>
        <span
          className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent)' }}
        >
          {pending.length}
        </span>
        <Link
          href="/altas"
          className="v2-focus ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
        >
          Ver todas
          <MIcon name="arrow_forward" size={13} />
        </Link>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {pending.map((a) => (
          <Link
            key={a.athlete_id}
            href={`/atletas/${a.athlete_id}/intake`}
            className="v2-focus group w-60 shrink-0 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2.5 transition-colors hover:border-[color:var(--v2-border-strong)]"
          >
            <div className="flex items-center gap-2.5">
              <AthleteAvatar name={a.full_name} size="md" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
                  {a.full_name}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--v2-faint)]">
                  <MIcon name="hourglass_top" size={12} />
                  esperando {waitingLabel(a.hours_since_onboarded)}
                </span>
              </div>
            </div>
            <span className="mt-2.5 inline-flex h-7 w-full items-center justify-center gap-1 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] text-[11px] font-semibold text-[color:var(--v2-accent-fg)] transition-colors group-hover:bg-[color:var(--v2-accent-press)]">
              Revisar alta
              <MIcon name="arrow_forward" size={14} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
