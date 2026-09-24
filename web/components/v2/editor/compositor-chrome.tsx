'use client';

// compositor-chrome — la cabecera del compositor de dosis y su quickline
// (rediseño del editor de microciclos, mock aprobado): kicker con el contexto
// del bloque, título grande editable en la voz de la marca (v2-display) y el
// tag de modalidad como DATO derivado del ejercicio — la modalidad es
// intrínseca al ejercicio (decisión 0053): cuando el ejercicio la fija, NO se
// pregunta; el eje solo aparece cuando no hay ejercicio que la determine.

import { useState } from 'react';
import type { Modality, Prescription } from '@fahybrid/shared/domain/prescription';
import { parseNotationCell } from '@fahybrid/shared/domain/import/notation';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';
import {
  ARCHETYPES,
  archetypeForFormat,
  getArchetype,
  type ArchetypeId,
} from '@/lib/dashboard/v2/archetypes';
import {
  applyBlockFormat,
  applyBlockType,
  selectedArchetypeId,
} from '@/lib/dashboard/v2/apply-block-type';
import {
  domainToAxisModalidad,
  isStrengthModality,
  MODALIDAD_OPTIONS,
  modalityColorSlug,
} from '@/lib/dashboard/v2/editor-axes';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';
import { ChevronRight, Copy } from 'lucide-react';
import { Button, Checkbox, Input, Select, Tag } from '@/components/v2/ui';

/**
 * El tag de modalidad: un dato, no un control. `fixedByExercise` añade el
 * «la pone el ejercicio» — el coach ve POR QUÉ no se le pregunta.
 */
