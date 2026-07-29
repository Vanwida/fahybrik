'use client';

// LeadsTable — the leads directory as a dense list of 2-line workbench rows (LeadTableRow
// owns each row). No column header: the rows carry their own labels, so there is nothing
// to align a header against. Empty result → a themed EmptyState that distinguishes "no
// leads at all" (nobody finished onboarding yet) from "nothing matches the filter". The
// list scrolls within a bounded panel for long funnels; a footer shows the live count.

import { EmptyState } from '@/components/v2/EmptyState';
import { LeadTableRow } from '@/components/v2/leads/LeadTableRow';
import type { LeadListItem } from '@/lib/dashboard/coach/leads';

export function LeadsTable({
  leads,
  scopeTotal,
  hasAnyLeads,
}: {
  leads: LeadListItem[];
  /** Leads in the current archived-visibility scope (footer denominator). */
  scopeTotal: number;
  /** False only when there are zero leads in the whole table. */
  hasAnyLeads: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-card)]">
      {leads.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={hasAnyLeads ? 'filter_alt_off' : 'person_search'}
            title={hasAnyLeads ? 'Nada coincide con el filtro' : 'Aún no hay leads'}
            description={
              hasAnyLeads
                ? 'Ajusta los filtros o la búsqueda para ver más leads.'
                : 'Cuando alguien complete el onboarding en fahybrid.com aparecerá aquí.'
            }
          />
        </div>
      ) : (
        <div className="max-h-[calc(100dvh-16rem)] overflow-y-auto">
          {leads.map((lead, i) => (
            <LeadTableRow key={lead.id} lead={lead} index={i} />
          ))}
        </div>
      )}

      {/* Footer count */}
      {leads.length > 0 ? (
        <div className="flex items-center justify-between border-t border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2">
          <span className="text-label text-[color:var(--v2-muted)]">
            mostrando{' '}
            <span className="v2-num font-semibold text-[color:var(--v2-fg)]">{leads.length}</span> de{' '}
            <span className="v2-num">{scopeTotal}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
