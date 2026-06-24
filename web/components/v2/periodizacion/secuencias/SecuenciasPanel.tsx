'use client';

// SecuenciasPanel — the Secuencias area of Periodización. Two surfaces:
//   1) the matrix (nivel × días) = the coverage map + the entry point;
//   2) the in-cell editor = the ordered chain of microciclos + end/progression.
//
// The matrix renders through the SHARED <LevelDaysGrid> (same grid as Biblioteca,
// no second matrix) with a sequence-preview cell. Clicking a cell opens the editor
// for that (level, days); saving PUTs the cell atomically and refetches the whole
// matrix so previews + coverage stay truthful. All data is the coach's own
// (athlete_levels rows, methodology_phases color, program_month_templates pieces).

import { useCallback, useMemo, useState } from 'react';
import { LevelDaysGrid, type MatrixLevelRow } from '@/components/v2/LevelDaysGrid';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/dashboard/MIcon';
import type { V2SecuenciasData, V2Sequence } from '@/lib/dashboard/v2/secuencias';
import type { V2PhaseItem, V2LevelItem } from '@/lib/dashboard/v2/periodizacion';
import type { PhaseRole } from '../role-style';
import { SEQUENCE_DAYS_OPTIONS } from './days';
import { SequenceCell, type SequenceCellPreview } from './SequenceCell';
import { SequenceEditor } from './SequenceEditor';

interface OpenCell {
  level: V2LevelItem;
  days: number;
}

