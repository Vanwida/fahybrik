'use client';

// SessionLibraryRail — rail derecho del week-studio (spec §3b + mockup 03
// vista B): sesiones de la biblioteca única (bloques de Pablo + entrenos
// propios) sugeridas según la fase ATR del microciclo, con búsqueda. Se añade
// a un día por click (elige día inline) usando la vía de inserción existente.
// Visible cuando NO hay sesión abierta (el drawer ocupa ese lado al editar).

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import type { Block } from '@fahybrid/shared/schema/blocks';
import { SearchInput } from '@/components/dashboard/ui/SearchInput';
import { groupColorFor } from '@/lib/dashboard/programming/group-colors';
import { atrPhaseLabel } from '@/lib/dashboard/constants/atr-phases';
import { DAY_LABELS } from '@/lib/dashboard/constants/calendar';
import type { TemplateRow } from '@/components/dashboard/programar/library-items';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export type RailSession =
  | { kind: 'pablo'; block: Block }
  | { kind: 'own'; template: TemplateRow };

interface SessionLibraryRailProps {
  blocks: Block[];
  templates: TemplateRow[];
  /** Fase ATR del microciclo — ordena las sugeridas primero. */
  phaseHint: string | null;
  loading: boolean;
  /** Añade la sesión elegida a un día (1–7) de la semana. Puede rechazar. */
  onAdd: (dayOfWeek: number, session: RailSession) => Promise<void> | void;
}

function railKey(s: RailSession): string {
  return s.kind === 'pablo' ? `pablo-${s.block.id}` : `own-${s.template.id}`;
}

function railTitle(s: RailSession): string {
  return s.kind === 'pablo' ? s.block.title : s.template.name;
}

function railGroupId(s: RailSession): number | null {
  return s.kind === 'pablo'
    ? s.block.methodology_group_id
    : s.template.methodology_group_id;
}

function railAtr(s: RailSession): string | null {
  if (s.kind === 'pablo') return s.block.atr_block_hint;
  return s.template.target_block === 'any' ? null : s.template.target_block;
}

export function SessionLibraryRail({
  blocks,
  templates,
  phaseHint,
  loading,
  onAdd,
}: SessionLibraryRailProps) {
  const [search, setSearch] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessions = useMemo<RailSession[]>(() => {
    const own: RailSession[] = templates
      .filter((t) => !t.is_draft)
      .map((template) => ({ kind: 'own', template }));
    const pablo: RailSession[] = blocks.map((block) => ({ kind: 'pablo', block }));
    return [...own, ...pablo];
  }, [blocks, templates]);

  const { suggested, rest } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = q
      ? sessions.filter((s) => railTitle(s).toLowerCase().includes(q))
      : sessions;
    if (!phaseHint) return { suggested: visible, rest: [] as RailSession[] };
    return {
      suggested: visible.filter((s) => railAtr(s) === phaseHint),
      rest: visible.filter((s) => railAtr(s) !== phaseHint),
    };
  }, [sessions, search, phaseHint]);

  const handlePick = async (dayOfWeek: number, session: RailSession) => {
    const key = railKey(session);
    setPendingKey(key);
    setError(null);
    try {
      await onAdd(dayOfWeek, session);
    } catch {
      setError('No se pudo añadir la sesión — vuelve a intentarlo');
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <aside
      aria-label="Biblioteca — sesiones sugeridas"
      className="flex h-full w-[280px] shrink-0 flex-col border-l border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)]"
    >
      <header className="shrink-0 border-b border-[color:var(--border-subtle)] px-4 pb-3 pt-4">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-extrabold uppercase italic text-[color:var(--fg)]">
          <MIcon name="library_books" size={17} aria-hidden className="text-[color:var(--accent)]" />
          Biblioteca
        </h2>
        <div className="mt-2.5">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar sesión…" />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-[color:var(--text-muted)]">
          Toca una sesión y elige el día. Sugeridas según la fase del microciclo.
        </p>
      </header>

      {error ? (
        <p role="alert" className="shrink-0 px-4 pt-2 text-[11px] text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3">
        {loading ? (
          <RailSkeleton />
        ) : suggested.length === 0 && rest.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-[color:var(--text-muted)]">
            Sin sesiones que coincidan.
          </p>
        ) : (
          <>
            {phaseHint && suggested.length > 0 ? (
              <p className="micro-label px-1 pb-1 pt-0.5">
                Sugeridas · {atrPhaseLabel(phaseHint)}
              </p>
            ) : null}
            {suggested.map((s) => (
              <RailCard
                key={railKey(s)}
                session={s}
                pending={pendingKey === railKey(s)}
                onPick={(day) => void handlePick(day, s)}
              />
            ))}
            {phaseHint && rest.length > 0 ? (
              <p className="micro-label px-1 pb-1 pt-3">Resto de la biblioteca</p>
            ) : null}
            {rest.map((s) => (
              <RailCard
                key={railKey(s)}
                session={s}
                pending={pendingKey === railKey(s)}
                onPick={(day) => void handlePick(day, s)}
              />
            ))}
          </>
        )}
      </div>

      <footer className="shrink-0 border-t border-[color:var(--border-subtle)] px-4 py-2.5">
        <Link
          href="/programar?tab=sesiones"
          className="focus-ring inline-flex items-center gap-1 rounded-[var(--r-s)] text-xs font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--accent)]"
        >
          Ver toda la biblioteca
          <MIcon name="arrow_forward" size={14} aria-hidden />
        </Link>
      </footer>
    </aside>
  );
}

function RailCard({
  session,
  pending,
  onPick,
}: {
  session: RailSession;
  pending: boolean;
  onPick: (dayOfWeek: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const group = groupColorFor(railGroupId(session));
  const title = railTitle(session);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)]',
        'transition-colors hover:border-[color:var(--accent)]/40 hover:bg-[color:var(--surface-container)]',
      )}
    >
      <span
        aria-hidden
        className="absolute bottom-0 left-0 top-0 w-[3px]"
        style={{ backgroundColor: group.color }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Añadir sesión ${title} a un día de la semana`}
        className="focus-ring w-full p-2.5 pl-3.5 text-left disabled:opacity-60"
      >
        <span
          className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.07em]"
          style={{ color: group.color }}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: group.color }}
          />
          {group.label}
        </span>
        <span className="mt-0.5 block text-xs font-semibold leading-snug text-[color:var(--fg)]">
          {title}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[10px] text-[color:var(--text-muted)]">
          {railAtr(session) ? <span>{railAtr(session)}</span> : null}
          <span
            className={cn(
              'rounded-[var(--r-pill)] px-1.5 py-px text-[8.5px] font-bold uppercase tracking-[0.08em]',
              session.kind === 'pablo'
                ? 'bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
                : 'bg-[color:var(--surface-container-high)] text-[color:var(--text-muted)]',
            )}
          >
            {session.kind === 'pablo' ? 'Pablo' : 'Propia'}
          </span>
          {pending ? <span>Añadiendo…</span> : null}
        </span>
      </button>

      {open ? (
        <div
          role="group"
          aria-label={`Elegir día para ${title}`}
          className="grid grid-cols-7 gap-1 border-t border-[color:var(--border-subtle)] p-1.5 pl-3"
        >
          {DAY_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(i + 1);
              }}
              aria-label={`Añadir ${title} al ${label}`}
              className="focus-ring rounded-[var(--r-s)] px-0.5 py-1 text-[9px] font-bold uppercase tracking-wide text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--accent)]/15 hover:text-[color:var(--accent)]"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RailSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-[var(--r-m)] bg-[color:var(--surface-container-low)]"
        />
      ))}
    </div>
  );
}
