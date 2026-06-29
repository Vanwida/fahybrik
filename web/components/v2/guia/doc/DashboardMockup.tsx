// DashboardMockup — a faithful frame of the coach dashboard (web V2), in the REAL
// dark app palette. Browser chrome (traffic lights + url bar) + a body the section
// fills with the `.guia-win` classes from guia.css (.cal, .md, .sesstbl…). The
// frame forces `.v2-root[data-theme="dark"]` so it reads the live v2 tokens.
// Server-safe (pure presentation).

import type { ReactNode } from 'react';

export function DashboardMockup({
  url,
  children,
}: {
  /** Fake address-bar text, e.g. "tu-panel / microciclos / acumulación". */
  url: string;
  /** The window body content. */
  children: ReactNode;
}) {
  return (
    <div className="v2-root guia-win" data-theme="dark">
      <div className="win-bar">
        <div className="tl">
          <i />
          <i />
          <i />
        </div>
        <span className="win-url">{url}</span>
      </div>
      <div className="win-body">{children}</div>
    </div>
  );
}
