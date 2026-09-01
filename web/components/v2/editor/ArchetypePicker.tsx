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
  // Container queries, NO breakpoints de viewport: esta rejilla se monta tanto en
  // el modal ancho del editor de día como en el panel lateral estrecho de Tests, y
  // con `sm:`/`lg:` (que miran la VENTANA) el panel estrecho salía a tres columnas
  // en una pantalla grande y partía los nombres («Carrer contin / Z2»). Con
  // `@container` se mide el hueco real que tiene, que es lo que importa.
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-2 @2xl:grid-cols-3">
        {ARCHETYPES.map((a) => (
          <ArchetypeCard key={a.id} archetype={a} onPick={() => onPick(a.id)} />
        ))}
      </div>
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
      className="v2-focus group flex min-w-0 items-center gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3 text-left transition-colors hover:border-[color:var(--v2-border-strong)]"
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
      <span className="min-w-0 text-sm font-bold leading-tight text-[color:var(--v2-fg)]">
        {name}
      </span>
    </button>
  );
}
