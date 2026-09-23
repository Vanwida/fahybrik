'use client';

// Negocio › Leads — la lista de quien ha entrado por tu formulario y aún no es
// atleta. Arriba, solo si hay algo: las llamadas que vienen y la lista de
// espera. Filtros por estado (los archivados, aparte) y búsqueda. Cada fila abre
// la ficha del lead en un panel a la derecha (/negocio/leads/[id]) sin perder
// la lista de vista; J/K recorren la lista con el panel abierto.

import { useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { ArrowRight, Mail, Phone, Search, Video } from 'lucide-react';
import { usePathname, useRouter } from '@/i18n/navigation';
import {
  Avatar,
  EmptyState,
  FilterChip,
  Input,
  List,
  ListRow,
  SectionHeader,
  StatusBadge,
  Tag,
  buttonVariants,
} from '@/components/v2/ui';
import type { LeadListItem } from '@/lib/dashboard/coach/leads';
import type { UpcomingCall } from '@/lib/citas/store';
import type { CapacityState } from '@/lib/coach/capacity';
import type { WaitlistEntry } from '@/lib/leads/waitlist';
import { LEAD_STATUS_META, LEAD_STATUS_ORDER, type LeadStatus } from '@/lib/dashboard/coach/leads-status';
import { formatRelative } from '@/lib/dashboard/relative-time';
import { formatCitaDateTime } from '@/components/v2/citas/format';
import { cn } from '@/lib/utils';
import { LEAD_TONE, leadName } from './lead-ui';
import { WaitlistList } from './WaitlistList';

type Filter = 'activos' | LeadStatus | 'archivados';

export function LeadsScreen({
  leads,
  counts,
  total,
  upcomingCalls,
  capacity,
  waitlist,
}: {
  leads: LeadListItem[];
  counts: Record<LeadStatus, number>;
  total: number;
  upcomingCalls: UpcomingCall[];
  capacity: CapacityState | null;
  waitlist: WaitlistEntry[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const openId = /^\/negocio\/leads\/(\d+)/.exec(pathname)?.[1] ?? null;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('activos');

  const activeStatuses = LEAD_STATUS_ORDER.filter((s) => !LEAD_STATUS_META[s].archived && counts[s] > 0);
  const archivedCount = counts.convertido + counts.descartado;
  const activeCount = total - archivedCount;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      const archived = LEAD_STATUS_META[l.status].archived;
      if (filter === 'activos' && archived) return false;
      if (filter === 'archivados' && !archived) return false;
      if (filter !== 'activos' && filter !== 'archivados' && l.status !== filter) return false;
      return !q || `${l.nombre ?? ''} ${l.email}`.toLowerCase().includes(q);
    });
  }, [leads, query, filter]);

  // J/K recorren la lista abriendo el panel de cada lead.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key !== 'j' && e.key !== 'k') return;
      if (rows.length === 0) return;
      const i = rows.findIndex((r) => r.id === openId);
      const next = e.key === 'j' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i === -1 ? 0 : i - 1);
      const target = rows[next];
      if (target && target.id !== openId) {
        e.preventDefault();
        router.push(`/negocio/leads/${target.id}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, openId, router]);

  if (total === 0) {
    return (
      <div className="flex flex-col gap-6">
        {upcomingCalls.length > 0 ? <CallsList calls={upcomingCalls} /> : null}
        <EmptyState
          variant="page"
          icon={ArrowRight}
          title="Todavía no ha entrado ningún lead"
          description="Aparecen aquí cuando alguien rellena tu formulario de entrada."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {upcomingCalls.length > 0 ? <CallsList calls={upcomingCalls} /> : null}
      {waitlist.length > 0 ? <WaitlistList entries={waitlist} /> : null}

      <section className="flex flex-col gap-3" aria-label="Leads">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
            <FilterChip active={filter === 'activos'} count={activeCount} onClick={() => setFilter('activos')}>
              Abiertos
            </FilterChip>
            {activeStatuses.map((s) => (
              <FilterChip key={s} active={filter === s} count={counts[s]} onClick={() => setFilter(s)}>
                {LEAD_STATUS_META[s].label}
              </FilterChip>
            ))}
            {archivedCount > 0 ? (
              <FilterChip active={filter === 'archivados'} count={archivedCount} onClick={() => setFilter('archivados')}>
                Archivados
              </FilterChip>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {capacity ? (
              <Tag>
                {capacity.max == null ? 'Cupo: sin límite' : `Cupo: ${capacity.active} de ${capacity.max}`}
              </Tag>
            ) : null}
            <Input
              type="search"
              icon={Search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o correo"
              aria-label="Buscar lead"
              className="w-full lg:w-64"
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="Nada coincide" description="prueba con otro estado o búsqueda" />
        ) : (
          <List aria-label="Leads">
            {rows.map((l) => (
              <LeadRow key={l.id} lead={l} active={l.id === openId} />
            ))}
          </List>
        )}
      </section>
    </div>
  );
}

function LeadRow({ lead, active }: { lead: LeadListItem; active: boolean }) {
  const locale = useLocale();
  const meta = LEAD_STATUS_META[lead.status];
  const name = leadName(lead);
  const detail = [lead.objetivo_short, lead.nivel_short, lead.dias_short, lead.ubicacion_short, lead.carrera_short].filter(
    Boolean,
  );
  return (
    <ListRow
      href={`/${locale}/negocio/leads/${lead.id}`}
      selected={active}
      leading={<Avatar name={name} size="lg" />}
      title={<span className={cn(meta.strikethrough && 'text-v2-muted line-through')}>{name}</span>}
      detail={
        <>
          <StatusBadge tone={LEAD_TONE[meta.tone]} label={meta.label} size="sm" />
          {lead.next_action && lead.next_action.text !== meta.label ? (
            <span className="truncate text-v2-fg">{lead.next_action.text}</span>
          ) : null}
          {detail.length > 0 ? <span className="hidden truncate md:inline">{detail.join(' · ')}</span> : null}
        </>
      }
      meta={formatRelative(lead.created_at)}
      trailing={
        <span className="hidden items-center gap-0.5 sm:flex">
          <a
            href={`mailto:${lead.email}`}
            aria-label={`Escribir a ${name}`}
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'w-7 px-0' })}
          >
            <Mail aria-hidden strokeWidth={1.75} />
          </a>
          {lead.telefono ? (
            <a
              href={`tel:${lead.telefono}`}
              aria-label={`Llamar a ${name}`}
              className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'w-7 px-0' })}
            >
              <Phone aria-hidden strokeWidth={1.75} />
            </a>
          ) : null}
        </span>
      }
    />
  );
}

function CallsList({ calls }: { calls: UpcomingCall[] }) {
  const locale = useLocale();
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Próximas llamadas" count={calls.length} />
      <List aria-label="Próximas llamadas">
        {calls.map((c) => {
          const name = c.lead_nombre?.trim() || c.lead_email;
          return (
            <ListRow
              key={c.id}
              density="compact"
              href={`/${locale}/negocio/leads/${c.lead_id}`}
              leading={<Avatar name={name} size="md" />}
              title={name}
              detail={
                <span className="t-tnum">
                  {formatCitaDateTime(c.requested_start)} · {c.duration_minutes} min ·{' '}
                  {c.modality === 'presencial' ? 'presencial' : 'videollamada'}
                </span>
              }
              trailing={
                c.meet_link ? (
                  <a
                    href={c.meet_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    <Video aria-hidden strokeWidth={1.75} />
                    Unirse
                  </a>
                ) : null
              }
            />
          );
        })}
      </List>
    </section>
  );
}

