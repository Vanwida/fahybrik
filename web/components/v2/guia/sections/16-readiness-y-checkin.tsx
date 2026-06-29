// GUÍA · 16 Readiness y check-in — área "Seguimiento". STUB for phase 2.
// Replace <GuiaStub/> with the real body: QCWTriad + prose, and where it applies a
// <MovilBand> with <PhoneMockup> phones (the doc kit is in '../doc'; canonical
// modality hues are var(--v2-mod-*)). Keep the DocSection heading.

import { DocSection, GuiaStub } from '../doc';
import type { GuiaSection } from '../config';

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection area={meta.area} num={meta.num} title={meta.title} lead={meta.blurb}>
      <GuiaStub />
    </DocSection>
  );
}
