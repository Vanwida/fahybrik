import { Check } from 'lucide-react';
import type { RecentDay, RecentSession } from '@/lib/coach/deep-dive-types';

interface RecentWorkoutsProps {
  days: RecentDay[];
}

export function RecentWorkouts({ days }: RecentWorkoutsProps) {
  return (
    <section
      aria-label="Entrenos recientes"
      className="rounded-[var(--r-l)] border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-3"
    >
      <h3 className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
        Entrenos recientes
      </h3>

      <ul className="mt-2 flex flex-col divide-y divide-[color:var(--hairline)]/60">
        {days.map((day) => (
          <li key={day.iso_date} className="grid grid-cols-[60px_1fr] items-start gap-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
              {day.label}
            </span>
            <ul className="flex flex-col gap-1">
              {day.sessions.length === 0 ? (
                <li className="text-[11px] italic text-[color:var(--muted)]/70">— sin sesiones —</li>
              ) : (
                day.sessions.map((s, i) => <SessionRow key={i} session={s} />)
              )}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SessionRow({ session }: { session: RecentSession }) {
  const slotColor =
    session.slot === 'AM' ? 'text-[color:var(--z2)]'
    : session.slot === 'PM' ? 'text-[color:var(--z4)]'
    : 'text-[color:var(--muted)]';

  return (
    <li className="grid grid-cols-[40px_1fr_auto_auto_auto] items-baseline gap-3 text-[12px]">
      <span className={`font-mono text-[10px] uppercase tracking-[0.16em] ${slotColor}`}>
        {session.slot}
      </span>
      <span className="truncate text-[color:var(--fg)]">{session.title}</span>
      <span className="font-mono tabular-nums text-[11px] text-[color:var(--muted)]">
        {session.duration_seconds != null ? formatDuration(session.duration_seconds) : '—'}
      </span>
      <span className="font-mono tabular-nums text-[11px] text-[color:var(--muted)]">
        {session.rpe != null ? `RPE ${roundRpe(session.rpe)}` : ''}
      </span>
      <span className="flex items-center gap-1.5">
        {session.is_pr ? (
          <span className="rounded-[var(--r-pill)] bg-[color:var(--accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--accent-on)]">
            PR
          </span>
        ) : null}
        <StatusGlyph status={session.status} />
      </span>
    </li>
  );
}

function StatusGlyph({ status }: { status: RecentSession['status'] }) {
  if (status === 'completed') {
    return <Check className="size-3.5 text-[color:var(--ok)]" aria-label="completada" strokeWidth={2} />;
  }
  if (status === 'missed') {
    return <span aria-label="perdida" className="inline-block size-2 rounded-full bg-[color:var(--danger)]" />;
  }
  if (status === 'in_progress') {
    return (
      <span aria-label="en curso" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-[color:var(--accent)]">
        en curso
      </span>
    );
  }
  return <span aria-label="programada" className="inline-block size-2 rounded-full border border-[color:var(--muted)]" />;
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
  return `${m}:00`;
}

function roundRpe(rpe: number): string {
  if (Number.isInteger(rpe)) return `${rpe}`;
  return rpe.toFixed(1);
}
