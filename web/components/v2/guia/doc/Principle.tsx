// Principle — the inverted (always-dark) north-star block: a short, quotable idea
// that anchors a section. Server-safe.

import type { ReactNode } from 'react';

export function Principle({ children }: { children: ReactNode }) {
  return <div className="principle">{children}</div>;
}
