'use client';

// Densidad «Tarjetas» (secundaria; la tabla es la de serie): las mismas filas en
// tarjetas compactas, cada dato con su etiqueta — nada de barras sin nombre ni
// puntos de color sueltos. Se seleccionan igual que las filas (casilla).

import { Link } from '@/i18n/navigation';
import type { RosterRow } from '@/lib/dashboard/athletes/roster';
import { Checkbox } from '@/components/v2/ui';
import { AdherenceMini } from '@/components/v2/shared/AdherenceMini';
import { ReadinessMini } from '@/components/v2/shared/ReadinessMini';
import { cn } from '@/lib/utils';
import { AthleteCell, NextSessionCell, RaceCell, StatusCell, WeekChip } from './cells';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="t-meta text-v2-faint">{label}</span>
      <span className="flex min-h-5 min-w-0 items-center">{children}</span>
    </div>
  );
}

export function AthleteCards({
  rows,
  today,
  selection,
  onSelectionChange,
  activeId,
  onOpen,
  hrefFor,
}: {
  rows: RosterRow[];
  today: string;
  selection: string[];
  onSelectionChange: (ids: string[]) => void;
  activeId: string | null;
  onOpen: (row: RosterRow) => void;
  hrefFor: (row: RosterRow) => string;
}) {
  const selected = new Set(selection);
  const toggle = (id: string, on: boolean) =>
    onSelectionChange(on ? [...selection, id] : selection.filter((s) => s !== id));

  return (
    <ul aria-label="Atletas" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => {
        const isSel = selected.has(r.athlete_id);
        return (
          <li
            key={r.athlete_id}
            className={cn(
              'relative flex flex-col gap-3 rounded-panel border bg-v2-surface p-3',
              isSel ? 'border-v2-border-strong bg-v2-select' : 'border-v2-border hover:border-v2-border-strong',
              r.athlete_id === activeId && 'shadow-[inset_2px_0_0_var(--v2-select-bar)]',
            )}
          >
            <div className="flex items-center gap-2.5">
              <Checkbox
                aria-label={`Seleccionar a ${r.name}`}
                checked={isSel}
                onCheckedChange={(on) => toggle(r.athlete_id, on)}
                className="relative z-[1]"
              />
              {/* Clic = vistazo; ⌘/Ctrl-clic o botón central = ficha en otra pestaña. */}
              <Link
                href={hrefFor(r)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  onOpen(r);
                }}
                className="min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 after:rounded-panel after:content-[''] focus-visible:after:shadow-[inset_0_0_0_2px_var(--v2-accent)]"
              >
                <AthleteCell row={r} />
              </Link>
              <WeekChip week={r.week_visibility} nextStart={r.next_start} />
            </div>
            <StatusCell row={r} />
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Fact label="Readiness 14 d">
                <ReadinessMini readiness={r.readiness} today={today} />
              </Fact>
              <Fact label="Adherencia 14 d">
                <AdherenceMini adherence={r.adherence_14d} width={44} />
              </Fact>
              <Fact label="Próximo">
                <NextSessionCell row={r} today={today} />
              </Fact>
              <Fact label="Carrera">
                <RaceCell row={r} />
              </Fact>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
