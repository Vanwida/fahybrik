'use client';

// v2 · INTAKE · ESTRUCTURA DEL BLOQUE — el paso 3 del alta, donde se decide DE
// QUÉ nace el plan del atleta. Son dos caminos con el mismo peso visual:
//
//   · «Seguir la periodización» (defecto) — la secuencia propuesta a partir de
//     su clasificación. El coach ajusta semanas y el alta materializa un
//     microciclo de su BIBLIOTECA, que es lo que hacía el alta antes.
//   · «Plan solo para él» — la MISMA lista, ahora editable entera: renombrar,
//     añadir, quitar y cambiar semanas. Al asignar, cada tramo se crea como un
//     microciclo PERSONAL de este atleta, sin pasar por la biblioteca.
//
// AGNÓSTICO: los nombres los pone el coach y por defecto son ordinales neutros
// (`defaultTramoName`). Aquí no se cablea ninguna escuela de periodización: el
// ORDEN de los microciclos ES la periodización.

import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { Panel } from '@/components/v2/atleta-detalle/parts';
import type { BlockEmphasis } from '@/lib/coach/intake-suggestions';
import {
  INTAKE_TRAMOS_MAX,
  INTAKE_TRAMO_NAME_MAX,
  INTAKE_WEEKS_MAX,
  INTAKE_WEEKS_MIN,
  type IntakeBlockSpec,
  type IntakePlanMode,
} from '@fahybrid/shared/schema/coach-intake';
import { cn } from '@/lib/utils';

const EMPHASIS_LABEL: Record<BlockEmphasis['bias'], string> = {
  running: 'Carrera',
  strength: 'Fuerza',
  hyrox_specific: 'HYROX específico',
  balanced: 'Equilibrado',
};

const MODE_OPTIONS: Array<{ mode: IntakePlanMode; icon: string; title: string; detail: string }> = [
  {
    mode: 'shared',
    icon: 'stacks',
    title: 'Seguir la periodización',
    detail: 'Arranca con lo que ya tienes montado. Ajusta las semanas si hace falta.',
  },
  {
    mode: 'personal',
    icon: 'person_edit',
    title: 'Plan solo para él',
    detail: 'Le montas su propia cadena de microciclos. No toca tu biblioteca.',
  },
];

function fmtEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(d)
    .replace(/\.$/, '');
}

