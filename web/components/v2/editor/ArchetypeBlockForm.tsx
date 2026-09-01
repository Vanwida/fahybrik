'use client';

// ArchetypeBlockForm — the orchestrator that renders the TAILORED form for a
// block's archetype (UX pase §3). It is the DEFAULT simple input that replaces
// the toggle-first board. Routes by the archetype's base PATTERN to one of the
// forms:
//   - steady     → SteadyForm        (Z2/tempo · activación · test)
//   - intervals  → IntervalsForm     (series / intervalos)
//   - sets_table → SetsTableForm     (fuerza · reaches the strength composer directly)
//   - components → ComponentsForm    (WOD/metcon · circuito · EMOM · sim → base)
//
// Single-item patterns (steady/intervals/sets_table) edit ONE item's Prescription;
// the components pattern edits the block's ITEM LIST (a metcon is multiple items).
// Below every block: the "Ajuste avanzado" hatch (the full PrescriptionFields,
// reused) for the rare override. La cabecera del bloque (kicker + título + tag
// de modalidad) y la barra «El atleta ve» viven en BlockEditor (compositor):
// aquí solo va el formulario.

import type { Prescription } from '@fahybrid/shared/domain/prescription';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import { patternForBlock } from '@/lib/dashboard/v2/archetypes';
import { testTypeFromPrescription } from '@/lib/dashboard/v2/test-template';
import { ExercisePickerField } from './ExercisePickerField';
import { defaultCategoryForModality } from '@/lib/dashboard/v2/pick-exercise';
import { AdvancedHatch } from './AdvancedHatch';
import { SteadyForm } from './archetype-forms/SteadyForm';
import { IntervalsForm } from './archetype-forms/IntervalsForm';
import { RunStructureForm } from './archetype-forms/run-structure/RunStructureForm';
import { SetsTableForm } from './archetype-forms/SetsTableForm';
import { SupersetForm } from './archetype-forms/SupersetForm';
import { ComponentsForm } from './archetype-forms/ComponentsForm';
import { SimulacionHyroxForm } from './archetype-forms/SimulacionHyroxForm';
import { TestForm } from './archetype-forms/TestForm';

export function ArchetypeBlockForm({
  block,
  onChange,
}: {
  block: EditorBlock;
  onChange: (next: EditorBlock) => void;
}) {
  const pattern = patternForBlock(block.archetype_id, block.format);
  const firstItem: EditorItem | undefined = block.items[0];

  // The Test pattern is single-item but SELF-CONTAINED: the test TYPE names the
  // exercise + fully defines the prescription (round-trips from it), so it shows
  // no free exercise-name input and no advanced-axes hatch (that would break the
  // type round-trip). Its output is the zone calculator in the athlete profile.
  //
  // PERO solo cuando el bloque ES un test del catálogo: UN item cuya
  // prescripción devuelve su tipo. Un bloque `test` AUTORADO con varios items
  // (una batería — el conector MCP los crea, y el coach también puede) caía
  // aquí igualmente y el formulario escondía TODO su contenido: el coach veía
  // config y notas, jamás las dosis, con los datos perfectos debajo (11-ago).
  // Un formulario que no puede representar el contenido real degrada al editor
  // de items — nunca ceguera.
  const isTest =
    pattern === 'test' &&
    block.items.length === 1 &&
    firstItem != null &&
    testTypeFromPrescription(firstItem.prescription) != null;

  // Multi-item patterns (components, hyrox_sim, superset) edit the block's ITEM
  // LIST; the single-item patterns (steady/intervals/sets_table) edit one item's
  // prescription. Una superserie es multi-item POR DEFINICIÓN: lo que la hace
  // superserie es que sus ejercicios se alternan, así que trae su propio selector
  // de ejercicio por cada uno y no el único de arriba. Y el test que NO es de
  // catálogo se edita como lo que es: una lista de items con su dosis.
  const isMultiItem =
    pattern === 'components' ||
    pattern === 'hyrox_sim' ||
    pattern === 'superset' ||
    (pattern === 'test' && !isTest);
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
      {/* Exercise picker (single-item patterns, except Test — its type names it).
          Picking sets the real exercise_id (A3 fix) + inherits modality. */}
      {!isMultiItem && !isTest && firstItem ? (
        <div className="space-y-1.5">
          <span className="v2-micro">Ejercicio</span>
          <ExercisePickerField
            item={firstItem}
            destinationLabel={block.title || 'Ejercicio'}
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
      ) : pattern === 'superset' ? (
        <SupersetForm block={block} onChange={onChange} />
      ) : pattern === 'components' ? (
        <ComponentsForm block={block} onChange={onChange} />
      ) : pattern === 'hyrox_sim' ? (
        <SimulacionHyroxForm block={block} onChange={onChange} />
      ) : pattern === 'test' && isTest && firstItem ? (
        <TestForm value={firstItem.prescription} onChange={setFirstPrescription} />
      ) : pattern === 'test' ? (
        // La batería autorada: cada item con su dosis, editable.
        <ComponentsForm block={block} onChange={onChange} />
      ) : null}

      {/* Advanced escape hatch — full axes for the rare override (single-item, not
          Test, not the structured run: its scalar board would drop `structure`). */}
      {!isMultiItem && !isTest && !isRunStructure && firstItem ? (
        <AdvancedHatch value={firstItem.prescription} onChange={setFirstPrescription} />
      ) : null}
    </div>
  );
}
