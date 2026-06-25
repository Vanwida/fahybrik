'use client';

// ArchetypeBlockForm — the orchestrator that renders the TAILORED form for a
// block's archetype (UX pase §3). It is the DEFAULT simple input that replaces
// the toggle-first board. Routes by the archetype's base PATTERN to one of the 4
// forms:
//   - steady     → SteadyForm        (Z2/tempo · activación · test)
//   - intervals  → IntervalsForm     (series / intervalos)
//   - sets_table → SetsTableForm     (fuerza · reaches the per-set table directly)
//   - components → ComponentsForm    (WOD/metcon · circuito · EMOM · sim → base)
//
// Single-item patterns (steady/intervals/sets_table) edit ONE item's Prescription;
// the components pattern edits the block's ITEM LIST (a metcon is multiple items).
// Below every block: the "Ajuste avanzado" hatch (the full PrescriptionFields,
// reused) for the rare override. The phase/method tag is the coach's optional tag,
// inheriting from the microciclo (agnostic — never a system concept).

import type { Prescription } from '@fahybrid/shared/domain/prescription';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import {
  archetypeForFormat,
  getArchetype,
  patternForBlock,
  type Archetype,
} from '@/lib/dashboard/v2/archetypes';
import { MIcon } from '@/components/dashboard/MIcon';
import { TextCell } from './fields';
import { AdvancedHatch } from './AdvancedHatch';
import { AthletePreviewLine } from './AthletePreviewLine';
import { SteadyForm } from './archetype-forms/SteadyForm';
import { IntervalsForm } from './archetype-forms/IntervalsForm';
import { SetsTableForm } from './archetype-forms/SetsTableForm';
import { ComponentsForm } from './archetype-forms/ComponentsForm';
import { SimulacionHyroxForm } from './archetype-forms/SimulacionHyroxForm';

