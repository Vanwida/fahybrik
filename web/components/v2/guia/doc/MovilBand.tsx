// MovilBand — the orange "En el móvil del atleta" bridge band. It is the recurring
// device of the whole guide: after the coach learns to do X on the panel, this
// band shows EXACTLY how it lands on the athlete's phone. Hosts one or more
// <PhoneMockup> children in a centered grid. Server-safe.

import type { ReactNode } from 'react';

export function MovilBand({
  title,
  subtitle,
  children,
}: {
  /** Headline next to the orange chip, e.g. "Así lo ve tu atleta". */
  title: string;
  /** One-line explanation under the headline. */
  subtitle?: ReactNode;
  /** The <PhoneMockup> phones to show. Omit for the explanatory band (section 01). */
  children?: ReactNode;
}) {
  return (
    <div className="movil-band">
      <div className="mb-head">
        <span className="mb-chip">En el móvil del atleta</span>
        <span className="t">{title}</span>
      </div>
      {subtitle ? <p className="mb-sub">{subtitle}</p> : null}
      {children ? <div className="guia-phones">{children}</div> : null}
    </div>
  );
}
