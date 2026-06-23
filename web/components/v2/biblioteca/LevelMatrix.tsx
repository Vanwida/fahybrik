'use client';

// LevelMatrix — Level × Days grid for the block library. Each row is one
// athlete level (N1 → N5, ordered by sort_order), each column is a weekly
// training frequency (3 | 4 | 5 | 6 days). Cells are clickable: filled cells
// open the block editor; empty cells open the block creator with level + days
// pre-filled.

import { Link } from '@/i18n/navigation';
import { MatrixCell, type MatrixCellData } from './MatrixCell';

export interface LevelRow {
  id: number;
  name: string;
  label: string;
  sort_order: number;
}

const DAYS_OPTIONS = [3, 4, 5, 6] as const;
type DayOption = (typeof DAYS_OPTIONS)[number];

interface LevelMatrixProps {
  levels: LevelRow[];
  cells: Record<string, MatrixCellData | null>;
  onCellClick: (levelId: number, days: number, existingBlockId?: number) => void;
}

export function LevelMatrix({ levels, cells, onCellClick }: LevelMatrixProps) {
  if (levels.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-8 text-center">
        <p className="text-sm font-semibold text-[color:var(--v2-fg)]">Sin niveles definidos</p>
        <p className="text-xs text-[color:var(--v2-muted)]">
          Define los niveles de atleta en{' '}
          <Link
            href="/v2/periodizacion?area=niveles"
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
            {/* Nivel header */}
            <th className="min-w-[120px] py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]">
              Nivel
            </th>
            {DAYS_OPTIONS.map((days) => (
              <th
                key={days}
                className="w-[1fr] min-w-[88px] px-1.5 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]"
              >
                {days}d
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {levels.map((level, rowIdx) => (
            <MatrixRow
              key={level.id}
              level={level}
              cells={cells}
              rowIndex={rowIdx}
              onCellClick={onCellClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function MatrixRow({
  level,
  cells,
  rowIndex,
  onCellClick,
}: {
  level: LevelRow;
  cells: Record<string, MatrixCellData | null>;
  rowIndex: number;
  onCellClick: (levelId: number, days: DayOption, existingBlockId?: number) => void;
}) {
  return (
    <tr
      className="v2-stagger border-t border-[color:var(--v2-border)]"
      style={{ ['--v2-stagger-i' as string]: rowIndex }}
    >
      {/* Level label cell */}
      <td className="py-2 pr-3 align-top">
        <span className="text-xs font-semibold text-[color:var(--v2-fg)]">{level.label}</span>
        <span className="ml-1.5 text-[11px] text-[color:var(--v2-faint)]">{level.name}</span>
      </td>

      {DAYS_OPTIONS.map((days) => {
        const key = `${level.id}_${days}`;
        const cell = cells[key] ?? null;
        return (
          <td key={days} className="px-1.5 py-2 align-top">
            <MatrixCell
              cell={cell}
              levelId={level.id}
              days={days}
              onClick={() => onCellClick(level.id, days, cell?.block_id)}
            />
          </td>
        );
      })}
    </tr>
  );
}