export function BlockStructureStep({
  mode,
  specs,
  emphasis,
  endDateIso,
  onChangeMode,
  onChangeWeeks,
  onRenameTramo,
  onAddTramo,
  onRemoveTramo,
}: {
  mode: IntakePlanMode;
  specs: IntakeBlockSpec[];
  emphasis: BlockEmphasis;
  endDateIso: string | null;
  onChangeMode: (mode: IntakePlanMode) => void;
  onChangeWeeks: (index: number, weeks: number) => void;
  onRenameTramo: (index: number, name: string) => void;
  onAddTramo: () => void;
  onRemoveTramo: (index: number) => void;
}) {
  const editable = mode === 'personal';
  const totalWeeks = specs.reduce((s, b) => s + b.weeks, 0);
  const canAdd = specs.length < INTAKE_TRAMOS_MAX;
  const canRemove = specs.length > 1;

  return (
    <Panel
      title="Estructura del bloque"
      action={
        <Pill tone="neutral" variant="soft">
          <span className="v2-num">{totalWeeks}</span>&nbsp;sem
        </Pill>
      }
      bodyClassName="flex flex-col gap-3"
    >
      <div role="radiogroup" aria-label="De qué nace el plan" className="grid gap-2 sm:grid-cols-2">
        {MODE_OPTIONS.map((opt) => (
          <ModeOption
            key={opt.mode}
            icon={opt.icon}
            title={opt.title}
            detail={opt.detail}
            selected={mode === opt.mode}
            onSelect={() => onChangeMode(opt.mode)}
          />
        ))}
      </div>

      <p className="text-xs text-[color:var(--v2-muted)]">
        {editable
          ? 'Su cadena de microciclos, en orden.'
          : 'Secuencia de microciclos hasta el evento.'}
        {endDateIso ? ` Termina ${fmtEventDate(endDateIso)}.` : ''}
      </p>

      <ul className="flex flex-col gap-1.5">
        {specs.map((spec, i) => (
          <li
            key={`tramo-${i}`}
            className="flex items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2"
          >
            {editable ? (
              <input
                type="text"
                value={spec.type}
                maxLength={INTAKE_TRAMO_NAME_MAX}
                aria-label={`Nombre del microciclo ${i + 1}`}
                onChange={(e) => onRenameTramo(i, e.target.value)}
                className="v2-focus min-w-0 flex-1 rounded-[var(--v2-r-2xs)] border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] hover:border-[color:var(--v2-border)] focus:border-[color:var(--v2-border-strong)]"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[color:var(--v2-fg)]">
                {spec.type}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              <StepperButton
                icon="remove"
                label={`Reducir semanas de ${spec.type}`}
                disabled={spec.weeks <= INTAKE_WEEKS_MIN}
                onClick={() => onChangeWeeks(i, spec.weeks - 1)}
              />
              <span className="v2-num w-10 text-center text-sm font-semibold text-[color:var(--v2-fg)]">
                {spec.weeks} <span className="text-[color:var(--v2-faint)]">sem</span>
              </span>
              <StepperButton
                icon="add"
                label={`Añadir semanas a ${spec.type}`}
                disabled={spec.weeks >= INTAKE_WEEKS_MAX}
                onClick={() => onChangeWeeks(i, spec.weeks + 1)}
              />
              {editable ? (
                <StepperButton
                  icon="close"
                  label={`Quitar ${spec.type}`}
                  disabled={!canRemove}
                  onClick={() => onRemoveTramo(i)}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {editable ? (
        <button
          type="button"
          disabled={!canAdd}
          onClick={onAddTramo}
          className={cn(
            'v2-focus inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border-strong)] text-sm font-semibold transition-colors',
            canAdd
              ? 'text-[color:var(--v2-muted)] hover:border-[color:var(--v2-accent)] hover:text-[color:var(--v2-fg)]'
              : 'cursor-not-allowed text-[color:var(--v2-faint)] opacity-60',
          )}
        >
          <MIcon name="add" size={16} />
          {canAdd ? 'Añadir microciclo' : `Máximo ${INTAKE_TRAMOS_MAX} microciclos`}
        </button>
      ) : null}

      <p className="flex items-start gap-1.5 text-label text-[color:var(--v2-faint)]">
        <MIcon name="lightbulb" size={13} className="mt-px" />
        <span>
          Énfasis sugerido · {EMPHASIS_LABEL[emphasis.bias]} · {emphasis.note}
        </span>
      </p>
    </Panel>
  );
}

function ModeOption({
  icon,
  title,
  detail,
  selected,
  onSelect,
}: {
  icon: string;
  title: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'v2-focus flex flex-col gap-1 rounded-[var(--v2-r-s)] border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-surface-2)]'
          : 'border-[color:var(--v2-border)] hover:border-[color:var(--v2-border-strong)]',
      )}
    >
      <span className="flex items-center gap-1.5">
        <MIcon
          name={icon}
          size={16}
          className={selected ? 'text-[color:var(--v2-accent)]' : 'text-[color:var(--v2-muted)]'}
        />
        <span className="text-sm font-semibold text-[color:var(--v2-fg)]">{title}</span>
        {selected ? (
          <MIcon name="check_circle" size={14} className="ml-auto text-[color:var(--v2-accent)]" />
        ) : null}
      </span>
      <span className="text-label text-[color:var(--v2-muted)]">{detail}</span>
    </button>
  );
}

function StepperButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="v2-focus inline-flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <MIcon name={icon} size={15} />
    </button>
  );
}