export function SecuenciasPanel({ initial }: { initial: V2SecuenciasData }) {
  const [data, setData] = useState<V2SecuenciasData>(initial);
  const [open, setOpen] = useState<OpenCell | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);

  const microById = useMemo(
    () => new Map(data.microciclos.map((m) => [m.id, m])),
    [data.microciclos],
  );
  const phaseById = useMemo(() => new Map(data.phases.map((p) => [p.id, p])), [data.phases]);

  // month_template_id → number of distinct cells that reference it (the picker
  // hint "usado en N secuencias" + the shared-cell detection).
  const usageById = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const seq of Object.values(data.cells)) {
      const seen = new Set<string>();
      for (const it of seq.items) {
        if (seen.has(it.month_template_id)) continue;
        seen.add(it.month_template_id);
        counts[it.month_template_id] = (counts[it.month_template_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [data.cells]);

  // Coverage chips.
  const totalCells = data.levels.length * SEQUENCE_DAYS_OPTIONS.length;
  const filledCells = Object.keys(data.cells).length;

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/coach/sequences', { method: 'GET' });
      if (!res.ok) {
        setReloadError('No se pudieron recargar las secuencias.');
        return;
      }
      const json = (await res.json()) as { sequences: V2Sequence[] };
      const cells: Record<string, V2Sequence> = {};
      for (const s of json.sequences) {
        if (!SEQUENCE_DAYS_OPTIONS.includes(s.days_per_week as (typeof SEQUENCE_DAYS_OPTIONS)[number])) {
          continue;
        }
        cells[`${s.level_id}_${s.days_per_week}`] = s;
      }
      setData((prev) => ({ ...prev, cells }));
    } catch {
      setReloadError('No se pudieron recargar las secuencias.');
    }
  }, []);

  const onSaved = useCallback(async () => {
    await refetch();
    setOpen(null);
  }, [refetch]);

  // Build the preview for a filled cell: count + total weeks + per-item sparkline.
  const previewFor = useCallback(
    (seq: V2Sequence | undefined): SequenceCellPreview | null => {
      if (!seq) return null;
      let totalWeeks = 0;
      const segments = seq.items.map((it) => {
        const weeks = microById.get(it.month_template_id)?.week_count ?? 0;
        totalWeeks += weeks;
        const role: PhaseRole | null = it.phase_id
          ? phaseById.get(it.phase_id)?.role ?? null
          : null;
        return { weeks, role };
      });
      return {
        microciclo_count: seq.items.length,
        total_weeks: totalWeeks,
        segments,
      };
    },
    [microById, phaseById],
  );

  // ── Editor view ─────────────────────────────────────────────────────────────
  if (open) {
    const key = `${open.level.id}_${open.days}`;
    const seq = data.cells[key] ?? null;
    // "Shared" = any microciclo of this cell is referenced by another cell too.
    const isShared = seq
      ? seq.items.some((it) => (usageById[it.month_template_id] ?? 0) > 1)
      : false;
    return (
      <SequenceEditor
        level={open.level}
        days={open.days}
        sequence={seq}
        microciclos={data.microciclos}
        phases={data.phases}
        usageById={usageById}
        isShared={isShared}
        onClose={() => setOpen(null)}
        onSaved={() => void onSaved()}
      />
    );
  }

  // ── No levels: matrix has no rows — redirect to Niveles ─────────────────────
  if (data.levels.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-[var(--v2-r-l)] border border-dashed border-[color:var(--v2-border)] px-5 py-11 text-center">
        <span
          className="mb-3.5 flex h-13 w-13 items-center justify-center rounded-[var(--v2-r-m)] p-3"
          style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent)' }}
        >
          <MIcon name="grid_view" size={26} />
        </span>
        <p className="text-base font-bold text-[color:var(--v2-fg)]">Define tus niveles para activar la matriz</p>
        <p className="mx-auto mt-1.5 max-w-[400px] text-[13px] leading-relaxed text-[color:var(--v2-muted)]">
          Sin niveles no hay filas de la matriz. Los niveles clasifican a tus atletas y forman las filas de Secuencias.
        </p>
        <Link
          href="/v2/periodizacion?area=niveles"
          className="v2-focus mt-4 inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3.5 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
        >
          Ir a Niveles <MIcon name="arrow_forward" size={16} />
        </Link>
      </div>
    );
  }

  // ── No sequences yet: guided start ──────────────────────────────────────────
  if (filledCells === 0) {
    const firstLevel = data.levels[0]!;
    return (
      <div className="flex flex-col items-center rounded-[var(--v2-r-l)] border border-dashed border-[color:var(--v2-border)] px-5 py-11 text-center">
        <span
          className="mb-3.5 flex h-13 w-13 items-center justify-center rounded-[var(--v2-r-m)] p-3"
          style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent)' }}
        >
          <MIcon name="grid_view" size={26} />
        </span>
        <p className="text-base font-bold text-[color:var(--v2-fg)]">Aún no has montado tus secuencias</p>
        <p className="mx-auto mt-1.5 max-w-[420px] text-[13px] leading-relaxed text-[color:var(--v2-muted)]">
          Una secuencia ordena tus microciclos (1 → 2 → 3 …) para un perfil de atleta — nivel × días. El atleta cae en su
          celda y recorre la secuencia solo. Móntala una vez por celda.
        </p>
        <button
          type="button"
          onClick={() => setOpen({ level: firstLevel, days: SEQUENCE_DAYS_OPTIONS[0] })}
          className="v2-focus mt-4 inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3.5 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
        >
          <MIcon name="add" size={16} /> Crear mi primera secuencia
        </button>
      </div>
    );
  }

  // ── Matrix view ─────────────────────────────────────────────────────────────
  const levelRows: MatrixLevelRow[] = data.levels.map((l) => ({
    id: Number(l.id),
    name: l.name,
    label: l.label,
    sort_order: l.sort_order,
  }));
  const levelById = new Map(data.levels.map((l) => [Number(l.id), l]));

  return (
    <div>
      {/* coverage chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--v2-muted)]">
          <b className="v2-num">{filledCells}</b> {filledCells === 1 ? 'secuencia' : 'secuencias'}
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: 'var(--v2-ok-soft)', color: 'var(--v2-ok)' }}
        >
          <b className="v2-num">
            {filledCells}/{totalCells}
          </b>{' '}
          celdas cubiertas
        </span>
        {totalCells - filledCells > 0 ? (
          <span
            className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: 'var(--v2-warn-soft)', color: 'var(--v2-warn)' }}
          >
            <b className="v2-num">{totalCells - filledCells}</b> huecos
          </span>
        ) : null}
      </div>

      {reloadError ? (
        <div
          role="alert"
          className="mb-3 flex items-center gap-2.5 rounded-[var(--v2-r-s)] px-3 py-2.5 text-[12.5px]"
          style={{
            background: 'var(--v2-danger-soft)',
            color: 'var(--v2-danger)',
            border: '1px solid color-mix(in srgb, var(--v2-danger) 30%, transparent)',
          }}
        >
          <MIcon name="error" size={16} />
          <span className="flex-1">{reloadError}</span>
          <button
            type="button"
            onClick={() => {
              setReloadError(null);
              void refetch();
            }}
            className="v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger)] px-2 text-[11px] font-bold text-[color:var(--v2-danger)]"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      <LevelDaysGrid
        levels={levelRows}
        renderRowMeta={(level) => {
          const lvl = levelById.get(level.id);
          const n = lvl?.athlete_count ?? 0;
          return `${n} ${n === 1 ? 'atleta' : 'atletas'}`;
        }}
        renderCell={(level, days) => {
          const lvl = levelById.get(level.id)!;
          const seq = data.cells[`${level.id}_${days}`];
          return (
            <SequenceCell
              preview={previewFor(seq)}
              levelLabel={lvl.label}
              days={days}
              onClick={() => setOpen({ level: lvl, days })}
            />
          );
        }}
      />

      {/* coverage bar */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5 text-[11.5px] text-[color:var(--v2-muted)]">
        <span className="v2-num font-semibold text-[color:var(--v2-fg)]">Cobertura</span>
        <div className="h-[7px] max-w-[280px] flex-1 overflow-hidden rounded-[4px] bg-[color:var(--v2-surface-2)]">
          <span
            className="block h-full rounded-[4px] bg-[color:var(--v2-accent)]"
            style={{ width: `${totalCells === 0 ? 0 : Math.round((filledCells / totalCells) * 100)}%` }}
          />
        </div>
        <span className="v2-num">
          {filledCells} / {totalCells} celdas
        </span>
      </div>

      {/* sparkline legend */}
      <PhaseLegend phases={data.phases} />
    </div>
  );
}

// The sparkline reads by PHASE ROLE color (not a separate per-microciclo modality
// axis, which we don't persist). This legend makes the color mapping explicit.
function PhaseLegend({ phases }: { phases: V2PhaseItem[] }) {
  if (phases.length === 0) return null;
  return (
    <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--v2-faint)]">
      Cada celda muestra nº de microciclos · semanas totales y un sparkline: un segmento por microciclo, ancho ∝ semanas,
      color = la fase de ese microciclo (gris si no tiene). <b className="text-[color:var(--v2-muted)]">＋</b> = crear secuencia.
    </p>
  );
}
