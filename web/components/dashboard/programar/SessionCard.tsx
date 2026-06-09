'use client';

// SessionCard — una sesión de la biblioteca única (/programar, spec §3a).
// Visual por mockup 03 vista A: barra izquierda con el color del grupo
// metodológico, chip de grupo, badge de origen (Pablo read-only / Propia),
// título display italic, resumen 2 líneas y tags (formato · fase ATR · nivel).

import { groupColorFor } from '@/lib/dashboard/programming/group-colors';
import { atrBadgeClass } from '@/lib/dashboard/constants/atr-phases';
import { formatRelative } from '@/lib/dashboard/relative-time';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';
import {
  formatFacetLabel,
  SESSION_LEVEL_LABELS,
  type LibrarySessionItem,
} from './library-items';

export function SessionCard({
  item,
  groupName,
  onOpen,
  onDelete,
  deleting,
}: {
  item: LibrarySessionItem;
  /** Nombre completo del grupo metodológico (chip), si tiene. */
  groupName: string | null;
  onOpen: () => void;
  /** Solo sesiones propias — las de Pablo no se borran desde aquí. */
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const group = groupColorFor(item.methodology_group_id);
  const formatTag = formatFacetLabel(item.format_facet);
  const levelTag = item.level != null ? SESSION_LEVEL_LABELS[item.level] : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Abrir sesión ${item.title}${item.origin === 'pablo' ? ', de Pablo' : ', propia'}`}
      className={cn(
        'group relative flex h-full w-full cursor-pointer flex-col gap-3 overflow-hidden',
        'rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-4 text-left',
        'transition-all hover:-translate-y-px hover:border-[color:var(--accent)]/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40',
      )}
    >
      {/* Barra de identidad del grupo metodológico */}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 top-0 w-[3px]"
        style={{ backgroundColor: group.color }}
      />

      <div className="flex items-start justify-between gap-2">
        <span
          className="inline-flex items-center rounded-[var(--r-pill)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: group.color, backgroundColor: group.tint }}
        >
          {groupName ?? group.label}
        </span>
        {item.origin === 'pablo' ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--r-pill)] border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent)]">
            <MIcon name="lock" size={11} aria-hidden />
            Pablo
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
            Propia
          </span>
        )}
      </div>

      <h3 className="line-clamp-2 font-display text-[16px] font-extrabold italic leading-snug text-[color:var(--fg)]">
        {item.title}
      </h3>

      {item.summary ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-[color:var(--text-muted)]">
          {item.summary}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        {formatTag ? (
          <span className="rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text-muted)]">
            {formatTag}
          </span>
        ) : null}
        {item.atr ? (
          <span
            className={cn(
              'rounded-[var(--r-pill)] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
              atrBadgeClass(item.atr),
            )}
          >
            {item.atr}
          </span>
        ) : null}
        {levelTag ? (
          <span className="rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--text-muted)]">
            {levelTag}
          </span>
        ) : null}
        {item.is_draft ? (
          <span className="rounded-[var(--r-pill)] border border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--status-warning)]">
            Borrador
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[color:var(--border-subtle)] pt-2.5 text-[11px] text-[color:var(--text-muted)]">
        {item.origin === 'propia' ? (
          <>
            <span>
              {item.block_count ?? 0} {item.block_count === 1 ? 'bloque' : 'bloques'} ·{' '}
              {item.exercise_count ?? 0}{' '}
              {item.exercise_count === 1 ? 'ejercicio' : 'ejercicios'}
            </span>
            <span>{item.updated_at ? formatRelative(item.updated_at) : ''}</span>
          </>
        ) : (
          <span>
            {item.needs_review
              ? 'Sin desglosar — pendiente de revisión'
              : 'Biblioteca de Pablo'}
          </span>
        )}
      </div>

      {onDelete ? (
        <button
          type="button"
          aria-label={`Borrar sesión ${item.title}`}
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={cn(
            'absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full',
            'text-[color:var(--text-muted)] opacity-0 transition-opacity',
            'group-hover:opacity-100 focus-visible:opacity-100',
            'hover:bg-[color:var(--danger)]/15 hover:text-[color:var(--danger)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40',
            'disabled:opacity-40',
          )}
        >
          <MIcon name={deleting ? 'progress_activity' : 'close'} size={14} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