export function ArchetypeBlockForm({
  block,
  inheritedPhaseLabel,
  athleteName,
  onChange,
  onChangeType,
}: {
  block: EditorBlock;
  /** The microciclo's phase label this block inherits (agnostic; optional). */
  inheritedPhaseLabel?: string | null;
  athleteName?: string;
  onChange: (next: EditorBlock) => void;
  /** Reopen the archetype picker to change the block's type. */
  onChangeType?: () => void;
}) {
  const pattern = patternForBlock(block.archetype_id, block.format);
  const archetype: Archetype | null = block.archetype_id
    ? getArchetype(block.archetype_id)
    : // Reloaded block: derive the header card from the stored format.
      archetypeForFormat(block.format);

  // Multi-item patterns (components, hyrox_sim) edit the block's ITEM LIST; the
  // single-item patterns (steady/intervals/sets_table) edit one item's prescription.
  const isMultiItem = pattern === 'components' || pattern === 'hyrox_sim';
  const firstItem: EditorItem | undefined = block.items[0];

  const setFirstItem = (patch: Partial<EditorItem>) => {
    if (!firstItem) return;
    onChange({
      ...block,
      items: block.items.map((it, i) => (i === 0 ? { ...it, ...patch } : it)),
    });
  };

  const setFirstPrescription = (prescription: Prescription) =>
    setFirstItem({ prescription });

  return (
    <div className="space-y-4">
      {/* Form header — icon + name + "cambiar tipo" */}
      {archetype ? (
        <FormHeader archetype={archetype} onChangeType={onChangeType} />
      ) : null}

      {/* Deferred-archetype flag (HYROX-sim template / Test specifics) */}
      {archetype?.deferred ? (
        <div className="flex items-start gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-warn)] bg-[color:var(--v2-warn-soft)] px-3 py-2.5">
          <MIcon
            name="construction"
            size={16}
            className="mt-px shrink-0 text-[color:var(--v2-warn)]"
          />
          <p className="text-xs leading-snug text-[color:var(--v2-fg)]">
            {archetype.deferred.note}
          </p>
        </div>
      ) : null}

      {/* Exercise name (single-item patterns) */}
      {!isMultiItem && firstItem ? (
        <label className="block space-y-1.5">
          <span className="v2-micro">Ejercicio</span>
          <TextCell
            value={firstItem.exercise_name}
            ariaLabel="Nombre del ejercicio"
            maxLength={200}
            placeholder="p. ej. Sentadilla trasera"
            onChange={(name) => setFirstItem({ exercise_name: name })}
          />
        </label>
      ) : null}

      {/* The tailored form, routed by pattern */}
      {pattern === 'steady' && firstItem ? (
        <SteadyForm value={firstItem.prescription} onChange={setFirstPrescription} />
      ) : pattern === 'intervals' && firstItem ? (
        <IntervalsForm value={firstItem.prescription} onChange={setFirstPrescription} />
      ) : pattern === 'sets_table' && firstItem ? (
        <SetsTableForm value={firstItem.prescription} onChange={setFirstPrescription} />
      ) : pattern === 'components' ? (
        <ComponentsForm block={block} onChange={onChange} />
      ) : pattern === 'hyrox_sim' ? (
        <SimulacionHyroxForm block={block} onChange={onChange} />
      ) : (
        <p className="text-sm text-[color:var(--v2-muted)]">
          Elige un tipo de bloque para configurar la prescripción.
        </p>
      )}

      {/* Phase / method tag — coach's optional tag, inherits from the microciclo */}
      <PhaseInheritLine label={inheritedPhaseLabel} />

      {/* Athlete preview (the resolved line) — single-item patterns */}
      {!isMultiItem && firstItem ? (
        <AthletePreviewLine
          prescription={firstItem.prescription}
          exerciseName={firstItem.exercise_name}
          athleteName={athleteName}
        />
      ) : null}

      {/* Advanced escape hatch — full axes for the rare override (single-item) */}
      {!isMultiItem && firstItem ? (
        <AdvancedHatch value={firstItem.prescription} onChange={setFirstPrescription} />
      ) : null}
    </div>
  );
}

function FormHeader({
  archetype,
  onChangeType,
}: {
  archetype: Archetype;
  onChangeType?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[color:var(--v2-border)] pb-3">
      <span
        aria-hidden
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)]"
        style={{
          background: `var(--v2-mod-${archetype.modalitySlug}-soft)`,
          color: `var(--v2-mod-${archetype.modalitySlug})`,
        }}
      >
        <MIcon name={archetype.icon} size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-[color:var(--v2-fg)]">{archetype.name}</p>
        <p className="text-[11px] text-[color:var(--v2-muted)]">{archetype.purpose}</p>
      </div>
      {onChangeType ? (
        <button
          type="button"
          onClick={onChangeType}
          className="v2-focus ml-auto inline-flex shrink-0 items-center gap-1 rounded-[var(--v2-r-s)] px-2 py-1 text-[11px] font-bold text-[color:var(--v2-accent)] transition-colors hover:bg-[color:var(--v2-accent-soft)]"
        >
          <MIcon name="sync" size={13} />
          Cambiar tipo
        </button>
      ) : null}
    </div>
  );
}

// Phase/method tag — agnostic, optional, inherits from the microciclo. We show the
// inherited phase as context (read-only this chunk); a per-block override needs a
// schema field (methodology_phases) and is a flagged follow-up — we don't render a
// control that would be silently dropped on save.
function PhaseInheritLine({ label }: { label?: string | null }) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2">
      <span className="v2-micro">Fase del método</span>
      <span className="rounded-[var(--v2-r-pill)] bg-[color:var(--v2-surface)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--v2-muted)]">
        {label || 'Heredada del microciclo'}
      </span>
      <span className="ml-auto text-[10.5px] text-[color:var(--v2-faint)]">
        opcional · tu metodología
      </span>
    </div>
  );
}
