'use client';

// LevelMatrix — Level × Days grid for the block library. Thin wrapper over the
// shared <LevelDaysGrid> (the single v2 matrix shell): it supplies the block
// cell (filled = block name + review dot; empty = "+"). The grid chrome (rows,
// day columns, the "define your levels" empty state) lives in LevelDaysGrid and
// is shared with Secuencias — no second matrix exists.

import { LevelDaysGrid, type MatrixLevelRow } from '@/components/v2/LevelDaysGrid';
import { MatrixCell, type MatrixCellData } from './MatrixCell';

export type LevelRow = MatrixLevelRow;

interface LevelMatrixProps {
  levels: LevelRow[];
  cells: Record<string, MatrixCellData | null>;
  onCellClick: (levelId: number, days: number, existingBlockId?: number) => void;
}

export function LevelMatrix({ levels, cells, onCellClick }: LevelMatrixProps) {
  return (
    <LevelDaysGrid
      levels={levels}
      renderCell={(level, days) => {
        const cell = cells[`${level.id}_${days}`] ?? null;
        return (
          <MatrixCell
            cell={cell}
            levelId={level.id}
            days={days}
            onClick={() => onCellClick(level.id, days, cell?.block_id)}
          />
        );
      }}
    />
  );
}
