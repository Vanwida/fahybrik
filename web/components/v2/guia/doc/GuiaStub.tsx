// GuiaStub — the body a not-yet-written section renders. The DocSection heading
// (eyebrow + title + lead) is already shown by the page, so this is just an honest
// "coming next" panel. A phase-2 section agent replaces this with real content +
// the section's own MovilBand. Server-safe.

import { MIcon } from '@/components/ui/MIcon';

export function GuiaStub() {
  return (
    <div className="guia-stub">
      <span className="ic">
        <MIcon name="edit_note" size={26} />
      </span>
      <p className="st">Sección en preparación</p>
      <p className="sd">
        Esta sección de la guía se está escribiendo. Tendrá el mismo formato que las que ya están
        listas: qué es, cómo se hace y, donde aplique, cómo lo ve tu atleta en su móvil.
      </p>
    </div>
  );
}
