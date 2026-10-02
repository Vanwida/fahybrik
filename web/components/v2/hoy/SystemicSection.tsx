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
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  if (groups.length === 0) return null;

  const sections = [
    { id: 'hoy-varios', title: 'Afecta a varios', groups: groups.filter((g) => g.athlete_ids.length >= 2) },
    { id: 'hoy-negocio', title: 'Negocio', groups: groups.filter((g) => g.athlete_ids.length === 0) },
    { id: 'hoy-individual', title: 'Pendiente', groups: groups.filter((g) => g.athlete_ids.length === 1) },
  ].filter((s) => s.groups.length > 0);
  return (
    <div className="flex flex-col gap-4">
    {sections.map((section) => <section key={section.id} className="flex flex-col gap-2" aria-labelledby={section.id}>
      <SectionHeader id={section.id} title={section.title} count={section.groups.length} className="max-sm:hidden" />
      <Button
        variant="secondary"
        size="lg"
        iconEnd={open.has(section.id) ? ChevronUp : ChevronDown}
        aria-expanded={open.has(section.id)}
        aria-controls={`${section.id}-lista`}
        onClick={() => setOpen((previous) => {
          const next = new Set(previous);
          if (next.has(section.id)) next.delete(section.id);
          else next.add(section.id);
          return next;
        })}
        className="w-full justify-between sm:hidden"
      >
        {section.id === 'hoy-varios' ? systemicSummary(section.groups.length) : `${section.title} (${section.groups.length})`}
      </Button>
      <div id={`${section.id}-lista`} className={cn(!open.has(section.id) && 'max-sm:hidden')}>
        <List aria-label={section.title} className="@container">
          {section.groups.map((g) => (
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
    </section>)}
    </div>
  );
}
