// A "A · B" trust line whose segments never break mid-phrase. Each segment between the
// middot separators is wrapped in a nowrap span, so on narrow screens (390) the only
// wrap opportunity is AT the separator — "Disponible en iOS" / "sin compromiso" stay
// intact instead of splitting awkwardly. Server component; used by Hero + FinalCta.

import { Fragment } from 'react';

const SEPARATOR = ' · ';

export function TrustLine({ text, className }: { text: string; className?: string }) {
  const segments = text.split(SEPARATOR);
  return (
    <p className={className}>
      {segments.map((segment, i) => (
        <Fragment key={i}>
          {i > 0 ? SEPARATOR : null}
          <span className="whitespace-nowrap">{segment}</span>
        </Fragment>
      ))}
    </p>
  );
}
