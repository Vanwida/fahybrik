import Link from 'next/link';
import { ArrowLeft, Calendar } from 'lucide-react';
import type {
  AEvent,
  AthleteHeader as HeaderData,
} from '@/lib/coach/deep-dive-types';

interface AthleteHeaderProps {
  header: HeaderData;
  a_event: AEvent | null;
}

export function AthleteHeader({ header, a_event }: AthleteHeaderProps) {
  const stats = [
    header.age_years != null ? `${header.age_years}` : null,
    header.sex_label,
    header.height_cm != null ? `${header.height_cm}` : null,
    header.weight_kg != null ? `${header.weight_kg}kg` : null,
  ].filter((v): v is string => Boolean(v));

  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-[12px] text-[color:var(--muted)]">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-[var(--r-s)] px-1 py-0.5 hover:text-[color:var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
        >
          <ArrowLeft className="size-3.5" aria-hidden strokeWidth={1.5} />
          <span className="text-[11px] uppercase tracking-[0.16em]">Volver a atletas</span>
        </Link>
        {header.is_demo ? (
          <span className="rounded-[var(--r-pill)] border border-[color:var(--hairline)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
            Demo
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1
            className="text-[28px] italic leading-tight tracking-[-0.01em] text-[color:var(--fg)]"
            style={{ fontFamily: 'var(--font-display, var(--font-display-stack))', fontWeight: 900 }}
          >
            {header.full_name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[color:var(--muted)]">
            {stats.length > 0 ? (
              <span className="flex items-center gap-1.5 font-mono">
                {stats.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    {i > 0 ? <span className="text-[color:var(--muted)]/40">·</span> : null}
                    <span className="text-[color:var(--fg)]">{s}</span>
                  </span>
                ))}
              </span>
            ) : null}
            {header.experience_label ? (
              <span className="text-[color:var(--muted)]">{header.experience_label}</span>
            ) : null}
          </div>
        </div>

        {a_event ? (
          <div
            className="flex items-center gap-2 rounded-[var(--r-l)] border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 py-2"
            aria-label="A-event"
          >
            <Calendar className="size-4 text-[color:var(--accent)]" aria-hidden strokeWidth={1.5} />
            <div className="flex flex-col gap-0.5 text-right">
              <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">A-event</span>
              <span className="text-[13px] font-semibold text-[color:var(--fg)]">{a_event.name}</span>
              <span className="font-mono text-[11px] text-[color:var(--muted)]">
                {formatEventDate(a_event.iso_date)} ·{' '}
                <span className={a_event.days_until <= 30 ? 'text-[color:var(--accent)]' : 'text-[color:var(--fg)]'}>
                  {a_event.days_until >= 0 ? `${a_event.days_until} días` : 'pasado'}
                </span>
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function formatEventDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
