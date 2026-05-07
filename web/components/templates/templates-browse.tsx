'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

export interface TemplateListItem {
  id: string;
  name: string;
  format: string;
  target_block: string;
  target_level: number | null;
  version: number;
  is_draft: boolean;
  is_partner_workout: boolean;
  archived_at: string | null;
  updated_at: string;
  day_position: string | null;
  segment_count: number;
  assignment_count: number;
  last_assigned_at: string | null;
}

const FORMAT_LABEL: Record<string, string> = {
  amrap: 'AMRAP',
  for_time: 'For Time',
  emom: 'EMOM',
  intervals: 'Intervals',
  strength_block: 'Strength',
  hyrox_sim: 'HYROX sim',
  tempo: 'Tempo',
  circuit: 'Circuit',
};

function relativeFromIso(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const days = Math.round((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}sem`;
  return `${Math.floor(days / 30)}m`;
}

interface Filters {
  block: 'all' | 'ACC' | 'TRANS' | 'REAL' | 'any';
  format: string;
  level: 'all' | '1' | '2' | '3';
  search: string;
}

export function TemplatesBrowse({ initial }: { initial: TemplateListItem[] }) {
  const [filters, setFilters] = useState<Filters>({
    block: 'all',
    format: 'all',
    level: 'all',
    search: '',
  });

  const filtered = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return initial.filter((t) => {
      if (filters.block !== 'all' && t.target_block !== filters.block) return false;
      if (filters.format !== 'all' && t.format !== filters.format) return false;
      if (filters.level !== 'all') {
        if (t.target_level !== Number(filters.level)) return false;
      }
      if (term && !t.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [initial, filters]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FilterSelect
          label="Bloque"
          value={filters.block}
          onChange={(v) => setFilters((f) => ({ ...f, block: v as Filters['block'] }))}
          options={[
            { v: 'all', l: 'Todos' },
            { v: 'ACC', l: 'ACC · Acumulación' },
            { v: 'TRANS', l: 'TRANS · Transformación' },
            { v: 'REAL', l: 'REAL · Realización' },
            { v: 'any', l: 'Sin bloque' },
          ]}
        />
        <FilterSelect
          label="Formato"
          value={filters.format}
          onChange={(v) => setFilters((f) => ({ ...f, format: v }))}
          options={[
            { v: 'all', l: 'Todos' },
            ...Object.entries(FORMAT_LABEL).map(([v, l]) => ({ v, l })),
          ]}
        />
        <FilterSelect
          label="Nivel"
          value={filters.level}
          onChange={(v) => setFilters((f) => ({ ...f, level: v as Filters['level'] }))}
          options={[
            { v: 'all', l: 'Todos' },
            { v: '1', l: 'Niv 1' },
            { v: '2', l: 'Niv 2' },
            { v: '3', l: 'Niv 3' },
          ]}
        />
        <input
          type="search"
          placeholder="Buscar..."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          className="h-8 px-3 text-sm bg-[var(--surface)] border border-[var(--outline)] rounded-md text-foreground placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent w-56"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState hasAny={initial.length > 0} />
      ) : (
        <ul className="bg-[var(--surface)] rounded-[var(--r-l)] overflow-hidden">
          {filtered.map((t, i) => (
            <li
              key={t.id}
              className={cn(
                'group',
                i > 0 && 'border-t border-[var(--hairline)]',
              )}
            >
              <Link
                href={`/templates/${t.id}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--surface-elevated)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{t.name}</span>
                    {t.is_draft && (
                      <span className="text-[10px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-sm bg-[var(--surface-elevated)] text-[var(--muted)]">
                        Borrador
                      </span>
                    )}
                    {t.is_partner_workout && (
                      <span className="text-[10px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-sm bg-[var(--surface-elevated)] text-[var(--muted)]">
                        Partner
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">
                    {FORMAT_LABEL[t.format] ?? t.format} · {t.segment_count} seg
                    {t.target_level != null && ` · niv ${t.target_level}`}
                    {' · asignada '}
                    {t.assignment_count}× · última {relativeFromIso(t.last_assigned_at)}
                  </div>
                </div>
                <div className="text-right text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  {t.target_block !== 'any' && (
                    <div>
                      {t.target_block}
                      {t.day_position && (
                        <span className="ml-1 text-foreground/80 font-mono">
                          {t.day_position}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="font-mono text-[var(--accent)] not-italic">v{t.version}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-[var(--muted)] uppercase tracking-[0.16em]">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 px-2 text-sm bg-[var(--surface)] border border-[var(--outline)] rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent normal-case tracking-normal"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="bg-[var(--surface)] rounded-[var(--r-l)] py-16 px-6 text-center">
      <div className="font-display italic font-black text-2xl mb-2">
        {hasAny ? 'Sin resultados' : 'Crea tu primera plantilla'}
      </div>
      <p className="text-sm text-[var(--muted)] mb-6">
        {hasAny
          ? 'Ajusta los filtros o limpia la búsqueda.'
          : 'Empieza desde cero o duplica una plantilla base.'}
      </p>
      {!hasAny && (
        <Link
          href="/templates/new"
          className="h-9 px-4 inline-flex items-center rounded-md bg-[var(--accent)] text-[var(--accent-on)] font-medium text-sm hover:bg-[var(--accent-press)] transition-colors"
        >
          + Nueva plantilla
        </Link>
      )}
    </div>
  );
}
