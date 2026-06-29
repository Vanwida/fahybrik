// DocSection — the heading block every guide section opens with: a numbered
// eyebrow (área label + nº), the italic-black display title, and a lead. Children
// render the section body below. Reads the área label from the single config so
// the eyebrow can never disagree with the sidebar. Server-safe.

import type { ReactNode } from 'react';
import { guiaAreaLabel, type GuiaAreaId } from '../config';

export function DocSection({
  area,
  num,
  title,
  lead,
  children,
}: {
  area: GuiaAreaId;
  /** Section number (01…19), shown in the eyebrow. */
  num: number;
  title: string;
  /** Intro paragraph (can carry inline markup). */
  lead?: ReactNode;
  children?: ReactNode;
}) {
  const nn = String(num).padStart(2, '0');
  return (
    <section>
      <div className="seclbl">
        <span className="pin">{nn} ·</span>
        {guiaAreaLabel(area)}
      </div>
      <h2>{title}</h2>
      {lead ? <p className="lead">{lead}</p> : null}
      {children}
    </section>
  );
}
