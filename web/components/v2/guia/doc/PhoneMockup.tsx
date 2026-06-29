// PhoneMockup — a faithful frame of the athlete iOS app, in the REAL dark app
// palette. The frame forces a `.v2-root[data-theme="dark"]` wrapper so every
// surface/accent/modality hue resolves from the live v2 tokens (never drifts from
// the product). Sections compose the screen with the `.guia-phone` classes from
// guia.css (.hero, .tile, .day, .tabbar…). Server-safe (pure presentation).

import type { ReactNode } from 'react';

export function PhoneMockup({
  caption,
  children,
}: {
  /** Optional caption rendered under the device. */
  caption?: ReactNode;
  /** The screen content (notch is added automatically). */
  children: ReactNode;
}) {
  return (
    <figure className="guia-phone-wrap">
      <div className="v2-root guia-phone" data-theme="dark">
        <div className="scr">
          <div className="notch" />
          {children}
        </div>
      </div>
      {caption ? <figcaption className="guia-phone-cap">{caption}</figcaption> : null}
    </figure>
  );
}
