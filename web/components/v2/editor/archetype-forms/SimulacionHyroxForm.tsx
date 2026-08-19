'use client';

// SimulacionHyroxForm — the dedicated "Simulación HYROX" template. Unlike the
// generic COMPONENTS form (an unordered movement list), this is a PURPOSE-BUILT
// ORDERED template: the 16 legs of a HYROX race in their FIXED official order
// (8 × 1 km run interleaved with the 8 stations). The coach edits the DOSES — run
// distances/paces, station loads/reps — never the SEQUENCE.
//
// The race structure + standard loads live in lib/dashboard/v2/hyrox-template.ts
// (single source of truth, ground-truthed against the HYROX rulebook). This form
// only RENDERS + EDITS the pre-seeded EditorItem[]; it invents no race data.
//
// VARIANT toggle (Open / Pro) re-applies the standard division loads to the
// load-bearing stations, preserving every other edit. Each leg can be SKIPPED for
// a partial sim (kept off the persisted items, order otherwise intact).
//
// Every item already carries a REAL exercise_id (from the factory), so the block
// persists through the same serializer as any block — zero new persistence work.

import type { Measure, Target } from '@fahybrid/shared/domain/prescription';
import { setMeasure } from '@fahybrid/shared/domain/prescription';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import {
  HYROX_LEGS,
  HYROX_VARIANTS,
  applyVariantLoads,
  buildHyroxItems,
  inferVariant,
  legHasVariantLoad,
  type HyroxLeg,
  type HyroxVariant,
} from '@/lib/dashboard/v2/hyrox-template';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import {
  DistanceCell,
  Field,
  InlineToggle,
  NumberCell,
  PaceCell,
  ScalarTargetCell,
} from './form-controls';

// A leg is "present" in the block when an item exists for its exercise_id. We key
// items to legs by exercise_id (each load station + the ergs has a unique id; runs
// share id 3479 so they are matched POSITIONALLY among the run legs).
function buildLegMap(block: EditorBlock): Map<string, EditorItem> {
  const map = new Map<string, EditorItem>();
  const runItems = block.items.filter((it) => it.exercise_id === HYROX_LEGS[0]!.exercise_id);
  let runCursor = 0;
  for (const leg of HYROX_LEGS) {
    if (leg.kind === 'run') {
      const it = runItems[runCursor++];
      if (it) map.set(leg.key, it);
    } else {
      const it = block.items.find((x) => x.exercise_id === leg.exercise_id);
      if (it) map.set(leg.key, it);
    }
  }
  return map;
}

