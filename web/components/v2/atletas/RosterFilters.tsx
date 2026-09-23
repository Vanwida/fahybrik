'use client';

// Filtros de Atletas: Estado · Nivel (con el nombre del eje del coach) · Grupo ·
// Semana · Carrera. En escritorio, un botón por filtro con su lista de casillas;
// en el móvil, todos en un panel. El estado vive en la URL (roster-query.ts):
// este componente solo lee y propone el siguiente.

import { useMemo, useState } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import type { RosterRow } from '@/lib/dashboard/athletes/roster';
import { Button, Checkbox, Popover, Sheet } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import type { CoachLevel } from './load-atletas';
import {
  NONE,
  RACE_WINDOWS,
  STATUS_KEYS,
  STATUS_LABEL,
  WEEK_KEYS,
  WEEK_LABEL,
  type RosterFilter,
} from './roster-query';

interface Option {
  value: string;
  label: string;
  count: number;
}

interface Facet {
  key: 'estado' | 'nivel' | 'grupo' | 'semana' | 'carrera';
  label: string;
  options: Option[];
  /** Una sola opción a la vez (Carrera). */
  single?: boolean;
  selected: string[];
}

function countBy(rows: readonly RosterRow[], key: (r: RosterRow) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return m;
}

export function useFacets(
  rows: readonly RosterRow[],
  filter: RosterFilter,
  levels: readonly CoachLevel[],
  axisLabel: string,
): Facet[] {
  return useMemo(() => {
    const byStatus = countBy(rows, (r) => r.status.key);
    const byLevel = countBy(rows, (r) => r.level?.id ?? NONE);
    const byGroup = countBy(rows, (r) => r.group?.id ?? NONE);
    const byWeek = countBy(rows, (r) => r.week_visibility);
    const groups = new Map<string, string>();
    for (const r of rows) if (r.group) groups.set(r.group.id, r.group.name);
    const withRace = (days: number) => rows.filter((r) => r.race && r.race.days >= 0 && r.race.days <= days).length;
    return [
      {
        key: 'estado',
        label: 'Estado',
        options: STATUS_KEYS.map((k) => ({ value: k, label: STATUS_LABEL[k], count: byStatus.get(k) ?? 0 })),
        selected: filter.estado ?? [],
      },
      {
        key: 'nivel',
        label: axisLabel,
        options: [
          ...levels.map((l) => ({
            value: l.id,
            label: l.label && l.label !== l.name ? `${l.name} · ${l.label}` : l.name,
            count: byLevel.get(l.id) ?? 0,
          })),
          { value: NONE, label: `Sin ${axisLabel.toLocaleLowerCase('es')}`, count: byLevel.get(NONE) ?? 0 },
        ].filter((o) => o.value !== NONE || o.count > 0 || filter.nivel?.includes(NONE)),
        selected: filter.nivel ?? [],
      },
      {
        key: 'grupo',
        label: 'Grupo',
        options: [
          ...[...groups.entries()]
            .sort((a, b) => a[1].localeCompare(b[1], 'es'))
            .map(([id, name]) => ({ value: id, label: name, count: byGroup.get(id) ?? 0 })),
          { value: NONE, label: 'Sin grupo', count: byGroup.get(NONE) ?? 0 },
        ].filter((o) => o.value !== NONE || o.count > 0 || filter.grupo?.includes(NONE)),
        selected: filter.grupo ?? [],
      },
      {
        key: 'semana',
        label: 'Semana',
        options: WEEK_KEYS.map((k) => ({ value: k, label: WEEK_LABEL[k], count: byWeek.get(k) ?? 0 })),
        selected: filter.semana ?? [],
      },
      {
        key: 'carrera',
        label: 'Carrera',
        single: true,
        options: RACE_WINDOWS.map((d) => ({ value: String(d), label: `En menos de ${d} días`, count: withRace(d) })),
        selected: filter.carrera != null ? [String(filter.carrera)] : [],
      },
    ];
  }, [rows, filter, levels, axisLabel]);
}

