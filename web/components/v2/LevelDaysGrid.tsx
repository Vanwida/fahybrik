'use client';

// LevelDaysGrid — the shared Nivel × Días matrix shell. Rows = the coach's
// athlete levels (ordered by sort_order), columns = weekly training frequency
// (3 | 4 | 5 | 6 days). It owns ONLY the table/row chrome (headers, the level
// label cell, staggered row animation, horizontal scroll); the CONTENT of each
// cell and the per-row meta are delegated to render props.
//
// This is the single matrix component for the whole v2 dashboard: the block
// library (Biblioteca) and the periodization Secuencias both render through it,
// each supplying its own cell. No second matrix is invented.

import { Link } from '@/i18n/navigation';
import { SEQUENCE_DAYS_OPTIONS } from './periodizacion/secuencias/days';

export interface MatrixLevelRow {
  id: number;
  /** Short code shown as the chip / faint suffix (e.g. "N1"). */
  name: string;
  /** Human-readable label (e.g. "Iniciación"). */
  label: string;
  sort_order: number;
}

const DAYS_OPTIONS = SEQUENCE_DAYS_OPTIONS;
type DayOption = (typeof DAYS_OPTIONS)[number];

export function LevelDaysGrid({
  levels,
  renderCell,
  renderRowMeta,
}: {
  levels: MatrixLevelRow[];
  /** Cell content for (level, days). Caller renders its own filled/empty cell. */
  renderCell: (level: MatrixLevelRow, days: DayOption) => React.ReactNode;
  /** Optional extra meta under the level label (e.g. "14 atletas"). */
  renderRowMeta?: (level: MatrixLevelRow) => React.ReactNode;
}) {
  if (levels.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-8 text-center">
        <p className="text-sm font-semibold text-[color:var(--v2-fg)]">Sin niveles definidos</p>
        <p className="text-xs text-[color:var(--v2-muted)]">
          Define los niveles de atleta en{' '}
          <Link
            href="/periodizacion?area=niveles"
            className="v2-focus font-semibold text-[color:var(--v2-accent)] hover:underline"
          >
            Periodización
          </Link>{' '}
          para activar la matriz.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="min-w-[140px] py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]">
              Nivel \ Días
            </th>
            {DAYS_OPTIONS.map((days) => (
              <th
                key={days}
                className="min-w-[96px] px-1.5 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]"
              >
                {days}d
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {levels.map((level, rowIdx) => (
            <tr
              key={level.id}
              className="v2-stagger border-t border-[color:var(--v2-border)]"
              style={{ ['--v2-stagger-i' as string]: rowIdx }}
            >
              <td className="py-2 pr-3 align-middle">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold text-[color:var(--v2-fg)]">{level.label}</span>
                  <span className="text-[11px] text-[color:var(--v2-faint)]">{level.name}</span>
                </div>
                {renderRowMeta ? (
                  <div className="mt-0.5 text-[11px] text-[color:var(--v2-faint)]">{renderRowMeta(level)}</div>
                ) : null}
              </td>
              {DAYS_OPTIONS.map((days) => (
                <td key={days} className="px-1.5 py-2 align-top">
                  {renderCell(level, days)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
