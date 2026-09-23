// DocNote — una nota dentro del artículo. Tres intenciones:
//   · cue — un truco o un detalle de cómo se hace.
//   · log — «bueno saberlo», una nota honesta.
//   · bad — un límite o lo que NO hacer (en ámbar: aviso, no error).
// Children carry the body (a <ul> or <p>). Server-safe.

import type { ReactNode } from 'react';

export type DocNoteVariant = 'cue' | 'log' | 'bad';

const ICON: Record<DocNoteVariant, string> = {
  cue: '↳',
  log: 'i',
  bad: '!',
};

export function DocNote({
  variant,
  title,
  children,
}: {
  variant: DocNoteVariant;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={`note ${variant}`}>
      <div className="h">
        <span className="ic">{ICON[variant]}</span> {title}
      </div>
      {children}
    </div>
  );
}
