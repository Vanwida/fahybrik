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
import { archetypeForFormat, getArchetype } from '@/lib/dashboard/v2/archetypes';
import {
  domainToAxisModalidad,
  MODALIDAD_OPTIONS,
  modalityColorSlug,
} from '@/lib/dashboard/v2/editor-axes';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

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
      className="inline-flex items-center gap-1.5 rounded-[var(--v2-r-pill)] px-2.5 py-1 text-xs font-bold"
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
  const base =
    'v2-focus inline-flex shrink-0 items-center rounded-[var(--v2-r-2xs)] px-1.5 py-[3px] text-[9px] font-extrabold uppercase leading-none tracking-wide transition-colors';
  const onStyle =
    'border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] text-[color:var(--v2-muted)]';

  if (!onToggle) {
    return optional ? <span className={cn(base, onStyle)}>Opcional</span> : null;
  }

  const offStyle =
    'border border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-faint)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-muted)]';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={optional}
      title={
        optional
          ? 'Quitar «opcional» — vuelve a ser obligatorio'
          : 'Marcar como opcional — el atleta puede saltárselo'
      }
      className={cn(base, optional ? onStyle : offStyle)}
    >
      Opcional
    </button>
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
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--v2-border)] pb-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="v2-micro">{kicker}</p>
        <input
          type="text"
          value={block.title}
          maxLength={120}
          placeholder={archetype?.defaultTitle ?? 'Nombre del bloque'}
          aria-label="Nombre del bloque"
          onChange={(e) => onChange({ ...block, title: e.target.value })}
          className="v2-focus v2-display w-full rounded-[var(--v2-r-2xs)] bg-transparent text-[26px] text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)]"
        />
        {shown || showOptionalToggle ? (
          <div className="flex flex-wrap items-center gap-2">
            {shown ? <ModalityTag modality={shown} fixedByExercise={fixed != null} /> : null}
            {showOptionalToggle ? (
              <OptionalBadge
                optional={block.optional ?? false}
                onToggle={() => onChange({ ...block, optional: !block.optional })}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {onDuplicate ? (
        <button
          type="button"
          onClick={onDuplicate}
          className="v2-focus inline-flex shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
        >
          <MIcon name="content_copy" size={15} />
          Duplicar
        </button>
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
      setError('Elige primero el ejercicio y aquí escribes su dosis.');
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
      <div className="flex items-center gap-2.5 rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] px-3 focus-within:border-[color:var(--v2-accent)]">
        <span aria-hidden className="v2-num font-bold text-[color:var(--v2-accent)]">
          ›
        </span>
        <input
          type="text"
          value={text}
          placeholder="o escríbelo: 4x4 @rir2 c/1'30''"
          aria-label="Escribir la dosis como siempre"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          className="v2-num h-9 w-full bg-transparent text-[13px] outline-none placeholder:font-sans placeholder:text-[color:var(--v2-faint)]"
        />
      </div>
      {error ? (
        <p className="px-1 text-label leading-snug text-[color:var(--v2-warn)]">{error}</p>
      ) : null}
    </div>
  );
}
