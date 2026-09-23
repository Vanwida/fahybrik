'use client';

// UNA línea de tiempo del atleta (informe C §4.4): mensajes, comunicados,
// check-ins, 1:1, tests, lesiones y cambios de plan, del más reciente al más
// viejo, con filtro. Sustituye a la pestaña «Del coach» y al histórico de 1:1.

import { useMemo, useState } from 'react';
import {
  CalendarRange,
  ClipboardList,
  HeartPulse,
  Megaphone,
  MessageCircle,
  Stethoscope,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState, FilterChip } from '@/components/v2/ui';
import { relativeDayLabel } from '@/components/v2/shared/format';
import type { TimelineEntry, TimelineKind } from '@/lib/dashboard/v2/atleta-detalle-types';
import { cn } from '@/lib/utils';

const KIND: Record<TimelineKind, { label: string; icon: LucideIcon }> = {
  mensaje: { label: 'Mensajes', icon: MessageCircle },
  comunicado: { label: 'Comunicados', icon: Megaphone },
  checkin: { label: 'Check-ins', icon: HeartPulse },
  revision: { label: '1:1', icon: ClipboardList },
  test: { label: 'Tests', icon: Timer },
  lesion: { label: 'Lesiones', icon: Stethoscope },
  plan: { label: 'Plan', icon: CalendarRange },
};
const ORDER: TimelineKind[] = ['mensaje', 'comunicado', 'checkin', 'revision', 'test', 'lesion', 'plan'];

/** Cuántas se ven antes de «Ver más». */
const PAGE = 40;

export function Timeline({
  entries,
  today,
  initial,
}: {
  entries: TimelineEntry[];
  today: string;
  initial: TimelineKind | null;
}) {
  const [kind, setKind] = useState<TimelineKind | null>(initial);
  const [shown, setShown] = useState(PAGE);
  const counts = useMemo(() => {
    const m = new Map<TimelineKind, number>();
    for (const e of entries) m.set(e.kind, (m.get(e.kind) ?? 0) + 1);
    return m;
  }, [entries]);
  const list = kind ? entries.filter((e) => e.kind === kind) : entries;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Filtrar historial">
        <FilterChip active={kind == null} onClick={() => setKind(null)} count={entries.length}>
          Todo
        </FilterChip>
        {ORDER.filter((k) => (counts.get(k) ?? 0) > 0 || k === initial).map((k) => (
          <FilterChip key={k} active={kind === k} onClick={() => setKind(k)} count={counts.get(k) ?? 0}>
            {KIND[k].label}
          </FilterChip>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState
          title={kind ? `Sin ${KIND[kind].label.toLowerCase()} todavía` : 'Sin historial todavía'}
          description={kind === 'comunicado' ? 'publícale uno con «Comunicado…» arriba' : undefined}
        />
      ) : (
        <ol className="flex flex-col">
          {list.slice(0, shown).map((e, i) => {
            const Icon = KIND[e.kind].icon;
            const day = relativeDayLabel(e.at.slice(0, 10), today);
            const prevDay = i > 0 ? relativeDayLabel(list[i - 1]!.at.slice(0, 10), today) : null;
            return (
              <li key={e.id} className="flex gap-3">
                <span className="w-14 shrink-0 pt-2 text-right t-meta text-v2-faint t-tnum">{day !== prevDay ? day : ''}</span>
                <span className="relative flex w-6 shrink-0 justify-center">
                  <span aria-hidden className="absolute inset-y-0 w-px bg-v2-border" />
                  <span
                    className={cn(
                      'relative mt-2 flex size-6 items-center justify-center rounded-full border border-v2-border bg-v2-surface',
                      e.who === 'atleta' ? 'text-v2-info' : 'text-v2-muted',
                    )}
                  >
                    <Icon aria-hidden className="size-3.5" strokeWidth={1.75} />
                  </span>
                </span>
                <div className="min-w-0 flex-1 border-b border-v2-border py-2">
                  <p className="t-body text-v2-fg">{e.title}</p>
                  {e.detail ? <p className="t-body-sm text-v2-muted">{e.detail}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {list.length > shown ? (
        <FilterChip variant="add" onClick={() => setShown((n) => n + PAGE)}>
          Ver {Math.min(PAGE, list.length - shown)} más
        </FilterChip>
      ) : null}
    </div>
  );
}
