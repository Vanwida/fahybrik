'use client';

// TriageCard — one row in the /hoy queue (SPEC §4 card anatomy): AthleteGlyph
// (readiness ring + avatar + highest-severity badge) · ReasonChip (StatusChip,
// color+icon+label) · evidence mini-line · 3 actions. Signal items expose
// Resolver / Posponer / Abrir; decision items expose Aprobar (or Revisar intake)
// / Ajustar / Posponer; MESSAGE items expose Responder (opens the inline
// ThreadDrawer) / Posponer / Ficha with the last message as the evidence line.
// All three keep the same compact ~one-row density. Optimistic resolve/snooze is
// owned by the parent (TriageQueue); this card only renders and dispatches intent.

import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { AthleteGlyph, StatusChip } from '@/components/dashboard/ui';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';
import type { TriageItem } from './triage-types';
import { SNOOZE_PRESETS, type SnoozePreset } from './triage-types';

const BTN_BASE =
  'focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-m)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors';
const BTN_APPROVE = cn(
  BTN_BASE,
  'border border-[color:color-mix(in_srgb,var(--ok)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--ok)_14%,var(--surface-container))] text-[color:var(--ok)] hover:bg-[color:color-mix(in_srgb,var(--ok)_24%,var(--surface-container))]',
);
const BTN_PRIMARY = cn(
  BTN_BASE,
  'bg-[color:var(--accent)] text-[color:var(--accent-on)] hover:bg-[color:var(--accent-press)]',
);
const BTN_SECONDARY = cn(
  BTN_BASE,
  'border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] text-[color:var(--fg)] hover:bg-[color:var(--surface-container-high)]',
);
const BTN_GHOST = cn(
  BTN_BASE,
  'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container)] hover:text-[color:var(--fg)]',
);

export interface TriageCardProps {
  item: TriageItem;
  selected: boolean;
  focused: boolean;
  /** Resolve = dismiss (signal) / approve (decision). */
  onResolve: (item: TriageItem) => void;
  /** Snooze for `hours` from now. */
  onSnooze: (item: TriageItem, preset: SnoozePreset) => void;
  /** Open the side panel (signals/decisions) or the thread drawer (messages). */
  onOpen: (item: TriageItem) => void;
  /** Open the inline thread drawer to reply (message items only). */
  onReply: (item: Extract<TriageItem, { kind: 'message' }>) => void;
  /** Toggle multi-select. */
  onToggleSelect: (item: TriageItem) => void;
  /** Hover/click → focus this card (keyboard sync). */
  onFocus: (id: string) => void;
}

