'use client';

// «Afecta a varios»: las causas compartidas, una fila y una acción cada una. En
// el móvil se recogen en UNA línea («4 cosas afectan a varios ▾») para que las
// primeras personas queden a la vista sin desplazar; en escritorio, abiertas.

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { SystemicGroup } from '@/lib/dashboard/hoy/hoy-types';
import type { HoyPerson } from '@/app/[locale]/(v2)/hoy/_data/hoy-extras';
import { Button, List, SectionHeader } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { SystemicRow } from './SystemicRow';

export interface SystemicSectionProps {
  groups: ReadonlyArray<SystemicGroup>;
  peopleOf: (g: SystemicGroup) => HoyPerson[];
  negocio: boolean;
  onPublish: (g: SystemicGroup) => void;
  onAssign: (g: SystemicGroup) => void;
  onRemind: (g: SystemicGroup) => void;
  onOpenAthlete: (p: HoyPerson) => void;
  queueHrefOf: (g: SystemicGroup) => string | null;
}

/** «4 cosas afectan a varios» / «1 cosa afecta a varios». */
export function systemicSummary(n: number): string {
  return n === 1 ? '1 cosa afecta a varios' : `${n} cosas afectan a varios`;
}

export function SystemicSection({
  groups,
  peopleOf,
  negocio,
  onPublish,
  onAssign,
  onRemind,
  onOpenAthlete,
  queueHrefOf,
}: SystemicSectionProps) {
  const [open, setOpen] = useState(false);
  if (groups.length === 0) return null;

  return (
    <section className="flex flex-col gap-2" aria-labelledby="hoy-varios">
      <SectionHeader id="hoy-varios" title="Afecta a varios" count={groups.length} className="max-sm:hidden" />
      <Button
        variant="secondary"
        size="lg"
        iconEnd={open ? ChevronUp : ChevronDown}
        aria-expanded={open}
        aria-controls="hoy-varios-lista"
        onClick={() => setOpen((o) => !o)}
        className="w-full justify-between sm:hidden"
      >
        {systemicSummary(groups.length)}
      </Button>
      <div id="hoy-varios-lista" className={cn(!open && 'max-sm:hidden')}>
        <List aria-label="Afecta a varios" className="@container">
          {groups.map((g) => (
            <SystemicRow
              key={`${g.kind}:${g.week_start ?? ''}`}
              group={g}
              people={peopleOf(g)}
              negocio={negocio}
              onPublish={() => onPublish(g)}
              onAssign={() => onAssign(g)}
              onRemind={() => onRemind(g)}
              onOpenAthlete={onOpenAthlete}
              queueHref={queueHrefOf(g)}
            />
          ))}
        </List>
      </div>
    </section>
  );
}
