import type { ModalityDistribution as ModalityData, ModalityRow } from '@/lib/coach/deep-dive-types';

interface ModalityDistributionProps {
  modality: ModalityData;
}

export function ModalityDistribution({ modality }: ModalityDistributionProps) {
  const totalLabel = `${formatHours(modality.total_hours)} · ${modality.sessions_count} sesiones${
    modality.twice_daily_days_label ? ` · 2x/día ${modality.twice_daily_days_label}` : ''
  }`;
  return (
    <section
      aria-label="Distribución por modalidad últimos 7 días"
      className="rounded-[var(--r-l)] border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-3"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
          Distribución por modalidad · últ. 7d
        </h3>
        <span className="font-mono text-[11px] text-[color:var(--muted)]">{totalLabel}</span>
      </header>

      <ul className="mt-3 flex flex-col gap-1.5">
        {modality.rows.map((row) => (
          <ModalityBar key={row.key} row={row} />
        ))}
      </ul>
    </section>
  );
}

function ModalityBar({ row }: { row: ModalityRow }) {
  const aux = [
    row.km != null ? `${row.km} km` : null,
    row.kg != null ? `~${formatKg(row.kg)} kg` : null,
  ].filter(Boolean).join(' · ');

  // Modality bars use the zone palette so orange remains brand-only.
  const color =
    row.key === 'running' ? 'var(--z2)' :
    row.key === 'strength' ? 'var(--z4)' :
    row.key === 'hyrox' ? 'var(--z3)' :
    row.key === 'skill' ? 'var(--z1)' :
    'var(--muted)';

  return (
    <li className="grid grid-cols-[120px_1fr_auto] items-center gap-3 text-[12px]">
      <span className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)]">{row.label}</span>
      <span
        role="img"
        aria-label={`${row.label} ${row.pct}%`}
        className="block h-2 overflow-hidden rounded-[2px] bg-[color:var(--surface-elevated)]"
      >
        <span
          className="block h-full"
          style={{ width: `${row.pct}%`, background: color }}
        />
      </span>
      <span className="flex items-center gap-2 font-mono tabular-nums text-[11px] text-[color:var(--fg)]">
        <span>{formatHours(row.hours)}</span>
        <span className="text-[color:var(--muted)]">·</span>
        <span>{row.pct}%</span>
        {aux ? (
          <>
            <span className="text-[color:var(--muted)]">·</span>
            <span className="text-[color:var(--muted)]">{aux}</span>
          </>
        ) : null}
      </span>
    </li>
  );
}

function formatHours(h: number): string {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function formatKg(kg: number): string {
  if (kg >= 1000) {
    const k = kg / 1000;
    return `${k.toFixed(k >= 10 ? 0 : 1)}k`;
  }
  return `${Math.round(kg)}`;
}
