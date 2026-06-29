// QCWTriad — the "Qué / Cómo / Por qué" three-card explainer used to frame each
// section at a glance (Alex wants it glanceable, not walls of text). Server-safe.

import type { ReactNode } from 'react';

export function QCWTriad({
  que,
  como,
  porque,
}: {
  /** What this is. */
  que: ReactNode;
  /** How the coach does it. */
  como: ReactNode;
  /** Why it matters. */
  porque: ReactNode;
}) {
  return (
    <div className="triad">
      <div className="qc q">
        <div className="h">
          <span className="ic">?</span>Qué
        </div>
        <p>{que}</p>
      </div>
      <div className="qc c">
        <div className="h">
          <span className="ic">↳</span>Cómo
        </div>
        <p>{como}</p>
      </div>
      <div className="qc w">
        <div className="h">
          <span className="ic">✓</span>Por qué
        </div>
        <p>{porque}</p>
      </div>
    </div>
  );
}
