'use client';

import { useMemo, useState } from 'react';
import type {
  BlockUseModifiers,
  WeekDayPart,
  WeekDayPartConfig,
  WeekDayPartItem,
} from '@fahybrid/shared/schema/program-templates';
import { findItem, findPart } from '@/lib/dashboard/programming/day-composition';
import { applyModifiersToBlockPart } from '@/lib/dashboard/programming/block-to-part';
import { blockOriginInfo } from '@/lib/dashboard/programming/block-origin';
import { createItemFromExercise } from '@/lib/dashboard/programming/part-factory';
import {
  paramFieldsForGroup,
  type PartParamField,
} from '@/lib/dashboard/constants/week-day-part-presets';
import {
  blockPrescription,
  exerciseRowSummary,
} from '@/lib/dashboard/programming/block-panel';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import type { SessionIndex, StudioSelection } from '@/lib/dashboard/programming/studio-types';
import { dayLabel } from '@/lib/dashboard/constants/calendar';
import type { WeekSlots } from '@fahybrid/shared/schema/program-templates';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/ui/MIcon';
import { PabloIAInput, PabloIATextarea } from '@/components/dashboard/pablo-ia/PabloIAInput';
import { ExercisePicker } from '@/components/dashboard/programming/studio/ExercisePicker';
import { PrescriptionEditor } from '@/components/dashboard/programming/studio/PrescriptionEditor';
import {
  legacyItemToPrescription,
  prescriptionToParams,
  prescriptionToText,
  safeParsePrescription,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';

interface StudioDetailPanelProps {
  selection: StudioSelection;
  slots: WeekSlots;
  exercises: CatalogExercise[];
  onClose: () => void;
  onChangePart: (part: WeekDayPart) => void;
  onChangeItem: (item: WeekDayPartItem) => void;
  onRemovePart: () => void;
  onRemoveItem: () => void;
  /** F12 — duplica el bloque seleccionado (copia tras el original). */
  onDuplicatePart: () => void;
}

function sessionLabel(idx: SessionIndex): string {
  if (idx === 0) return 'Entreno';
  if (idx === 1) return '2.º entreno';
  return `${idx + 1}.º entreno`;
}

export function StudioDetailPanel({
  selection,
  slots,
  exercises,
  onClose,
  onChangePart,
  onChangeItem,
  onRemovePart,
  onRemoveItem,
  onDuplicatePart,
}: StudioDetailPanelProps) {
  const part = findPart(
    slots,
    selection.day_of_week,
    selection.session_index,
    selection.part_uid,
  );
  const label = dayLabel(selection.day_of_week as 1 | 2 | 3 | 4 | 5 | 6 | 7);

  if (!part) return null;

  // Un ejercicio concreto seleccionado abre su editor de parámetros a pantalla
  // completa (foco en un solo ejercicio). El editor de BLOQUE lista todos los
  // ejercicios con edición inline, sin salir del bloque.
  if (selection.target === 'item') {
    const item = findItem(slots, selection);
    if (!item) return null;
    return (
      <ItemPanel
        label={label}
        sessionIndex={selection.session_index}
        partTitle={part.title}
        item={item}
        exercise={exercises.find((e) => e.id === String(item.exercise_id))}
        onClose={onClose}
        onChange={onChangeItem}
        onRemove={onRemoveItem}
      />
    );
  }

  return (
    <PartPanel
      label={label}
      sessionIndex={selection.session_index}
      part={part}
      exercises={exercises}
      onClose={onClose}
      onChange={onChangePart}
      onRemove={onRemovePart}
      onDuplicate={onDuplicatePart}
    />
  );
}

// En el drawer móvil (<lg) el panel ocupa todo el ancho sin borde propio; en
// lg+ es el panel lateral fijo de 320px con su borde izquierdo de siempre.
const panelShellClass =
  'flex h-full w-full shrink-0 flex-col overflow-hidden bg-[color:var(--surface-card)] lg:w-80 lg:border-l lg:border-[color:var(--border-subtle)]';

// ---------- Panel de BLOQUE (biblioteca o a medida) ----------

function PartPanel({
  label,
  sessionIndex,
  part,
  exercises,
  onClose,
  onChange,
  onRemove,
  onDuplicate,
}: {
  label: string;
  sessionIndex: SessionIndex;
  part: WeekDayPart;
  exercises: CatalogExercise[];
  onClose: () => void;
  onChange: (part: WeekDayPart) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const origin = blockOriginInfo(part);
  const isLibrary = origin.origin === 'library';
  const config = part.config_json ?? {};
  const mods = part.block_modifiers ?? {};

  // Prescripción verbatim (solo biblioteca): el cuerpo del coach_note antes del
  // separador de modificadores. Referencia read-only, propiedad de la biblioteca.
  const prescription = useMemo(() => blockPrescription(part), [part]);

  // Sin estructura por-atleta: bloque de biblioteca cuyo `block_exercises` no se
  // ha hidratado en `items` (needs_review o falta el endpoint de detalle). El
  // coach trabaja con la prescripción verbatim + añade ejercicios a medida.
  const hasStructuredExercises = part.items.length > 0;

  const patchConfig = (patch: Partial<WeekDayPartConfig>) => {
    onChange({ ...part, config_json: { ...config, ...patch } });
  };

  const patchMod = (patch: Partial<BlockUseModifiers>) => {
    const next: BlockUseModifiers = { ...mods, ...patch };
    (Object.keys(next) as (keyof BlockUseModifiers)[]).forEach((k) => {
      const v = next[k];
      if (v == null || v === '' || (typeof v === 'number' && Number.isNaN(v))) delete next[k];
    });
    onChange(applyModifiersToBlockPart(part, next));
  };

  const setItems = (items: WeekDayPartItem[]) => onChange({ ...part, items });

  const updateItem = (next: WeekDayPartItem) =>
    setItems(part.items.map((i) => (i.uid === next.uid ? next : i)));

  const removeItem = (uid: string) => setItems(part.items.filter((i) => i.uid !== uid));

  const addExercise = (exercise: CatalogExercise) =>
    setItems([...part.items, createItemFromExercise(exercise)]);

  return (
    <aside className={panelShellClass}>
      <PanelHeader
        eyebrow={`${label} · ${sessionLabel(sessionIndex)}`}
        title={part.title}
        editableTitle={
          isLibrary
            ? undefined
            : {
                value: part.title,
                onChange: (v) => onChange({ ...part, title: v }),
                context: {
                  format: part.format,
                  items_count: part.items.length,
                  exercises: part.items.map((i) => i.exercise_name),
                },
              }
        }
        chips={
          <>
            <OriginChip origin={origin.origin} label={origin.label} />
            <FormatChip format={part.format} />
          </>
        }
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto">
        {/* Prescripción de Pablo (referencia verbatim, solo biblioteca). */}
        {isLibrary && prescription ? (
          <Section first>
            <SectionTitle>Prescripción de Pablo</SectionTitle>
            <p className="mt-2 whitespace-pre-wrap rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] p-3 text-sm leading-relaxed text-[color:var(--fg)]">
              {prescription}
            </p>
            <p className="mt-2 text-[10px] text-[color:var(--text-muted)]">
              Referencia. Los ajustes de abajo son para este atleta y no tocan la
              biblioteca.
            </p>
          </Section>
        ) : null}

        {/* Ejercicios del bloque — editables por-atleta. */}
        <Section first={!(isLibrary && prescription)}>
          <div className="flex items-center justify-between">
            <SectionTitle>Ejercicios</SectionTitle>
            {hasStructuredExercises ? (
              <span className="metric-num text-[10px] text-[color:var(--text-muted)]">
                {part.items.length}
              </span>
            ) : null}
          </div>

          {hasStructuredExercises ? (
            <div className="mt-2 space-y-2">
              {part.items.map((item) => (
                <ExerciseRow
                  key={item.uid}
                  item={item}
                  partTitle={part.title}
                  exercise={exercises.find((e) => e.id === String(item.exercise_id))}
                  onChange={updateItem}
                  onRemove={() => removeItem(item.uid)}
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-[var(--r-sm)] border border-dashed border-[color:var(--border-subtle)] p-3 text-xs leading-relaxed text-[color:var(--text-muted)]">
              {isLibrary
                ? 'Este bloque no tiene ejercicios estructurados (pendiente de revisión). Sigue la prescripción de arriba o añade ejercicios a medida para este atleta.'
                : 'Aún no hay ejercicios. Añade los del catálogo para este bloque.'}
            </p>
          )}

          <ExercisePicker
            exercises={exercises}
            onSelect={addExercise}
            triggerLabel="Añadir ejercicio"
            className="mt-2"
          />
        </Section>

        {/* Ajustes a nivel bloque. */}
        {isLibrary ? (
          <Section>
            <SectionTitle>Ajustes del bloque (este atleta)</SectionTitle>
            <p className="mt-1 text-[10px] text-[color:var(--text-muted)]">
              Escalan el bloque entero sin tocar cada ejercicio.
            </p>
            <div className="mt-3 space-y-4">
              <PresetStepper
                label="Intensidad (%)"
                value={mods.intensity_pct ?? null}
                onChange={(v) => patchMod({ intensity_pct: v ?? undefined })}
                presets={[60, 70, 80, 85, 90, 100]}
                step={5}
                min={0}
                max={200}
                formatValue={(v) => `${v}%`}
              />

              <div className="block">
                <FieldLabel>Nivel</FieldLabel>
                <input
                  type="text"
                  value={mods.level ?? ''}
                  onChange={(e) => patchMod({ level: e.target.value || undefined })}
                  maxLength={40}
                  placeholder="p.ej. RX / escalado"
                  className="focus-ring mt-1 w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-3 py-2 text-sm text-[color:var(--fg)] outline-none placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <PresetStepper
                  label="Duración (min)"
                  value={mods.duration_min ?? null}
                  onChange={(v) => patchMod({ duration_min: v ?? undefined })}
                  presets={[10, 20, 30, 45, 60]}
                  step={5}
                  min={1}
                  max={600}
                  formatValue={(v) => `${v}′`}
                />
                <IntegerStepper
                  label="Rondas"
                  value={mods.rounds ?? null}
                  onChange={(v) => patchMod({ rounds: v ?? undefined })}
                  min={1}
                  max={60}
                />
              </div>
            </div>
          </Section>
        ) : (
          <Section>
            <FormatConfigFields
              format={part.format}
              methodologyGroupId={part.methodology_group_id}
              config={config}
              onPatch={patchConfig}
            />
          </Section>
        )}

        {/* Nota específica para el atleta. Para un bloque de biblioteca vive en
            `athlete_note` (no pisa la prescripción verbatim de `coach_note`);
            para uno a medida `coach_note` ES la nota del bloque. */}
        <Section>
          <SectionTitle>Nota para el atleta</SectionTitle>
          <div className="mt-2">
            <PabloIATextarea
              value={(isLibrary ? part.athlete_note : part.coach_note) ?? ''}
              onChange={(v) =>
                onChange(
                  isLibrary
                    ? { ...part, athlete_note: v || undefined }
                    : { ...part, coach_note: v || undefined },
                )
              }
              surface="coach_note"
              context={{
                block_title: part.title,
                format: part.format,
                exercises: part.items.map((i) => i.exercise_name),
              }}
              rows={3}
              placeholder={
                isLibrary
                  ? 'Ajuste o indicación para este atleta…'
                  : 'Instrucciones generales del bloque…'
              }
            />
          </div>
        </Section>
      </div>

      <PanelFooter onRemove={onRemove} removeLabel="Quitar bloque" onDuplicate={onDuplicate} />
    </aside>
  );
}

// ---------- Fila de ejercicio (resumen compacto + edición expandible) ----------

function ExerciseRow({
  item,
  partTitle,
  exercise,
  onChange,
  onRemove,
}: {
  item: WeekDayPartItem;
  partTitle: string;
  exercise: CatalogExercise | undefined;
  onChange: (item: WeekDayPartItem) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const params = (item.params_json ?? {}) as Record<string, number | string | undefined>;
  const summary = exerciseRowSummary(params);

  return (
    <div className="overflow-hidden rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)]">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="focus-ring flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
        >
          <MIcon
            name="chevron_right"
            size={16}
            className={cn(
              'shrink-0 text-[color:var(--text-muted)] transition-transform',
              open && 'rotate-90',
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[color:var(--fg)]">
              {item.exercise_name}
            </span>
            {summary ? (
              <span className="metric-num block truncate text-[11px] text-[color:var(--on-surface-variant)]">
                {summary}
              </span>
            ) : (
              <span className="block text-[11px] text-[color:var(--text-muted)]">
                Sin parámetros · toca para ajustar
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${item.exercise_name}`}
          className="focus-ring mr-1 shrink-0 rounded-[var(--r-sm)] p-1.5 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--danger)]"
        >
          <MIcon name="close" size={15} />
        </button>
      </div>

      {open ? (
        <div className="border-t border-[color:var(--border-subtle)] p-3">
          <ExerciseParamsEditor item={item} exercise={exercise} partTitle={partTitle} onChange={onChange} />
        </div>
      ) : null}
    </div>
  );
}

// ---------- Editor de parámetros (compartido fila inline + panel de ejercicio) ----------

function ExerciseParamsEditor({
  item,
  exercise,
  partTitle,
  onChange,
  showNotes = true,
  showCues = false,
}: {
  item: WeekDayPartItem;
  exercise: CatalogExercise | undefined;
  partTitle: string;
  onChange: (item: WeekDayPartItem) => void;
  showNotes?: boolean;
  showCues?: boolean;
}) {
  // STRUCTURED prescription is the source of truth for the editor. On LOAD: edit
  // the item's `prescription_json` when present; otherwise DERIVE one in-memory
  // from the legacy params+notes (older weeks like the June plan) so the coach
  // immediately sees structured sets — WITHOUT mutating storage on load.
  const prescription: Prescription = useMemo(() => {
    if (item.prescription_json) return item.prescription_json as Prescription;
    return legacyItemToPrescription({
      params_json: (item.params_json ?? null) as Record<string, unknown> | null,
      notes: item.notes ?? null,
    });
  }, [item.prescription_json, item.params_json, item.notes]);

  // On EDIT: validate (client guard — server re-validates), then write BOTH the
  // structured `prescription_json` and a derived scalar `params_json` summary so
  // every legacy reader (row summary, materializer, iOS) keeps working during
  // transition. Notes is left untouched — it's a genuine optional coach note now.
  const applyPrescription = (next: Prescription) => {
    const parsed = safeParsePrescription(next);
    if (!parsed.success) return; // never persist an invalid shape
    const valid = parsed.data as Prescription;
    onChange({
      ...item,
      prescription_json: valid,
      params_json: prescriptionToParams(valid),
    });
  };

  const summaryText = prescriptionToText(prescription);

  return (
    <div className="space-y-4">
      <PrescriptionEditor
        value={prescription}
        exerciseName={item.exercise_name}
        onChange={applyPrescription}
      />

      {summaryText ? (
        <p className="rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-2.5 py-1.5 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
          {summaryText}
        </p>
      ) : null}

      {showNotes ? (
        <div className="block">
          <FieldLabel>Nota del coach (opcional)</FieldLabel>
          <div className="mt-1">
            <PabloIATextarea
              value={item.notes ?? ''}
              onChange={(v) => onChange({ ...item, notes: v || undefined })}
              surface="coach_note"
              context={{
                exercise_name: item.exercise_name,
                params: item.params_json,
                block_title: partTitle,
              }}
              rows={2}
              placeholder="Indicación técnica, NO la prescripción…"
            />
          </div>
        </div>
      ) : null}

      {showCues && exercise?.cues ? (
        <div className="border-t border-[color:var(--border-subtle)] pt-4">
          <FieldLabel>Cues</FieldLabel>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">{exercise.cues}</p>
        </div>
      ) : null}
    </div>
  );
}

// ---------- Panel de un ejercicio suelto (foco individual) ----------

function ItemPanel({
  label,
  sessionIndex,
  partTitle,
  item,
  exercise,
  onClose,
  onChange,
  onRemove,
}: {
  label: string;
  sessionIndex: SessionIndex;
  partTitle: string;
  item: WeekDayPartItem;
  exercise?: CatalogExercise | undefined;
  onClose: () => void;
  onChange: (item: WeekDayPartItem) => void;
  onRemove: () => void;
}) {
  return (
    <aside className={panelShellClass}>
      <PanelHeader
        eyebrow={`${label} · ${sessionLabel(sessionIndex)} · ${partTitle}`}
        title={item.exercise_name}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto p-4">
        <FieldLabel>Parámetros del ejercicio</FieldLabel>
        <div className="mt-3">
          <ExerciseParamsEditor
            item={item}
            exercise={exercise}
            partTitle={partTitle}
            onChange={onChange}
            showNotes
            showCues
          />
        </div>
      </div>

      <PanelFooter onRemove={onRemove} removeLabel="Quitar ejercicio" />
    </aside>
  );
}

function FormatConfigFields({
  format,
  methodologyGroupId,
  config,
  onPatch,
}: {
  format: WeekDayPart['format'];
  methodologyGroupId: number | null | undefined;
  config: WeekDayPartConfig;
  onPatch: (patch: Partial<WeekDayPartConfig>) => void;
}) {
  // Un bloque a medida con grupo metodológico (1–10) muestra EXACTAMENTE los
  // campos de su grupo: Running → distancia/ritmo/zona/intervalos; Fuerza →
  // series/reps/%/RPE; Ergómetros → trabajo/descanso/zona; etc. Fuente única:
  // `paramFieldsForGroup` (deriva de los presets). Los parts sin grupo (piezas
  // de Estructura legacy / biblioteca) caen al modo por `format`.
  const groupFields = paramFieldsForGroup(methodologyGroupId);
  const fields: PartParamField[] = groupFields ?? formatParamFields(format);

  return (
    <>
      <SectionTitle>Configuración</SectionTitle>
      <div className="mt-3 space-y-4">
        {fields.map((field) => (
          <PartConfigField key={field} field={field} config={config} onPatch={onPatch} />
        ))}
      </div>
    </>
  );
}

/** Campos por `format` técnico — fallback para parts sin grupo metodológico. */
function formatParamFields(format: WeekDayPart['format']): PartParamField[] {
  switch (format) {
    case 'amrap':
    case 'for_time':
      return ['time_cap_seconds'];
    case 'emom':
      return ['time_cap_seconds', 'emom_interval_seconds', 'rounds'];
    case 'intervals':
      return ['rounds', 'work_seconds', 'rest_seconds'];
    case 'circuit':
      return ['rounds', 'stations'];
    case 'hyrox_sim':
      return ['rounds', 'stations'];
    case 'strength_block':
      return ['rounds', 'rest_seconds'];
    default:
      return [];
  }
}

/** Renderiza un único campo de config de bloque con el control adecuado. */
function PartConfigField({
  field,
  config,
  onPatch,
}: {
  field: PartParamField;
  config: WeekDayPartConfig;
  onPatch: (patch: Partial<WeekDayPartConfig>) => void;
}) {
  switch (field) {
    case 'time_cap_seconds':
      return (
        <PresetStepper
          label="Tiempo cap"
          value={config.time_cap_seconds ?? null}
          onChange={(v) => onPatch({ time_cap_seconds: v ?? undefined })}
          presets={[300, 600, 900, 1200, 1800, 3600]}
          step={60}
          min={0}
          formatValue={formatDuration}
        />
      );
    case 'emom_interval_seconds':
      return (
        <PresetStepper
          label="Intervalo EMOM"
          value={config.emom_interval_seconds ?? null}
          onChange={(v) => onPatch({ emom_interval_seconds: v ?? undefined })}
          presets={[30, 45, 60, 90]}
          step={5}
          min={5}
          formatValue={formatDuration}
        />
      );
    case 'rounds':
      return (
        <IntegerStepper
          label="Rondas"
          value={config.rounds ?? null}
          onChange={(v) => onPatch({ rounds: v ?? undefined })}
          min={1}
          max={30}
        />
      );
    case 'stations':
      return (
        <IntegerStepper
          label="Estaciones"
          value={config.stations ?? null}
          onChange={(v) => onPatch({ stations: v ?? undefined })}
          min={1}
          max={20}
        />
      );
    case 'work_seconds':
      return (
        <PresetStepper
          label="Trabajo"
          value={config.work_seconds ?? null}
          onChange={(v) => onPatch({ work_seconds: v ?? undefined })}
          presets={[20, 30, 40, 60, 90, 120]}
          step={5}
          min={5}
          formatValue={formatDuration}
        />
      );
    case 'rest_seconds':
      return (
        <PresetStepper
          label="Descanso"
          value={config.rest_seconds ?? null}
          onChange={(v) => onPatch({ rest_seconds: v ?? undefined })}
          presets={[30, 60, 90, 120, 180]}
          step={15}
          min={0}
          formatValue={formatRest}
        />
      );
    case 'duration_seconds':
      return (
        <PresetStepper
          label="Duración"
          value={config.duration_seconds ?? null}
          onChange={(v) => onPatch({ duration_seconds: v ?? undefined })}
          presets={[300, 600, 1200, 1800, 2700, 3600, 5400]}
          step={60}
          min={0}
          formatValue={formatDuration}
        />
      );
    case 'distance_meters':
      return (
        <PresetStepper
          label="Distancia"
          value={config.distance_meters ?? null}
          onChange={(v) => onPatch({ distance_meters: v ?? undefined })}
          presets={[200, 400, 800, 1000, 2000, 5000]}
          step={100}
          min={0}
          formatValue={formatDistance}
        />
      );
    case 'pace_sec_per_km':
      return (
        <PresetStepper
          label="Ritmo objetivo"
          value={config.pace_sec_per_km ?? null}
          onChange={(v) => onPatch({ pace_sec_per_km: v ?? undefined })}
          presets={[210, 240, 270, 300, 330, 360, 420]}
          step={5}
          min={120}
          formatValue={formatPace}
        />
      );
    case 'hr_zone':
      return (
        <HrZoneChips
          value={config.hr_zone ?? null}
          onChange={(v) => onPatch({ hr_zone: v ?? undefined })}
        />
      );
    case 'sets':
      return (
        <IntegerStepper
          label="Series"
          value={config.sets ?? null}
          onChange={(v) => onPatch({ sets: v ?? undefined })}
          min={1}
          max={20}
        />
      );
    case 'reps':
      return (
        <IntegerStepper
          label="Reps"
          value={config.reps ?? null}
          onChange={(v) => onPatch({ reps: v ?? undefined })}
          min={1}
          max={100}
        />
      );
    case 'load_pct':
      return (
        <PresetStepper
          label="Carga (% 1RM)"
          value={config.load_pct ?? null}
          onChange={(v) => onPatch({ load_pct: v ?? undefined })}
          presets={[60, 70, 75, 80, 85, 90]}
          step={5}
          min={0}
          max={100}
          formatValue={(v) => `${v}%`}
        />
      );
    case 'load_kg':
      return (
        <PresetStepper
          label="Carga (kg)"
          value={config.load_kg ?? null}
          onChange={(v) => onPatch({ load_kg: v ?? undefined })}
          presets={[20, 40, 60, 80, 100, 120]}
          step={2.5}
          min={0}
          formatValue={(v) => `${v} kg`}
        />
      );
    case 'rpe':
      return (
        <RpeScale value={config.rpe ?? null} onChange={(v) => onPatch({ rpe: v ?? undefined })} />
      );
    default:
      return null;
  }
}

// ---------- Estructura del panel ----------

function PanelHeader({
  eyebrow,
  title,
  editableTitle,
  chips,
  onClose,
}: {
  eyebrow: string;
  title: string;
  editableTitle?: {
    value: string;
    onChange: (v: string) => void;
    context: Record<string, unknown>;
  };
  chips?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="border-b border-[color:var(--border-subtle)] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="micro-label min-w-0 flex-1 truncate tracking-[0.12em] text-[color:var(--accent)]">
          {eyebrow}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel"
          className="focus-ring -mt-1 shrink-0 rounded-[var(--r-sm)] p-1.5 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)]"
        >
          <MIcon name="close" size={16} />
        </button>
      </div>

      {editableTitle ? (
        <div className="mt-2">
          <PabloIAInput
            value={editableTitle.value}
            onChange={editableTitle.onChange}
            surface="block_title"
            context={editableTitle.context}
          />
        </div>
      ) : (
        <h3 className="mt-1.5 font-display text-lg font-bold italic uppercase leading-tight tracking-tight text-[color:var(--fg)]">{title}</h3>
      )}

      {chips ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{chips}</div> : null}
    </div>
  );
}

function PanelFooter({
  onRemove,
  removeLabel,
  onDuplicate,
}: {
  onRemove: () => void;
  removeLabel: string;
  /** F12 — opcional: muestra "Duplicar bloque" sobre el botón de quitar. */
  onDuplicate?: () => void;
}) {
  return (
    <div className="space-y-2 border-t border-[color:var(--border-subtle)] p-4">
      {onDuplicate ? (
        <button
          type="button"
          onClick={onDuplicate}
          className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[color:var(--fg)] hover:bg-[color:var(--surface-container-highest)]"
        >
          <MIcon name="content_copy" size={15} />
          <span>Duplicar bloque</span>
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        className="focus-ring w-full rounded-[var(--r-sm)] border border-[color:var(--danger)]/40 px-3 py-2 text-sm font-semibold text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
      >
        {removeLabel}
      </button>
    </div>
  );
}

function Section({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <section className={cn('px-4 py-4', !first && 'border-t border-[color:var(--border-subtle)]')}>
      {children}
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="micro-label tracking-[0.12em]">{children}</h4>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="micro-label tracking-[0.12em]">{children}</span>
  );
}

function OriginChip({ origin, label }: { origin: 'library' | 'custom'; label: string }) {
  const isLibrary = origin === 'library';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[var(--r-pill)] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        isLibrary
          ? 'border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
          : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] text-[color:var(--text-muted)]',
      )}
    >
      <MIcon name={isLibrary ? 'library_books' : 'tune'} size={12} />
      {label}
    </span>
  );
}

function FormatChip({ format }: { format: WeekDayPart['format'] }) {
  return (
    <span className="inline-flex items-center rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
      {format}
    </span>
  );
}

// ---------- Pickers (mouse > keyboard) ----------

function formatDuration(s: number): string {
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return sec === 0 ? `${min}'` : `${min}'${sec.toString().padStart(2, '0')}`;
}

function formatRest(s: number): string {
  if (s < 60) return `${s}s`;
  const min = s / 60;
  return Number.isInteger(min) ? `${min}'` : `${min.toFixed(1)}'`;
}

function formatDistance(m: number): string {
  if (m >= 1000) {
    const km = m / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  }
  return `${m} m`;
}

function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  defaultValue,
  formatValue,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step: number;
  min?: number | undefined;
  max?: number | undefined;
  defaultValue?: number | undefined;
  formatValue?: ((v: number) => string) | undefined;
}) {
  const display = value == null ? '—' : formatValue ? formatValue(value) : String(value);
  const atMin = value != null && min != null && value <= min;
  const atMax = value != null && max != null && value >= max;

  const dec = () => {
    if (value == null) return;
    const next = value - step;
    if (min != null && next < min) {
      if (min === 0) onChange(null);
      return;
    }
    onChange(next);
  };

  const inc = () => {
    if (value == null) {
      onChange(defaultValue ?? min ?? step);
      return;
    }
    const next = value + step;
    if (max != null && next > max) return;
    onChange(next);
  };

  return (
    <div className="mt-1 flex items-center overflow-hidden rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)]">
      <button
        type="button"
        onClick={dec}
        disabled={atMin && min !== 0}
        aria-label="Disminuir"
        className="flex h-9 w-9 items-center justify-center text-base text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)] disabled:opacity-30"
      >
        −
      </button>
      <div className="flex-1 px-2 text-center text-sm tabular-nums text-[color:var(--fg)]">{display}</div>
      <button
        type="button"
        onClick={inc}
        disabled={atMax}
        aria-label="Aumentar"
        className="flex h-9 w-9 items-center justify-center text-base text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)] disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

function PresetChips({
  value,
  presets,
  onChange,
  formatValue,
}: {
  value: number | null;
  presets: number[];
  onChange: (v: number | null) => void;
  formatValue?: ((v: number) => string) | undefined;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {presets.map((p) => {
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(active ? null : p)}
            className={cn(
              'rounded-[var(--r-pill)] border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors',
              active
                ? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--on-primary-container)]'
                : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] text-[color:var(--text-muted)] hover:border-[color:var(--accent)] hover:text-[color:var(--fg)]',
            )}
          >
            {formatValue ? formatValue(p) : String(p)}
          </button>
        );
      })}
    </div>
  );
}

function PresetStepper({
  label,
  value,
  onChange,
  presets,
  step,
  min,
  max,
  formatValue,
  className,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  presets: number[];
  step: number;
  min?: number;
  max?: number;
  formatValue?: (v: number) => string;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel>{label}</FieldLabel>
      <PresetChips value={value} presets={presets} onChange={onChange} formatValue={formatValue} />
      <Stepper
        value={value}
        onChange={onChange}
        step={step}
        min={min}
        max={max}
        defaultValue={presets[0]}
        formatValue={formatValue}
      />
    </div>
  );
}

function IntegerStepper({
  label,
  value,
  onChange,
  min,
  max,
  className,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel>{label}</FieldLabel>
      <Stepper value={value} onChange={onChange} step={1} min={min} max={max} defaultValue={min ?? 1} />
    </div>
  );
}

function RpeScale({
  value,
  onChange,
  className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel>RPE objetivo</FieldLabel>
      <div className="mt-1 grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(active ? null : n)}
              aria-label={`RPE ${n}`}
              className={cn(
                'flex h-8 items-center justify-center rounded-[var(--r-sm)] border text-xs font-bold tabular-nums transition-colors',
                active
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--on-primary-container)]'
                  : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] text-[color:var(--text-muted)] hover:border-[color:var(--accent)] hover:text-[color:var(--fg)]',
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '—';
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${sec.toString().padStart(2, '0')} /km`;
}

// HR zone tones reference the --hr-zone-* DS tokens (single source,
// converged to iOS ZoneColors). Text uses the full zone color; the
// resting border is a 40% mix toward transparent, brightening to the
// solid zone color on hover.
const HR_ZONES: { value: number; label: string; tone: string }[] = [
  {
    value: 1,
    label: 'Z1',
    tone: 'text-[color:var(--hr-zone-1)] border-[color:color-mix(in_srgb,var(--hr-zone-1)_40%,transparent)] hover:border-[color:var(--hr-zone-1)]',
  },
  {
    value: 2,
    label: 'Z2',
    tone: 'text-[color:var(--hr-zone-2)] border-[color:color-mix(in_srgb,var(--hr-zone-2)_40%,transparent)] hover:border-[color:var(--hr-zone-2)]',
  },
  {
    value: 3,
    label: 'Z3',
    tone: 'text-[color:var(--hr-zone-3)] border-[color:color-mix(in_srgb,var(--hr-zone-3)_40%,transparent)] hover:border-[color:var(--hr-zone-3)]',
  },
  {
    value: 4,
    label: 'Z4',
    tone: 'text-[color:var(--hr-zone-4)] border-[color:color-mix(in_srgb,var(--hr-zone-4)_40%,transparent)] hover:border-[color:var(--hr-zone-4)]',
  },
  {
    value: 5,
    label: 'Z5',
    tone: 'text-[color:var(--hr-zone-5)] border-[color:color-mix(in_srgb,var(--hr-zone-5)_40%,transparent)] hover:border-[color:var(--hr-zone-5)]',
  },
];

function HrZoneChips({
  value,
  onChange,
  className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel>Zona HR</FieldLabel>
      <div className="mt-1 grid grid-cols-5 gap-1">
        {HR_ZONES.map((z) => {
          const active = value === z.value;
          return (
            <button
              key={z.value}
              type="button"
              onClick={() => onChange(active ? null : z.value)}
              aria-label={`Zona HR ${z.label}`}
              aria-pressed={active}
              className={cn(
                'focus-ring flex h-9 items-center justify-center rounded-[var(--r-sm)] border text-xs font-bold tabular-nums transition-colors',
                active
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--on-primary-container)]'
                  : cn(
                      'bg-[color:var(--surface-container-lowest)]',
                      z.tone,
                    ),
              )}
            >
              {z.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
