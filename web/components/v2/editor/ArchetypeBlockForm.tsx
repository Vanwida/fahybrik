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
// reused) for the rare override.

import type { Prescription } from '@fahybrid/shared/domain/prescription';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import {
  archetypeForFormat,
  getArchetype,
  patternForBlock,
  type Archetype,
} from '@/lib/dashboard/v2/archetypes';
import { MIcon } from '@/components/ui/MIcon';
import { ExercisePickerField } from './ExercisePickerField';
import { defaultCategoryForModality } from '@/lib/dashboard/v2/pick-exercise';
import { AdvancedHatch } from './AdvancedHatch';
import { AthletePreviewLine } from './AthletePreviewLine';
import { SteadyForm } from './archetype-forms/SteadyForm';
import { IntervalsForm } from './archetype-forms/IntervalsForm';
import { RunStructureForm } from './archetype-forms/run-structure/RunStructureForm';
import { SetsTableForm } from './archetype-forms/SetsTableForm';
import { ComponentsForm } from './archetype-forms/ComponentsForm';
import { SimulacionHyroxForm } from './archetype-forms/SimulacionHyroxForm';
import { TestForm } from './archetype-forms/TestForm';

export function ArchetypeBlockForm({
  block,
  athleteName,
  onChange,
  onChangeType,
}: {
  block: EditorBlock;
  athleteName?: string;
  onChange: (next: EditorBlock) => void;
  /** Reopen the type chooser to change the block's type. */
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
  // The Test pattern is single-item but SELF-CONTAINED: the test TYPE names the
  // exercise + fully defines the prescription (round-trips from it), so it shows
  // no free exercise-name input and no advanced-axes hatch (that would break the
  // type round-trip). It also has no athlete "preview line" — its output is the
  // zone calculator in the athlete profile, not an inline resolved line.
  const isTest = pattern === 'test';
  const firstItem: EditorItem | undefined = block.items[0];
  // A RUNNING intervals block gets the full structured-run builder (#61); ergo
  // intervals keep the simple IntervalsForm. The structure builder is self-
  // contained — no scalar "advanced hatch" (it would clobber `structure`).
  const isRunStructure = pattern === 'intervals' && firstItem?.prescription.modality === 'run';

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

      {/* Exercise picker (single-item patterns, except Test — its type names it).
          Picking sets the real exercise_id (A3 fix) + inherits modality. */}
      {!isMultiItem && !isTest && firstItem ? (
        <div className="space-y-1.5">
          <span className="v2-micro">Ejercicio</span>
          <ExercisePickerField
            item={firstItem}
            destinationLabel={archetype?.name ?? block.title ?? 'Ejercicio'}
            defaultCategory={defaultCategoryForModality(firstItem.prescription.modality)}
            onChange={(patch) => setFirstItem(patch)}
          />
        </div>
      ) : null}

      {/* The tailored form, routed by pattern */}
      {pattern === 'steady' && firstItem ? (
        <SteadyForm value={firstItem.prescription} onChange={setFirstPrescription} />
      ) : pattern === 'intervals' && firstItem ? (
        isRunStructure ? (
          <RunStructureForm value={firstItem.prescription} onChange={setFirstPrescription} />
        ) : (
          <IntervalsForm value={firstItem.prescription} onChange={setFirstPrescription} />
        )
      ) : pattern === 'sets_table' && firstItem ? (
        <SetsTableForm value={firstItem.prescription} onChange={setFirstPrescription} />
      ) : pattern === 'components' ? (
        <ComponentsForm block={block} onChange={onChange} />
      ) : pattern === 'hyrox_sim' ? (
        <SimulacionHyroxForm block={block} onChange={onChange} />
      ) : pattern === 'test' && firstItem ? (
        <TestForm value={firstItem.prescription} onChange={setFirstPrescription} />
      ) : null}

      {/* Athlete preview (the resolved line) — single-item patterns (not Test) */}
      {!isMultiItem && !isTest && firstItem ? (
        <AthletePreviewLine
          prescription={firstItem.prescription}
          exerciseName={firstItem.exercise_name}
          athleteName={athleteName}
        />
      ) : null}

      {/* Advanced escape hatch — full axes for the rare override (single-item, not
          Test, not the structured run: its scalar board would drop `structure`). */}
      {!isMultiItem && !isTest && !isRunStructure && firstItem ? (
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
      </div>
      {onChangeType ? (
        <button
          type="button"
          onClick={onChangeType}
          className="v2-focus ml-auto inline-flex shrink-0 items-center gap-1 rounded-[var(--v2-r-s)] px-2 py-1 text-label font-bold text-[color:var(--v2-accent)] transition-colors hover:bg-[color:var(--v2-accent-soft)]"
        >
          <MIcon name="sync" size={13} />
          Cambiar tipo
        </button>
      ) : null}
    </div>
  );
}
