// Read-only presentational primitives for the intake evidence rail. Split out
// of IntakeEvidenceRail.tsx to keep that file under the project line cap. Pure
// presentation — no hooks, no client state — so no 'use client' directive
// (rendered inside the already-client rail import graph).

import type React from 'react';

export function Empty({ children = 'Sin datos' }: { children?: React.ReactNode }) {
  return <span className="text-[12.5px] text-[color:var(--text-muted)]">{children}</span>;
}

/** label↔value ledger row: baseline-aligned, value right-aligned + mono. */
export function Ledger({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-[12.5px] text-[color:var(--text-muted)]">{k}</span>
      <span className="text-right text-[color:var(--fg)]">{children}</span>
    </div>
  );
}

export function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] px-2 py-[3px] text-[10.5px] font-medium text-[color:var(--text-muted)]">
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
        <span className="metric-num text-2xl font-semibold leading-none text-[color:var(--text-muted)]">
          —
        </span>
      ) : (
        <span
          className="metric-num text-2xl font-semibold leading-none"
          style={{ color: flagged ? 'var(--warning)' : 'var(--fg)' }}
        >
          {value}
          <span className="text-xs text-[color:var(--text-muted)]">/10</span>
        </span>
      )}
      <span className="micro-label mt-1.5 block">{label}</span>
    </div>
  );
}
