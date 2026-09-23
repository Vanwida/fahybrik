'use client';

// El pie de Hoy: «Resuelto hoy N · Pospuesto N», que se despliega para ver a
// quién y reabrirlo (vuelve a la bandeja), y los atajos de teclado.

import { useState } from 'react';
import { ChevronDown, ChevronUp, Keyboard, RotateCcw } from 'lucide-react';
import { Avatar, Button, IconButton, Kbd, List, ListRow, SectionHeader } from '@/components/v2/ui';
import type { ReopenTarget } from './hoy-model';

export interface FooterEntry {
  athlete_id: string;
  name: string;
  avatar_url: string | null;
  /** «Readiness 38 · hasta nueva señal». */
  detail: string;
  targets: ReopenTarget[];
}

function EntryList({
  title,
  entries,
  verb,
  onReopen,
}: {
  title: string;
  entries: ReadonlyArray<FooterEntry>;
  verb: string;
  onReopen: (e: FooterEntry) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title={title} count={entries.length} />
      <List aria-label={title}>
        {entries.map((e) => (
          <ListRow
            key={e.athlete_id}
            density="compact"
            leading={<Avatar name={e.name} src={e.avatar_url} size="sm" />}
            title={e.name}
            detail={<span className="truncate">{e.detail}</span>}
            trailing={
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => onReopen(e)}>
                {verb}
              </Button>
            }
          />
        ))}
      </List>
    </section>
  );
}

export function HoyFooter({
  resolvedCount,
  snoozedCount,
  resolved,
  snoozed,
  onReopen,
  onHelp,
}: {
  resolvedCount: number;
  snoozedCount: number;
  resolved: ReadonlyArray<FooterEntry>;
  snoozed: ReadonlyArray<FooterEntry>;
  onReopen: (e: FooterEntry) => void;
  onHelp: () => void;
}) {
  const [open, setOpen] = useState(false);
  const any = resolvedCount + snoozedCount > 0;
  const canOpen = resolved.length + snoozed.length > 0;

  return (
    <footer className="flex flex-col gap-4 border-t border-v2-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {any ? (
          <Button
            size="sm"
            variant="ghost"
            iconEnd={canOpen ? (open ? ChevronUp : ChevronDown) : undefined}
            aria-expanded={canOpen ? open : undefined}
            disabled={!canOpen}
            onClick={() => setOpen((o) => !o)}
            className="-ml-2.5 t-tnum"
          >
            Resuelto hoy {resolvedCount} · Pospuesto {snoozedCount}
          </Button>
        ) : (
          <span className="t-meta text-v2-faint">Nada resuelto ni pospuesto hoy todavía</span>
        )}
        <span className="hidden items-center gap-3 t-meta text-v2-faint lg:inline-flex">
          <span className="inline-flex items-center gap-1">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd> moverse
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>E</Kbd> hecho
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>H</Kbd> posponer
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>R</Kbd> responder
          </span>
          <IconButton icon={Keyboard} label="Todos los atajos" shortcut="?" size="sm" onClick={onHelp} />
        </span>
      </div>
      {open && canOpen ? (
        <div className="grid gap-6 md:grid-cols-2">
          <EntryList title="Pospuesto" entries={snoozed} verb="Traer ya" onReopen={onReopen} />
          <EntryList title="Resuelto hoy" entries={resolved} verb="Reabrir" onReopen={onReopen} />
        </div>
      ) : null}
    </footer>
  );
}
