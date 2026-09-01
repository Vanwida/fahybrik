'use client';

// LeadTableRow — one lead as a dense 2-line workbench row (not a stretched table row):
//   Line 1: name · status Pill · next_action chip (the urgent thing first).
//   Line 2: a single truncating line of short metadata (objetivo · nivel · días ·
//           ubicación · carrera · "hace 1 h").
// A status-colored left accent triages the eye down the funnel. The whole card links to
// the lead detail via a full-bleed overlay <Link>; the mail/tel affordances are real
// anchors layered ABOVE it so the coach can reach out WITHOUT opening the lead. Pure
// presentational — the data layer owns fields, ordering and the derived next_action.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { Pill } from '@/components/v2/Pill';
import { LEAD_STATUS_META } from '@/lib/dashboard/coach/leads-status';
import type { LeadListItem } from '@/lib/dashboard/coach/leads';
import { formatRelative } from '@/lib/dashboard/relative-time';
import { cn } from '@/lib/utils';

/** A mailto:/tel: affordance — a real anchor (external protocol) layered above the card
 *  link. stopPropagation is belt-and-braces; the anchor already sits above the overlay. */
function ContactLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a
      href={href}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'v2-focus pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full',
        'text-[color:var(--v2-faint)] transition-colors',
        'hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]',
      )}
    >
      <MIcon name={icon} size={18} />
    </a>
  );
}

export function LeadTableRow({ lead, index }: { lead: LeadListItem; index: number }) {
  const meta = LEAD_STATUS_META[lead.status];
  const name = lead.nombre?.trim() || lead.email;
  const na = lead.next_action;

  // Line-2 segments in scan order; empties dropped so a sparse lead never shows "· ·".
  const detail = [
    lead.objetivo_short,
    lead.nivel_short,
    lead.dias_short,
    lead.ubicacion_short,
    lead.carrera_short,
    formatRelative(lead.created_at),
  ].filter(Boolean);

  return (
    <div
      className={cn(
        'v2-stagger group relative flex items-center gap-3 border-b border-[color:var(--v2-border)] px-3 py-2.5',
        'transition-colors hover:bg-[color:var(--v2-elevated)]',
      )}
      style={{
        ['--v2-stagger-i' as string]: index,
        // accentVar is already a full `var(--v2-…)` string from the status meta.
        boxShadow: `inset 3px 0 0 0 ${meta.accentVar}`,
      }}
    >
      {/* Full-card navigation target, behind the content. */}
      <Link
        href={`/leads/${lead.id}`}
        aria-label={`Ver lead ${name}`}
        className="v2-focus absolute inset-0 z-0 rounded-[var(--v2-r-s)]"
      />

      {/* Content — non-interactive, so clicks fall through to the card link. */}
      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-2.5">
        <AthleteAvatar name={name} size="sm" />
        <div className="flex min-w-0 flex-col gap-0.5">
          {/* Line 1 — name + status + the urgent next action */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                'truncate text-sm font-semibold text-[color:var(--v2-fg)]',
                meta.strikethrough && 'line-through opacity-70',
              )}
            >
              {name}
            </span>
            <Pill tone={meta.tone} variant="soft">
              {meta.label}
            </Pill>
            {na ? (
              <Pill tone={na.tone} variant={na.tone === 'accent' ? 'solid' : 'soft'}>
                {na.text}
              </Pill>
            ) : null}
          </div>
          {/* Line 2 — one truncating line of short metadata */}
          {detail.length > 0 ? (
            <span className="truncate text-label text-[color:var(--v2-muted)]">
              {detail.join(' · ')}
            </span>
          ) : null}
        </div>
      </div>

      {/* Reach-out affordances + chevron — layered above the card link. */}
      <div className="relative z-10 flex shrink-0 items-center gap-0.5">
        <ContactLink href={`mailto:${lead.email}`} icon="mail" label={`Enviar email a ${name}`} />
        {lead.telefono ? (
          <ContactLink href={`tel:${lead.telefono}`} icon="call" label={`Llamar a ${name}`} />
        ) : null}
        <MIcon
          name="chevron_right"
          size={20}
          className="pointer-events-none ml-0.5 text-[color:var(--v2-faint)] transition-colors group-hover:text-[color:var(--v2-muted)]"
        />
      </div>
    </div>
  );
}
