'use client';

// LevelDetailPanel — the periodization of ONE level. You enter it by clicking a
// level in the levels home; here you see that level's variants by días/semana
// (3 · 4 · 5 · 6) and edit each one's ORDERED chain of microciclos. The order IS
// the periodization — there is no phase entity.
//
//   · días-variant card → the sequence preview (nº microciclos · semanas + a
//     sparkline) or an empty "+" inviting you to build it;
//   · clicking a card → the shared <SequenceEditor> for (level, días): drag to
//     reorder, add microciclos, set the end/progression policy.
//
// Persistence is the EXISTING /api/coach/sequences (PUT atomic full-set). On save
// we refetch the whole sequence set so previews stay truthful. usageById spans
// ALL cells (cross-level sharing detection), so this panel is fed the full
// V2SecuenciasData even though it only renders one level's row.

import { useCallback, useMemo, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { ContextHint } from '@/components/v2/orientacion';
import type { V2SecuenciasData, V2Sequence } from '@/lib/dashboard/v2/secuencias';
import type { V2LevelItem } from '@/lib/dashboard/v2/periodizacion';
import { SEQUENCE_DAYS_OPTIONS } from './secuencias/days';
import { SequenceCell, type SequenceCellPreview } from './secuencias/SequenceCell';
import { SequenceEditor } from './secuencias/SequenceEditor';
import { DuplicarCeldaModal } from './secuencias/DuplicarCeldaModal';

export function LevelDetailPanel({
  level,
  secuencias,
  onBack,
}: {
  level: V2LevelItem;
  secuencias: V2SecuenciasData;
  onBack: () => void;
}) {
  // Cells for the WHOLE coach (all levels) — refetched on save. We only render
  // this level's row, but usageById needs the full set to spot shared microciclos.
  const [cells, setCells] = useState<Record<string, V2Sequence>>(secuencias.cells);
  const [openDays, setOpenDays] = useState<number | null>(null);
  // The días of THIS level's cell being copied elsewhere ("Duplicar a…"), or null.
  const [dupDays, setDupDays] = useState<number | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);

  const microById = useMemo(
    () => new Map(secuencias.microciclos.map((m) => [m.id, m])),
    [secuencias.microciclos],
  );

  // month_template_id → number of distinct cells that reference it.
  const usageById = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const seq of Object.values(cells)) {
      const seen = new Set<string>();
      for (const it of seq.items) {
        if (seen.has(it.month_template_id)) continue;
        seen.add(it.month_template_id);
        counts[it.month_template_id] = (counts[it.month_template_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [cells]);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/coach/sequences', { method: 'GET' });
      if (!res.ok) {
        setReloadError('No se pudieron recargar las secuencias.');
        return;
      }
      const json = (await res.json()) as { sequences: V2Sequence[] };
      const next: Record<string, V2Sequence> = {};
      for (const s of json.sequences) {
        if (
          !SEQUENCE_DAYS_OPTIONS.includes(
            s.days_per_week as (typeof SEQUENCE_DAYS_OPTIONS)[number],
          )
        ) {
          continue;
        }
        next[`${s.level_id}_${s.days_per_week}`] = s;
      }
      setCells(next);
    } catch {
      setReloadError('No se pudieron recargar las secuencias.');
    }
  }, []);

  const onSaved = useCallback(async () => {
    await refetch();
    setOpenDays(null);
  }, [refetch]);

  const onDuplicated = useCallback(async () => {
    await refetch();
    setDupDays(null);
  }, [refetch]);

  // Preview for a filled cell: count + total weeks + per-item sparkline.
  const previewFor = useCallback(
    (seq: V2Sequence | undefined): SequenceCellPreview | null => {
      if (!seq) return null;
      let totalWeeks = 0;
      const segments = seq.items.map((it) => {
        const weeks = microById.get(it.month_template_id)?.week_count ?? 0;
        totalWeeks += weeks;
        return { weeks };
      });
      return {
        microciclo_count: seq.items.length,
        total_weeks: totalWeeks,
        segments,
      };
    },
    [microById],
  );

  const cellFor = useCallback(
    (days: number) => cells[`${level.id}_${days}`],
    [cells, level.id],
  );

  // How many of this level's día-variants already have a sequence.
  const filledVariants = SEQUENCE_DAYS_OPTIONS.filter((d) => cellFor(d)).length;
  const totalVariants = SEQUENCE_DAYS_OPTIONS.length;

  // ── Editor view ─────────────────────────────────────────────────────────────
  if (openDays != null) {
    const seq = cellFor(openDays) ?? null;
    const isShared = seq
      ? seq.items.some((it) => (usageById[it.month_template_id] ?? 0) > 1)
      : false;
    return (
      <SequenceEditor
        level={level}
        days={openDays}
        sequence={seq}
        microciclos={secuencias.microciclos}
        usageById={usageById}
        isShared={isShared}
        onClose={() => setOpenDays(null)}
        onSaved={() => void onSaved()}
      />
    );
  }

  // ── Días-variants view ──────────────────────────────────────────────────────
  return (
    <div>
      {/* header — back + level identity */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="v2-focus mb-2 inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="arrow_back" size={15} /> Niveles
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <LevelBadge level={level.name} />
            <h2 className="v2-display text-2xl text-[color:var(--v2-fg)]">{level.label}</h2>
            <span className="inline-flex items-center gap-1 text-xs text-[color:var(--v2-faint)]">
              <MIcon name="person" size={14} />
              <b className="v2-num">{level.athlete_count}</b>{' '}
              {level.athlete_count === 1 ? 'atleta' : 'atletas'}
            </span>
          </div>
          {level.description ? (
            <p className="mt-1 max-w-[640px] text-xs leading-relaxed text-[color:var(--v2-muted)]">
              {level.description}
            </p>
          ) : null}
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 self-start rounded-[var(--v2-r-pill)] px-2.5 py-1 text-label font-semibold"
          style={{
            background: filledVariants === totalVariants ? 'var(--v2-ok-soft)' : 'var(--v2-surface-2)',
            color: filledVariants === totalVariants ? 'var(--v2-ok)' : 'var(--v2-muted)',
          }}
        >
          <b className="v2-num">
            {filledVariants}/{totalVariants}
          </b>{' '}
          variantes con plan
        </span>
      </div>

      {reloadError ? (
        <div
          role="alert"
          className="mb-3 flex items-center gap-2.5 rounded-[var(--v2-r-s)] px-3 py-2.5 text-xs"
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
            className="v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger)] px-2 text-label font-bold text-[color:var(--v2-danger)]"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      <ContextHint
        className="mb-3"
        more={
          <>
            Cada variante = la periodización para los atletas de <b>{level.name}</b> que entrenan
            ese nº de días. Vacía = un <b>hueco</b> por cubrir.
          </>
        }
      >
        La periodización de <b>{level.label}</b> según los <b>días/semana</b> del atleta.
      </ContextHint>

      {/* the level's variants by días/semana */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SEQUENCE_DAYS_OPTIONS.map((days) => {
          const preview = previewFor(cellFor(days));
          return (
            <DaysVariantCard
              key={days}
              days={days}
              filled={!!preview}
              onClick={() => setOpenDays(days)}
              onDuplicate={preview ? () => setDupDays(days) : undefined}
            >
              <SequenceCell
                preview={preview}
                levelLabel={level.label}
                days={days}
                onClick={() => setOpenDays(days)}
              />
            </DaysVariantCard>
          );
        })}
      </div>

      {/* purpose strip */}
      <div className="mt-4 flex items-center gap-3 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] px-4 py-3 text-xs text-[color:var(--v2-muted)]">
        <span className="shrink-0 text-[color:var(--v2-accent)]">
          <MIcon name="my_location" size={18} />
        </span>
        <span className="flex-1">
          Montas cada variante <b className="text-[color:var(--v2-fg)]">una vez</b>. Después, todo
          atleta de <b className="text-[color:var(--v2-fg)]">{level.name}</b> cae en la variante de
          sus días y recorre la secuencia automáticamente.
        </span>
      </div>

      {dupDays != null ? (
        <DuplicarCeldaModal
          source={{ levelId: level.id, levelName: level.name, days: dupDays }}
          levels={secuencias.levels}
          cells={cells}
          onClose={() => setDupDays(null)}
          onDone={() => void onDuplicated()}
        />
      ) : null}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DaysVariantCard({
  days,
  filled,
  onClick,
  onDuplicate,
  children,
}: {
  days: number;
  filled: boolean;
  onClick: () => void;
  /** Present only for a FILLED cell — opens "Duplicar a…". */
  onDuplicate?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-baseline gap-1">
          <b className="v2-num text-reading font-bold text-[color:var(--v2-fg)]">{days}</b>
          <span className="text-label font-semibold uppercase tracking-[0.04em] text-[color:var(--v2-muted)]">
            días/sem
          </span>
        </span>
        <div className="flex items-center gap-1">
          {onDuplicate ? (
            <button
              type="button"
              onClick={onDuplicate}
              aria-label={`Duplicar la secuencia de ${days} días a otra celda`}
              title="Duplica esta secuencia entera a otro nivel o nº de días"
              className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] px-1.5 py-0.5 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="content_copy" size={13} />
              Duplicar a…
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClick}
            className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] px-1.5 py-0.5 text-label font-semibold text-[color:var(--v2-accent)] transition-colors hover:bg-[color:var(--v2-accent-soft)]"
          >
            {filled ? 'Editar' : 'Montar'}
            <MIcon name="arrow_forward" size={13} />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
