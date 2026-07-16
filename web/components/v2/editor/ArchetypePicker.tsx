'use client';

// Las TARJETAS de tipo de bloque (icono + nombre, sin descripciones): el
// vocabulario de sesión del deporte. Picar una crea un bloque PRE-SEMBRADO con la
// modalidad/medida/objetivo/esquema de ese tipo — un formulario listo, nunca
// toggles vacíos. Agnóstico al método: el tipo de bloque es un hecho del deporte,
// jamás un concepto de fase/metodología.
//
// Aquí vivía además un modal `ArchetypePicker` que envolvía esta rejilla, pero no
// lo renderizaba NADIE: el selector de tipo entra por AddBlockModal (modal) y por
// el picker inline de SessionPartCard, y los dos montan la rejilla directamente.

import { MIcon } from '@/components/ui/MIcon';
import { ARCHETYPES, type Archetype, type ArchetypeId } from '@/lib/dashboard/v2/archetypes';

/** The block-type cards (icon + name, no descriptions) — reused by the inline
 *  picker AND the AddBlockModal type chooser. */
export function ArchetypeGrid({ onPick }: { onPick: (id: ArchetypeId) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {ARCHETYPES.map((a) => (
        <ArchetypeCard key={a.id} archetype={a} onPick={() => onPick(a.id)} />
      ))}
    </div>
  );
}

function ArchetypeCard({
  archetype,
  onPick,
}: {
  archetype: Archetype;
  onPick: () => void;
}) {
  const { name, icon, modalitySlug } = archetype;
  return (
    <button
      type="button"
      onClick={onPick}
      className="v2-focus group flex items-center gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3 text-left transition-colors hover:border-[color:var(--v2-border-strong)]"
    >
      <span
        aria-hidden
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--v2-r-s)]"
        style={{
          background: `var(--v2-mod-${modalitySlug}-soft)`,
          color: `var(--v2-mod-${modalitySlug})`,
        }}
      >
        <MIcon name={icon} size={20} />
      </span>
      <span className="text-sm font-bold leading-tight text-[color:var(--v2-fg)]">{name}</span>
    </button>
  );
}