export function TriageCard({
  item,
  selected,
  focused,
  onResolve,
  onSnooze,
  onOpen,
  onReply,
  onToggleSelect,
  onFocus,
}: TriageCardProps) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const critical = item.tier === 'critico';
  const isMessage = item.kind === 'message';
  // A message line opens the thread drawer (inline reply); other kinds open the
  // athlete side panel. Clicking the glyph/name uses the same primary intent.
  const openPrimary = () => (item.kind === 'message' ? onReply(item) : onOpen(item));

  return (
    <article
      data-triage-id={item.id}
      onMouseEnter={() => onFocus(item.id)}
      aria-label={`${item.reason_label} — ${item.athlete_name}`}
      className={cn(
        'card-elevated relative flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-5',
        focused && 'ring-2 ring-[color:color-mix(in_srgb,var(--accent)_55%,transparent)]',
        selected && 'border-[color:var(--accent)]',
      )}
    >
      {/* Select checkbox (≥24px hit area). */}
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={selected ? 'Deseleccionar' : 'Seleccionar'}
        onClick={() => onToggleSelect(item)}
        className={cn(
          'focus-ring absolute left-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-[var(--r-s)] md:static md:mt-1',
          selected
            ? 'bg-[color:var(--accent)] text-[color:var(--accent-on)]'
            : 'border border-[color:var(--border-subtle)] text-transparent hover:border-[color:var(--text-muted)]',
        )}
      >
        <MIcon name="check" size={15} weight={700} />
      </button>

      <div className="flex min-w-0 flex-1 gap-4">
        <button
          type="button"
          onClick={openPrimary}
          aria-label={
            isMessage ? `Responder a ${item.athlete_name}` : `Abrir resumen de ${item.athlete_name}`
          }
          className="focus-ring shrink-0 rounded-full"
        >
          <AthleteGlyph
            name={item.athlete_name}
            readinessScore={item.readiness_score}
            status={{
              tier: item.reason_tier,
              label: item.reason_label,
              icon: item.reason_icon,
            }}
            size="md"
          />
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-[color:var(--fg)]">
              {item.athlete_name}
            </span>
            <StatusChip
              tier={item.reason_tier}
              label={item.reason_label}
              icon={item.reason_icon}
              variant={critical ? 'solid' : 'tint'}
            />
            {item.kind === 'signal' && item.other_signal_count > 0 ? (
              <span className="metric-num text-[11px] text-[color:var(--text-muted)]">
                +{item.other_signal_count} más
              </span>
            ) : null}
            {item.kind === 'message' && item.unread_count > 1 ? (
              <span
                aria-label={`${item.unread_count} mensajes sin leer`}
                className="metric-num inline-flex h-4 min-w-4 items-center justify-center rounded-[var(--r-pill)] bg-[color:var(--accent)] px-1 text-[10px] font-bold text-[color:var(--accent-on)]"
              >
                {item.unread_count}
              </span>
            ) : null}
            {item.kind === 'message' && item.age_label ? (
              <span className="metric-num text-[11px] text-[color:var(--text-muted)]">
                {item.age_label}
              </span>
            ) : null}
          </div>
          {item.kind === 'message' ? (
            <p className="max-w-[60ch] truncate text-[13.5px] italic leading-relaxed text-[color:var(--text-muted)]">
              {item.preview}
            </p>
          ) : (
            <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-[color:var(--text-muted)]">
              {item.evidence}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        className={cn(
          'relative flex shrink-0 flex-wrap items-center gap-2 border-t border-[color:var(--border-subtle)] pt-3',
          'md:border-t-0 md:pt-0',
        )}
      >
        {item.kind === 'decision' ? (
          <DecisionActions item={item} onResolve={onResolve} />
        ) : item.kind === 'message' ? (
          <button type="button" className={BTN_PRIMARY} onClick={() => onReply(item)}>
            <MIcon name="reply" size={15} />
            Responder
          </button>
        ) : (
          <button type="button" className={BTN_APPROVE} onClick={() => onResolve(item)}>
            <MIcon name="check" size={15} />
            Resolver
          </button>
        )}

        {/* Posponer (with preset menu) — every item can be snoozed. */}
        <SnoozeButton
          open={snoozeOpen}
          onOpenChange={setSnoozeOpen}
          onPick={(preset) => {
            setSnoozeOpen(false);
            onSnooze(item, preset);
          }}
        />

        {item.kind === 'signal' ? (
          <Link href={item.open_href} className={BTN_GHOST}>
            Abrir
            <MIcon name="arrow_forward" size={15} />
          </Link>
        ) : item.kind === 'message' ? (
          <Link href={item.open_href} className={BTN_GHOST}>
            Ficha
            <MIcon name="arrow_forward" size={15} />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

// ── Decision-specific actions (preserve the existing approve/deep-links) ──────

function DecisionActions({
  item,
  onResolve,
}: {
  item: Extract<TriageItem, { kind: 'decision' }>;
  onResolve: (item: TriageItem) => void;
}) {
  const payload = item.payload;

  if (payload.type === 'intake_pending') {
    return (
      <>
        <Link href={`/atletas/${item.athlete_id}/intake`} className={BTN_PRIMARY}>
          <MIcon name="assignment_ind" size={15} />
          Revisar intake
        </Link>
        <Link href={`/atletas/${item.athlete_id}`} className={BTN_SECONDARY}>
          Ver ficha
        </Link>
      </>
    );
  }

  // week_adjustment / monthly_block — Aprobar (real endpoint) + Ajustar/Revisar.
  return (
    <>
      <button type="button" className={BTN_APPROVE} onClick={() => onResolve(item)}>
        <MIcon name="check" size={15} />
        Aprobar
      </button>
      <Link href={item.open_href} className={BTN_SECONDARY}>
        {payload.type === 'week_adjustment' ? 'Ajustar' : 'Revisar'}
      </Link>
    </>
  );
}

// ── Snooze preset popover ─────────────────────────────────────────────────────

function SnoozeButton({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (preset: SnoozePreset) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Dismiss the preset menu on outside pointer or Escape (the ref existed but was
  // never wired — SPEC §4 expects a dismissible popover).
  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      onOpenChange(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className={BTN_GHOST}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        Posponer
        <MIcon name="expand_more" size={15} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Posponer hasta"
          className="card-elevated absolute right-0 top-full z-20 mt-1 flex w-36 flex-col p-1"
        >
          {SNOOZE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              role="menuitem"
              onClick={() => onPick(preset)}
              className="focus-ring flex items-center gap-2 rounded-[var(--r-s)] px-3 py-2 text-left text-[13px] text-[color:var(--fg)] hover:bg-[color:var(--surface-container)]"
            >
              <MIcon name="schedule" size={15} className="text-[color:var(--text-muted)]" />
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
