// Read-only presentational primitives for the V2 intake evidence rail. Pure
// presentation — no hooks, no client state. Mirrors the V1 rail primitives in
// V2 tokens (Empty · Ledger · MetaChip · Instrument).

import type React from 'react';

export function Empty({ children = 'Sin datos' }: { children?: React.ReactNode }) {
  return <span className="text-[12.5px] text-[color:var(--v2-muted)]">{children}</span>;
}

/** label↔value ledger row: baseline-aligned, value right-aligned + mono. */
export function Ledger({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-[12.5px] text-[color:var(--v2-muted)]">{k}</span>
      <span className="text-right text-[color:var(--v2-fg)]">{children}</span>
    </div>
  );
}

export function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2 py-[3px] text-[10.5px] font-medium text-[color:var(--v2-muted)]">
      {children}
    </span>
  );
}

/** 1-10 instrument readout: big mono num + micro-label, amber when flagged. */
export function Instrument({
  label,
  value,
  flag,
}: {
  label: string;
  value: number | null;
  flag?: boolean;
}) {
  const flagged = flag === true && value != null;
  return (
    <div className="flex-1 text-center">
      {value == null ? (
        <span className="v2-num text-2xl font-semibold leading-none text-[color:var(--v2-muted)]">
          —
        </span>
      ) : (
        <span
          className="v2-num text-2xl font-semibold leading-none"
          style={{ color: flagged ? 'var(--v2-warn)' : 'var(--v2-fg)' }}
        >
          {value}
          <span className="text-xs text-[color:var(--v2-muted)]">/10</span>
        </span>
      )}
      <span className="v2-micro mt-1.5 block">{label}</span>
    </div>
  );
}