/** El siguiente filtro tras cambiar una faceta. */
export function withFacet(filter: RosterFilter, key: Facet['key'], values: string[]): RosterFilter {
  const v = values.length > 0 ? values : null;
  switch (key) {
    case 'estado':
      // Elegir estados a mano sustituye a «te necesita» (la vista de serie).
      return { ...filter, atencion: false, estado: v as RosterFilter['estado'] };
    case 'nivel':
      return { ...filter, nivel: v };
    case 'grupo':
      return { ...filter, grupo: v };
    case 'semana':
      return { ...filter, semana: v as RosterFilter['semana'] };
    case 'carrera':
      return { ...filter, carrera: v ? Number(v[0]) : null };
  }
}

function summary(f: Facet): string | null {
  if (f.selected.length === 0) return null;
  const labels = f.options.filter((o) => f.selected.includes(o.value)).map((o) => o.label.split(' · ')[0]);
  if (f.key === 'carrera') return `< ${f.selected[0]} d`;
  return labels.length <= 2 ? labels.join(', ') : `${labels.length}`;
}

function OptionList({ facet, onChange }: { facet: Facet; onChange: (values: string[]) => void }) {
  return (
    <div role="group" aria-label={facet.label} className="flex flex-col gap-0.5">
      {facet.options.map((o) => {
        const on = facet.selected.includes(o.value);
        return (
          <div key={o.value} className="flex min-h-8 items-center justify-between gap-3 rounded-ctl px-1 hover:bg-v2-hover pointer-coarse:min-h-11">
            <Checkbox
              checked={on}
              label={<span className="t-body-sm">{o.label}</span>}
              onCheckedChange={(next) =>
                onChange(
                  facet.single
                    ? next
                      ? [o.value]
                      : []
                    : next
                      ? [...facet.selected, o.value]
                      : facet.selected.filter((s) => s !== o.value),
                )
              }
              className="min-w-0 flex-1 py-1"
            />
            <span className="t-meta text-v2-faint t-tnum">{o.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function FacetButton({ facet, onChange }: { facet: Facet; onChange: (values: string[]) => void }) {
  const s = summary(facet);
  return (
    <Popover
      title={facet.label}
      className="w-64"
      trigger={
        <Button size="md" variant={s ? 'secondary' : 'ghost'} iconEnd={ChevronDown} className={cn(!s && 'border-v2-border')}>
          {facet.label}
          {s ? <span className="max-w-32 truncate font-normal text-v2-muted">{s}</span> : null}
        </Button>
      }
    >
      <OptionList facet={facet} onChange={onChange} />
      {facet.selected.length > 0 ? (
        <Button size="sm" variant="ghost" className="mt-2 -ml-1" onClick={() => onChange([])}>
          Quitar filtro
        </Button>
      ) : null}
    </Popover>
  );
}

export function FilterBar({
  facets,
  onFacetChange,
  onClear,
}: {
  facets: Facet[];
  onFacetChange: (key: Facet['key'], values: string[]) => void;
  onClear: (() => void) | null;
}) {
  return (
    <div className="hidden items-center gap-1.5 md:flex">
      {facets.map((f) => (
        <FacetButton key={f.key} facet={f} onChange={(v) => onFacetChange(f.key, v)} />
      ))}
      {onClear ? (
        <Button size="md" variant="ghost" icon={X} onClick={onClear}>
          Limpiar
        </Button>
      ) : null}
    </div>
  );
}

/** Móvil: un botón «Filtros (n)» y todas las facetas en un panel. */
export function FilterSheetButton({
  facets,
  onFacetChange,
  onClear,
  resultCount,
}: {
  facets: Facet[];
  onFacetChange: (key: Facet['key'], values: string[]) => void;
  onClear: (() => void) | null;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const active = facets.reduce((n, f) => n + (f.selected.length > 0 ? 1 : 0), 0);
  return (
    <div className="md:hidden">
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Filtros"
        trigger={
          <Button size="lg" icon={SlidersHorizontal}>
            Filtros{active > 0 ? <span className="t-tnum text-v2-muted"> · {active}</span> : null}
          </Button>
        }
        footer={
          <>
            {onClear ? (
              <Button size="lg" variant="ghost" onClick={onClear}>
                Limpiar
              </Button>
            ) : null}
            <Button size="lg" variant="primary" onClick={() => setOpen(false)}>
              Ver {resultCount} {resultCount === 1 ? 'atleta' : 'atletas'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          {facets.map((f) => (
            <section key={f.key} className="flex flex-col gap-1.5">
              <h3 className="t-label text-v2-faint">{f.label}</h3>
              <OptionList facet={f} onChange={(v) => onFacetChange(f.key, v)} />
            </section>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