export function SimulacionHyroxForm({
  block,
  onChange,
}: {
  block: EditorBlock;
  onChange: (next: EditorBlock) => void;
}) {
  const legMap = buildLegMap(block);
  const variant = inferVariant(block.items);
  const presentCount = legMap.size;

  // Replace the whole item list, keeping the official order (the canonical leg
  // order drives the persisted sequence; skipped legs are simply absent).
  const writeItems = (next: Map<string, EditorItem>) => {
    const ordered = HYROX_LEGS.map((l) => next.get(l.key)).filter(
      (it): it is EditorItem => it !== undefined,
    );
    onChange({ ...block, items: ordered });
  };

  const setVariant = (v: HyroxVariant) => {
    onChange({ ...block, items: applyVariantLoads(block.items, v) });
  };

  const resetTemplate = () => {
    onChange({ ...block, items: buildHyroxItems(variant ?? 'open') });
  };

  const updateLegItem = (leg: HyroxLeg, item: EditorItem) => {
    const next = new Map(legMap);
    next.set(leg.key, item);
    writeItems(next);
  };

  const toggleLeg = (leg: HyroxLeg) => {
    const next = new Map(legMap);
    if (next.has(leg.key)) {
      next.delete(leg.key);
    } else {
      // Re-seed this leg from the template at the current variant.
      const seeded = buildHyroxItems(variant ?? 'open').find(
        (it, i) => HYROX_LEGS[i]!.key === leg.key,
      );
      if (seeded) next.set(leg.key, seeded);
    }
    writeItems(next);
  };

  return (
    <div className="space-y-4">
      {/* Variant + summary header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Variante" hint="cargas estándar editables">
          <InlineToggle
            ariaLabel="Variante HYROX"
            value={variant ?? 'open'}
            options={HYROX_VARIANTS.map((v) => ({ value: v.value, label: v.label }))}
            onChange={setVariant}
          />
        </Field>
        <div className="flex items-center gap-3">
          <span className="v2-num text-xs text-[color:var(--v2-muted)]">
            {presentCount} / {HYROX_LEGS.length} tramos
          </span>
          <button
            type="button"
            onClick={resetTemplate}
            className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2.5 py-1 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
          >
            <MIcon name="restart_alt" size={13} />
            Restablecer plantilla
          </button>
        </div>
      </div>

      {/* Race info strip */}
      <p className="text-label leading-snug text-[color:var(--v2-muted)]">
        Formato oficial: 8 × 1 km de carrera intercalados con las 8 estaciones en
        orden. La secuencia es fija: editas la dosis de cada tramo, no el orden.
        Cargas estándar {variant ? HYROX_VARIANTS.find((v) => v.value === variant)?.hint?.toLowerCase() : 'personalizadas'}.
      </p>

      {/* The ordered timeline */}
      <ol className="space-y-1.5">
        {HYROX_LEGS.map((leg, i) => {
          const item = legMap.get(leg.key);
          const skipped = item === undefined;
          return (
            <li key={leg.key}>
              <LegRow
                leg={leg}
                index={i}
                item={item}
                skipped={skipped}
                onChange={(it) => updateLegItem(leg, it)}
                onToggle={() => toggleLeg(leg)}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── One leg row ──────────────────────────────────────────────────────────────
// Run leg: distancia + objetivo opcional (ritmo | RPE). Station leg: su medida
// estándar (distancia o reps) + carga (kg) para las estaciones con carga.
function LegRow({
  leg,
  index,
  item,
  skipped,
  onChange,
  onToggle,
}: {
  leg: HyroxLeg;
  index: number;
  item: EditorItem | undefined;
  skipped: boolean;
  onChange: (item: EditorItem) => void;
  onToggle: () => void;
}) {
  const isRun = leg.kind === 'run';
  const slug = isRun ? 'carrera' : 'circuito';

  return (
    <div
      className={cn(
        'relative flex items-stretch gap-3 overflow-hidden rounded-[var(--v2-r-m)] border bg-[color:var(--v2-surface-2)] py-2.5 pl-3.5 pr-3 transition-opacity',
        skipped ? 'border-dashed border-[color:var(--v2-border)] opacity-55' : 'border-[color:var(--v2-border)]',
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: `var(--v2-mod-${slug})` }}
      />

      {/* Order number */}
      <span className="v2-num mt-0.5 w-5 shrink-0 text-center text-xs font-bold text-[color:var(--v2-faint)]">
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--v2-r-s)]"
            style={{
              background: `var(--v2-mod-${slug}-soft)`,
              color: `var(--v2-mod-${slug})`,
            }}
          >
            <MIcon name={isRun ? 'directions_run' : 'fitness_center'} size={14} />
          </span>
          <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
            {isRun ? 'Run 1 km' : `Estación ${leg.stationNumber} · ${leg.exercise_name}`}
          </span>
          {skipped ? (
            <span className="v2-micro rounded-[var(--v2-r-pill)] bg-[color:var(--v2-surface)] px-1.5 py-0.5 text-[color:var(--v2-faint)]">
              omitido
            </span>
          ) : null}
        </div>

        {!skipped && item ? (
          <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2 pl-8">
            {isRun ? (
              <RunDose item={item} onChange={onChange} />
            ) : (
              <StationDose leg={leg} item={item} onChange={onChange} />
            )}
          </div>
        ) : null}
      </div>

      {/* Skip / restore toggle */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={skipped ? `Incluir ${leg.exercise_name}` : `Omitir ${leg.exercise_name}`}
        className={cn(
          'v2-focus mt-0.5 shrink-0 rounded-[var(--v2-r-s)] p-1 transition-colors',
          skipped
            ? 'text-[color:var(--v2-accent)] hover:bg-[color:var(--v2-accent-soft)]'
            : 'text-[color:var(--v2-muted)] hover:text-[color:var(--v2-danger)]',
        )}
      >
        <MIcon name={skipped ? 'add_circle' : 'remove_circle_outline'} size={16} />
      </button>
    </div>
  );
}

// ── Run dose — distancia + objetivo opcional (ritmo | RPE | ninguno) ─────────
type RunObjective = 'none' | 'pace' | 'rpe';

const RUN_OBJECTIVE_OPTIONS: { value: RunObjective; label: string }[] = [
  { value: 'none', label: 'Libre' },
  { value: 'pace', label: 'Ritmo' },
  { value: 'rpe', label: 'RPE' },
];

const DEFAULT_RUN_PACE_S = 270; // 4:30/km — a representative race-pace placeholder

function RunDose({
  item,
  onChange,
}: {
  item: EditorItem;
  onChange: (item: EditorItem) => void;
}) {
  const p = item.prescription;
  const measure = p.sets?.[0] ? setMeasure(p.sets[0]) : undefined;
  const meters = measure?.kind === 'distance' ? measure.meters : null;
  const target = p.sets?.[0]?.target ?? p.target;
  const objective: RunObjective =
    target?.kind === 'pace' ? 'pace' : target?.kind === 'rpe' ? 'rpe' : 'none';

  const writeSet = (next: { measure?: Measure; target?: Target }) => {
    const m: Measure = next.measure ?? measure ?? { kind: 'distance', meters: 1000 };
    const t = 'target' in next ? next.target : target;
    const set = t ? { measure: m, target: t } : { measure: m };
    onChange({ ...item, prescription: { ...p, sets: [set], target: undefined } });
  };

  const setObjective = (kind: RunObjective) => {
    if (kind === 'none') return writeSet({ target: undefined });
    if (kind === 'pace')
      return writeSet({ target: { kind: 'pace', unit: 'per_km', value_s: DEFAULT_RUN_PACE_S } });
    return writeSet({ target: { kind: 'rpe', value: 7 } });
  };

  return (
    <>
      <Field label="Distancia" className="w-[120px]">
        <DistanceCell
          meters={meters}
          ariaPrefix={`Run ${item.uid}`}
          onChange={(m) => writeSet({ measure: { kind: 'distance', meters: m ?? 0 } })}
        />
      </Field>
      <Field label="Objetivo" className="min-w-[150px]">
        <div className="space-y-1.5">
          <InlineToggle
            ariaLabel="Objetivo del run"
            value={objective}
            options={RUN_OBJECTIVE_OPTIONS}
            onChange={setObjective}
          />
          {objective === 'pace' ? (
            <PaceCell
              target={target}
              modality="run"
              ariaPrefix="Run"
              onChange={(t) => writeSet({ target: t })}
            />
          ) : objective === 'rpe' ? (
            <ScalarTargetCell
              kind="rpe"
              target={target}
              ariaLabel="RPE del run"
              onChange={(t) => writeSet({ target: t })}
            />
          ) : null}
        </div>
      </Field>
    </>
  );
}

// ── Station dose — su medida estándar (distancia | reps) + carga (kg) ────────
function StationDose({
  leg,
  item,
  onChange,
}: {
  leg: HyroxLeg;
  item: EditorItem;
  onChange: (item: EditorItem) => void;
}) {
  const p = item.prescription;
  const measure = p.sets?.[0] ? setMeasure(p.sets[0]) : undefined;
  const target = p.sets?.[0]?.target;
  const hasLoad = legHasVariantLoad(leg);
  const isReps = measure?.kind === 'reps';
  const isFarmers = leg.exercise_name === 'Farmers Carry';

  const writeSet = (next: { measure?: Measure; target?: Target | undefined }) => {
    const m: Measure = next.measure ?? measure ?? { kind: 'distance', meters: 0 };
    const t = 'target' in next ? next.target : target;
    const set = t ? { measure: m, target: t } : { measure: m };
    onChange({ ...item, prescription: { ...p, sets: [set] } });
  };

  return (
    <>
      {isReps ? (
        <Field label="Reps" className="w-[110px]">
          <NumberCell
            value={measure?.kind === 'reps' ? measure.value : null}
            ariaLabel={`Reps · ${leg.exercise_name}`}
            min={0}
            max={1000}
            suffix="reps"
            onChange={(v) => writeSet({ measure: { kind: 'reps', value: v ?? 0 } })}
          />
        </Field>
      ) : (
        <Field label="Distancia" className="w-[120px]">
          <DistanceCell
            meters={measure?.kind === 'distance' ? measure.meters : null}
            ariaPrefix={leg.exercise_name}
            onChange={(m) => writeSet({ measure: { kind: 'distance', meters: m ?? 0 } })}
          />
        </Field>
      )}

      {hasLoad ? (
        <Field label={isFarmers ? 'Carga (cada mano)' : 'Carga'} className="w-[120px]">
          <ScalarTargetCell
            kind="kg"
            target={target}
            ariaLabel={`Carga · ${leg.exercise_name}`}
            onChange={(t) => writeSet({ target: t })}
          />
        </Field>
      ) : null}
    </>
  );
}
