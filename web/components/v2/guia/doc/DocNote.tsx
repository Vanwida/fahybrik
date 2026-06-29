// DocNote — a callout box. Three intents:
//   · cue (orange) — a tip / how-to detail.
//   · log (green)  — an honest note / "good to know".
//   · bad (red)    — a guardrail / what NOT to do (the honest-save gate, etc.).
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
