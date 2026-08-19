'use client';

// v2 · INTAKE · DE QUÉ NACE EL PLAN — el paso 3 del alta. Solo la elección:
//
//   · «Seguir la periodización» (defecto) — el alta materializa un microciclo
//     de la BIBLIOTECA. El esqueleto ya está en la periodización del coach.
//   · «Plan solo para él» — no toca la biblioteca. El esqueleto nace cuando
//     el coach planifica en la ficha, no se inventa aquí.
//
// No hay lista de microciclos en este paso: marcarlos antes de planificar
// era mentir (nombres y semanas que nadie había escrito).

import { MIcon } from '@/components/ui/MIcon';
import { Panel } from '@/components/v2/atleta-detalle/parts';
import type { IntakePlanMode } from '@fahybrid/shared/schema/coach-intake';
import { cn } from '@/lib/utils';

const MODE_OPTIONS: Array<{ mode: IntakePlanMode; icon: string; title: string; detail: string }> = [
  {
    mode: 'shared',
    icon: 'stacks',
    title: 'Seguir la periodización',
    detail: 'Arranca con lo que ya tienes montado.',
  },
  {
    mode: 'personal',
    icon: 'person_edit',
    title: 'Plan solo para él',
    detail: 'Le montas el plan desde su ficha. No toca tu biblioteca.',
  },
];

export function BlockStructureStep({
  mode,
  onChangeMode,
}: {
  mode: IntakePlanMode;
  onChangeMode: (mode: IntakePlanMode) => void;
}) {
  return (
    <Panel title="De qué nace el plan" bodyClassName="flex flex-col gap-3">
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
        'v2-focus flex flex-col gap-1 rounded-[var(--v2-r-m)] border px-3 py-2.5 text-left transition-colors',
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
