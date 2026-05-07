import { ArrowDown, ArrowUp, AlertTriangle, Minus } from 'lucide-react';
import type {
  PerformanceBlock,
  PerformanceRow,
} from '@/lib/coach/deep-dive-types';

interface PerformanceTableProps {
  performance: PerformanceBlock;
}

export function PerformanceTable({ performance }: PerformanceTableProps) {
  return (
    <section
      aria-label="Performance por ejercicio"
      className="rounded-[var(--r-l)] border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-3"
    >
      <h3 className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
        Performance por ejercicio · últ. 90d
      </h3>
      <div className="mt-3 flex flex-col gap-3">
        {performance.groups.map((group) => (
          <Group key={group.key} title={group.label} rows={group.rows} />
        ))}
      </div>
    </section>
  );
}

function Group({ title, rows }: { title: string; rows: PerformanceRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <h4 className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--accent)]/80">{title}</h4>
        <p className="text-[11px] text-[color:var(--muted)]">tests programados — sin datos suficientes aún</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--accent)]/80">{title}</h4>
      <ul className="divide-y divide-[color:var(--hairline)]/50">
        {rows.map((row) => (
          <Row key={`${row.exercise_label}`} row={row} />
        ))}
      </ul>
    </div>
  );
}

function Row({ row }: { row: PerformanceRow }) {
  return (
    <li className="grid grid-cols-[1.4fr_auto_auto_auto_auto_auto] items-baseline gap-2 py-1.5 text-[12px] hover:bg-[color:var(--surface-elevated)]/40">
      <span className="text-[color:var(--fg)]">{row.exercise_label}</span>
      <span className="font-mono tabular-nums text-[11px] text-[color:var(--fg)]">
        {row.best_label ?? '—'}
        <span className="ml-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)]">best</span>
      </span>
      {row.avg_label ? (
        <span className="font-mono tabular-nums text-[11px] text-[color:var(--muted)]">
          {row.avg_label}
          <span className="ml-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)]/70">avg</span>
        </span>
      ) : <span aria-hidden />}
      <span className="flex items-center gap-1 font-mono text-[11px] text-[color:var(--muted)]">
        <Trend trend={row.trend} />
        {row.trend_pct != null && row.trend_pct !== 0 ? (
          <span className={row.trend_pct > 0 ? 'text-[color:var(--ok)]' : 'text-[color:var(--danger)]'}>
            {row.trend_pct > 0 ? '+' : ''}{row.trend_pct}%
          </span>
        ) : null}
      </span>
      <span className="text-[10px] uppercase tracking-[0.12em]">
        {row.variability ? <Variability variability={row.variability} /> : null}
      </span>
      <span className="text-[10px] text-[color:var(--muted)]">
        {row.last_done_label ?? '—'}
        {row.hint_text ? <span className="ml-1 text-[color:var(--muted)]">· {row.hint_text}</span> : null}
      </span>
    </li>
  );
}

function Trend({ trend }: { trend: PerformanceRow['trend'] }) {
  if (trend === 'up') return <ArrowUp className="size-3 text-[color:var(--ok)]" aria-label="al alza" strokeWidth={2} />;
  if (trend === 'down') return <ArrowDown className="size-3 text-[color:var(--danger)]" aria-label="a la baja" strokeWidth={2} />;
  if (trend === 'flat') return <Minus className="size-3 text-[color:var(--muted)]" aria-label="estable" strokeWidth={2} />;
  return null;
}

function Variability({ variability }: { variability: 'low' | 'med' | 'high' }) {
  if (variability === 'high') {
    return (
      <span
        title="CV alto — inconsistencia"
        className="inline-flex items-center gap-1 text-[color:var(--warning)]"
      >
        <AlertTriangle className="size-3" aria-hidden strokeWidth={2} />
        high
      </span>
    );
  }
  return (
    <span className="text-[color:var(--muted)]">
      {variability === 'low' ? 'low var' : 'med var'}
    </span>
  );
}
