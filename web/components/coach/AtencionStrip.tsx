'use client';

import { Plus, AlertTriangle } from 'lucide-react';
import type { CohortRow } from '@/lib/coach/types';

interface AtencionStripProps {
  rows: CohortRow[];
  refreshed_relative?: string;
  onCardClick?: (athlete_id: string) => void;
}

export function AtencionStrip({ rows, refreshed_relative, onCardClick }: AtencionStripProps) {
  const flagged = rows.filter((r) => r.alerts.length > 0).slice(0, 4);
  const allGood = flagged.length === 0;

  return (
    <section aria-label="Atención" className="space-y-2">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
          Atención{' '}
          <span className="text-[color:var(--accent)] tabular-nums">
            {flagged.length > 0 ? `(${flagged.length})` : ''}
          </span>
        </h2>
        {flagged.length === 4 && (
          <button
            type="button"
            className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted)] hover:text-[color:var(--fg)]"
          >
            ver todas →
          </button>
        )}
      </header>

      {allGood ? (
        <div className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-4 text-sm text-[color:var(--muted)]">
          Todos los atletas nominales{refreshed_relative ? ` — refrescado hace ${refreshed_relative}` : ''}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {flagged.map((row) => (
            <AlertCard key={row.athlete_id} row={row} onClick={onCardClick} />
          ))}
          <AddCard />
        </div>
      )}
    </section>
  );
}

function AlertCard({
  row,
  onClick,
}: {
  row: CohortRow;
  onClick?: (athlete_id: string) => void;
}) {
  const alert = row.primary_alert!;
  const isCritical = alert.severity === 'critical';
  return (
    <button
      type="button"
      onClick={() => onClick?.(row.athlete_id)}
      className={`group relative flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors ${
        isCritical
          ? 'border-[color:var(--accent)]/30 bg-[color:var(--surface)] hover:bg-[color:var(--surface-elevated)]'
          : 'border-[color:var(--hairline)] bg-[color:var(--surface)] hover:bg-[color:var(--surface-elevated)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display italic font-black text-sm text-[color:var(--fg)] truncate">
          {row.full_name}
        </span>
        <AlertTriangle
          className={`size-3.5 shrink-0 ${
            isCritical ? 'text-[color:var(--accent)]' : 'text-[color:var(--warning)]'
          }`}
          aria-hidden
          strokeWidth={2}
        />
      </div>
      <p
        className={`text-sm leading-snug ${
          isCritical ? 'text-[color:var(--accent)]' : 'text-[color:var(--warning)]'
        }`}
      >
        {alert.label}
      </p>
      <p className="text-xs text-[color:var(--muted)] tabular-nums">{alert.detail}</p>
      {row.is_demo && (
        <span className="absolute right-2 top-2 rounded-full border border-[color:var(--hairline)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[color:var(--muted)]">
          demo
        </span>
      )}
    </button>
  );
}

function AddCard() {
  return (
    <button
      type="button"
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--hairline)] bg-transparent p-3 text-[color:var(--muted)] hover:border-[color:var(--accent)]/40 hover:text-[color:var(--accent)]"
    >
      <Plus className="size-5" aria-hidden strokeWidth={1.5} />
      <span className="text-xs uppercase tracking-[0.16em]">añadir</span>
    </button>
  );
}
