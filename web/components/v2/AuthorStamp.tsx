// AuthorStamp — the small "hecho por X · hace Y" authorship sello, one component
// reused across every surface (block card, lead row, athlete ficha, …). Reads the
// authorship registry's denormalized fields; renders the canonical grammar
//   [avatar(s)] {name} {verb} · {when}
// A person (coach/athlete) shows an initials avatar; a non-person actor
// (ai/system/lead) shows a compact mono chip instead — the IA/system never wears
// a human avatar. An optional original creator sits as a stacked avatar behind the
// last editor. Relative time comes from the single source of truth (formatRelative).

import { formatRelative } from '@/lib/dashboard/relative-time';
import { initialsFromName } from '@/lib/dashboard/athletes/discipline-label';
import { cn } from '@/lib/utils';

export type AuthorStampKind = 'coach' | 'athlete' | 'ai' | 'system' | 'lead';

/** Chip label for non-person actors (they carry no user avatar). */
const CHIP_LABEL: Record<Exclude<AuthorStampKind, 'coach' | 'athlete'>, string> = {
  ai: 'IA',
  system: 'sistema',
  lead: 'lead',
};

function isPerson(kind: AuthorStampKind): kind is 'coach' | 'athlete' {
  return kind === 'coach' || kind === 'athlete';
}

function Avatar({ name, kind }: { name: string; kind: 'coach' | 'athlete' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full',
        'text-nano font-bold ring-1 ring-inset',
        kind === 'coach'
          ? 'bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent-text)] ring-[color:var(--v2-accent)]'
          : 'bg-[color:var(--v2-info-soft)] text-[color:var(--v2-info)] ring-[color:var(--v2-info)]',
      )}
    >
      {initialsFromName(name)}
    </span>
  );
}

export interface AuthorStampProps {
  /** WHO acted. */
  kind: AuthorStampKind;
  /** The person's display name (coach/athlete). Ignored for chip kinds. */
  name?: string | null;
  /** Past-tense verb phrase: "creó", "editó", "ajustó", "movió a Cita", "dio de alta". */
  verb?: string;
  /** ISO timestamp of the action. */
  at?: string | null;
  /** Original creator, shown as a stacked avatar behind the actor (create ≠ last edit). */
  createdBy?: { kind: 'coach' | 'athlete'; name: string } | null;
  className?: string;
}

/**
 * Returns null when there is nothing to attribute (no person name and no chip
 * context) — historical rows with no recorded author render nothing rather than a
 * fabricated name. See the migration note: authorship counts from first login.
 */
export function AuthorStamp({ kind, name, verb, at, createdBy, className }: AuthorStampProps) {
  const person = isPerson(kind);
  const displayName = (name ?? '').trim();
  if (person && !displayName) return null;

  const when = at ? formatRelative(at) : null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-label leading-none text-[color:var(--v2-muted)]',
        className,
      )}
    >
      {person ? (
        <span className="inline-flex">
          {createdBy ? (
            <span className="mr-[-6px]">
              <Avatar name={createdBy.name} kind={createdBy.kind} />
            </span>
          ) : null}
          <Avatar name={displayName} kind={kind} />
        </span>
      ) : (
        <span
          className={cn(
            'rounded-[var(--v2-r-2xs)] px-[5px] py-[2px] font-[family-name:var(--v2-font-mono)] text-nano font-bold uppercase tracking-wider ring-1 ring-inset',
            kind === 'ai'
              ? 'bg-[color:var(--v2-info-soft)] text-[color:var(--v2-info)] ring-[color:var(--v2-info)]'
              : 'bg-[color:var(--v2-surface)] text-[color:var(--v2-faint)] ring-[color:var(--v2-border)]',
          )}
        >
          {CHIP_LABEL[kind]}
        </span>
      )}
      {person ? <span className="font-semibold text-[color:var(--v2-fg)]">{displayName}</span> : null}
      {verb ? <span>{verb}</span> : null}
      {when ? (
        <>
          <span className="text-[color:var(--v2-faint)]">·</span>
          <span className="tabular-nums">{when}</span>
        </>
      ) : null}
    </span>
  );
}