export function ModalityTag({
  modality,
  fixedByExercise,
}: {
  modality: Modality;
  fixedByExercise: boolean;
}) {
  const slug = modalityColorSlug(modality);
  const label =
    MODALIDAD_OPTIONS.find((o) => o.value === domainToAxisModalidad(modality))?.label ?? 'Bloque';
  return (
    <span
      className="inline-flex h-6 items-center gap-1.5 rounded-[4px] px-2 t-meta"
      style={{ background: `var(--v2-mod-${slug}-soft)`, color: `var(--v2-mod-${slug})` }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
      {fixedByExercise ? (
        <span className="font-medium opacity-80">· la pone el ejercicio</span>
      ) : null}
    </span>
  );
}

/**
 * OptionalBadge — el bloque es un EXTRA que el atleta puede saltarse (fase 2,
 * ago-2026, DECISIONS.md 2026-08-05). Mismo componente en las TRES superficies
 * que lo enseñan (hoja del día, compositor, tablero Semana — SessionPartCard,
 * CompositorHeader, SemanaBoard.BlockLine) para que nunca puedan divergir
 * visualmente. Estilo `.badge-op` del mock aprobado.
 *
 * Con `onToggle` es un CONTROL clicable (día/compositor: persiste vía
 * `EditorBlock.optional`). Sin él es de SOLO LECTURA (Semana: la tarjeta
 * entera ya es un `<Link>` — anidar un `<button>` ahí sería HTML inválido) y
 * no pinta nada cuando no es opcional, porque el badge existe para DECIR
 * "esto es opcional", no para invitar a tocarlo.
 */
export function OptionalBadge({
  optional,
  onToggle,
}: {
  optional: boolean;
  onToggle?: () => void;
}) {
  if (!onToggle) {
    return optional ? <Tag>Opcional</Tag> : null;
  }
  return (
    <Checkbox
      label="Opcional"
      checked={optional}
      onCheckedChange={() => onToggle()}
      className="t-body-sm text-v2-muted"
    />
  );
}

/** La modalidad que el EJERCICIO fija en una línea (0053), o null si nada la fija. */
export function exerciseFixedModality(item: {
  exercise_id: number | null;
  exercise_modality?: Modality | null;
  prescription: Prescription;
}): Modality | null {
  if (item.exercise_modality) return item.exercise_modality;
  // El picker hereda la modalidad intrínseca sobre la prescripción al elegir:
  // con ejercicio elegido, esa modalidad viene del catálogo, no de una pista.
  if (item.exercise_id != null) return item.prescription.modality ?? null;
  return null;
}

// ── Picker de formato: series rectas ↔ superserie (fase 2, ago-2026) ─────────
// `scheme:'superset'`/`format:'superset'` ROTA los ejercicios del bloque
// (A1→A2→A1→A2); `scheme:'sets'` los ejecuta en series rectas. Es una decisión
// de BLOQUE, no de ejercicio suelto (DECISIONS.md 2026-08-05): todo el bloque
// rota o ninguno. `SupersetForm` ya sabe EDITAR un bloque `superset` — lo que
// faltaba era elegirlo desde un bloque de fuerza existente.

/**
 * ¿Este bloque puede alternar entre series rectas y superserie? Solo cuando
 * ya está en uno de esos dos esquemas y tiene al menos dos ejercicios — un
 * EMOM, un circuito o un WOD con un movimiento de fuerza dentro no entran
 * aquí: su rotación la gobierna `rounds`/`work_s`, no este picker. La
 * superserie es la pareja de `sets`, no de cualquier formato que rote.
 */
export function canPickBlockFormat(block: EditorBlock): boolean {
  if (block.items.length < 2) return false;
  const first = block.items[0];
  if (!first) return false;
  const modality = exerciseFixedModality(first) ?? first.prescription.modality;
  if (!isStrengthModality(modality)) return false;
  const scheme = first.prescription.scheme;
  return scheme === 'sets' || scheme === 'superset';
}

export { applyBlockFormat };

/**
 * El tipo de trabajo del bloque: la misma lista que al añadirlo. Es un
 * CONTROL (card 158), no una etiqueta: el coach puede corregir un calentamiento
 * que nació como fuerza sin borrar los ejercicios.
 */
export function BlockTypePicker({
  block,
  onChange,
}: {
  block: EditorBlock;
  onChange: (next: EditorBlock) => void;
}) {
  const current = selectedArchetypeId(block);
  return (
    <Select
      size="sm"
      aria-label="Tipo de bloque"
      placeholder="Tipo"
      value={current === '' ? null : current}
      onValueChange={(id: ArchetypeId) => onChange(applyBlockType(block, id))}
      options={ARCHETYPES.map((a) => ({ value: a.id, label: a.shortName }))}
      className="max-w-[12rem]"
    />
  );
}

const BLOCK_FORMAT_OPTIONS = [
  { value: 'sets' as const, label: 'Series rectas' },
  { value: 'superset' as const, label: 'Superserie' },
];

function BlockFormatPicker({
  block,
  onChange,
}: {
  block: EditorBlock;
  onChange: (next: EditorBlock) => void;
}) {
  const value: 'sets' | 'superset' =
    block.items[0]?.prescription.scheme === 'superset' ? 'superset' : 'sets';
  return (
    <div className="space-y-1">
      <p className="t-meta text-v2-muted">Formato</p>
      <ChipGroup
        mono={false}
        options={BLOCK_FORMAT_OPTIONS}
        value={value}
        ariaLabel="Formato del bloque: series rectas o superserie"
        onChange={(next) => onChange(applyBlockFormat(block, next === 'superset'))}
      />
    </div>
  );
}

/**
 * La cabecera del compositor: kicker de contexto, título del bloque editable
 * en grande y el tag de modalidad derivado. «Guardar bloque» vive en la barra
 * inferior («El atleta ve»); aquí solo queda la acción secundaria (duplicar).
 */
export function CompositorHeader({
  block,
  onChange,
  onDuplicate,
  showOptionalToggle = false,
}: {
  block: EditorBlock;
  onChange: (next: EditorBlock) => void;
  onDuplicate?: () => void;
  /**
   * Enseña el toggle «Opcional» (fase 2). Por defecto OFF: solo el day editor
   * (BlockEditorDrawer) persiste `optional` — la Biblioteca de bloques y el
   * editor de sesión de la librería (BlockLibraryEditor/SessionEditor) guardan
   * por otro camino (`blockWriteSchema`/`serializeSessionSegments`) que NO
   * lleva este campo, así que enseñar el control ahí mentiría: el coach lo
   * marcaría y se perdería al guardar. Honestidad del dato (CONTRATO-UI §7).
   */
  showOptionalToggle?: boolean;
}) {
  const archetype = block.archetype_id
    ? getArchetype(block.archetype_id)
    : archetypeForFormat(block.format);
  const kicker = [
    archetype?.name ?? 'Bloque',
    block.items.length > 1 ? `${block.items.length} ejercicios` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const first = block.items[0];
  const fixed = first ? exerciseFixedModality(first) : null;
  const shown = fixed ?? first?.prescription.modality ?? null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-v2-border pb-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="t-label text-v2-faint">{kicker}</p>
        <Input
          type="text"
          value={block.title}
          maxLength={120}
          placeholder={archetype?.defaultTitle ?? 'Nombre del bloque'}
          aria-label="Nombre del bloque"
          onChange={(e) => onChange({ ...block, title: e.target.value })}
          className="-ml-2 h-9 border-transparent bg-transparent px-2 t-title-sm hover:border-v2-border"
        />
        <div className="flex flex-wrap items-center gap-2">
          <BlockTypePicker block={block} onChange={onChange} />
          {shown ? <ModalityTag modality={shown} fixedByExercise={fixed != null} /> : null}
          {showOptionalToggle ? (
            <OptionalBadge
              optional={block.optional ?? false}
              onToggle={() => onChange({ ...block, optional: !block.optional })}
            />
          ) : null}
        </div>
        {canPickBlockFormat(block) ? <BlockFormatPicker block={block} onChange={onChange} /> : null}
      </div>
      {onDuplicate ? (
        <Button size="sm" icon={Copy} onClick={onDuplicate}>
          Duplicar
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Mini-quickline del compositor: «o escríbelo» con la gramática REAL del
 * importador (parseNotationCell, client-safe — mismo camino que
 * RunStructureForm). Rellena los controles al confirmar; lo que la gramática no
 * prueba NO se aplica y se dice — jamás se inventa un número.
 */
export function QuickDoseLine({
  exerciseName,
  onApply,
}: {
  /** El ejercicio ya elegido: la gramática exige nombre y aquí ya lo tenemos. */
  exerciseName: string;
  /** Recibe los `sets[]` probados por la gramática (copias, listos para escribir). */
  onApply: (parsed: Prescription) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const raw = text.trim();
    if (!raw) return;
    const name = exerciseName.trim();
    if (!name) {
      setError('Elige primero el ejercicio y aquí escribes series, reps y carga.');
      return;
    }
    const line = parseNotationCell(`${name} ${raw}`)[0];
    const ok =
      line !== undefined &&
      line.confidence === 'detected' &&
      line.prescription.scheme === 'sets' &&
      (line.prescription.sets?.length ?? 0) > 0;
    if (!ok) {
      setError("No lo he pillado entero; prueba: 4x4 @rir2 c/1'30''");
      return;
    }
    onApply(line.prescription);
    setText('');
    setError(null);
  };

  return (
    <div className="space-y-1">
      <Input
        type="text"
        icon={ChevronRight}
        value={text}
        placeholder="o escríbelo: 4x4 @rir2 c/1'30''"
        aria-label="Escribir series, reps y carga como siempre"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        className="t-tnum"
      />
      {error ? <p className="px-1 t-meta text-v2-warn">{error}</p> : null}
    </div>
  );
}
