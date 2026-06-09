'use client';

// ProgramarHub — la biblioteca única del coach (/programar, spec §3 + mockup
// 03 vista A). Dos tipos de objeto, nada más: Sesiones | Microciclos, con
// toggle segmentado sincronizado a la URL (?tab=). Muere la distinción
// Biblioteca/Entrenos: todo entreno reutilizable es una Sesión.

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Block } from '@fahybrid/shared/schema/blocks';
import type { MethodologyGroup } from '@fahybrid/shared/schema/methodology-groups';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/dashboard/MIcon';
import { NewMicrocycleWizard } from '@/components/dashboard/programming/NewMicrocycleWizard';
import { SessionsCatalog } from './SessionsCatalog';
import { MicrocyclesGrid, type MicrocycleRow } from './MicrocyclesGrid';
import { NewSessionModal } from './NewSessionModal';
import type { LibraryDrawerItem } from './LibrarySessionDrawer';
import type { ProgramarTab, TemplateRow } from './library-items';

interface ProgramarHubProps {
  initialTab: ProgramarTab;
  blocks: Block[];
  templates: TemplateRow[];
  microcycles: MicrocycleRow[];
  methodologyGroups: MethodologyGroup[];
}

export function ProgramarHub({
  initialTab,
  blocks,
  templates,
  microcycles,
  methodologyGroups,
}: ProgramarHubProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<ProgramarTab>(initialTab);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [openItem, setOpenItem] = useState<LibraryDrawerItem | null>(null);

  const selectTab = useCallback(
    (next: ProgramarTab) => {
      if (next === tab) return;
      setTab(next);
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('tab', next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [tab, pathname, router, searchParams],
  );

  const handleMutated = useCallback(() => {
    router.refresh();
  }, [router]);

  const sessionsCount = blocks.length + templates.length;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-[color:var(--bg)]">
      {/* Header: título + toggle segmentado + CTA contextual */}
      <header className="flex flex-wrap items-end justify-between gap-4 px-4 pb-5 pt-6 sm:px-8">
        <div className="min-w-0">
          <h1 className="font-display-xl text-[color:var(--fg)]">Programar</h1>
          <p className="mt-1 max-w-2xl text-sm text-[color:var(--text-muted)]">
            Tu biblioteca: sesiones reutilizables y microciclos de 4 semanas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Tipo de objeto"
            className="inline-flex gap-0.5 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] p-[3px]"
          >
            <SegmentedOption
              label="Sesiones"
              count={sessionsCount}
              active={tab === 'sesiones'}
              onClick={() => selectTab('sesiones')}
            />
            <SegmentedOption
              label="Microciclos"
              count={microcycles.length}
              active={tab === 'microciclos'}
              onClick={() => selectTab('microciclos')}
            />
          </div>

          {tab === 'sesiones' ? (
            <button
              type="button"
              onClick={() => setNewSessionOpen(true)}
              className="focus-ring inline-flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[color:var(--accent)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--accent-on)] hover:brightness-110"
            >
              <MIcon name="add" size={15} aria-hidden />
              Nueva sesión
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="focus-ring inline-flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[color:var(--accent)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--accent-on)] hover:brightness-110"
            >
              <MIcon name="add" size={15} aria-hidden />
              Nuevo microciclo
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 px-4 pb-10 sm:px-8">
        {tab === 'sesiones' ? (
          <SessionsCatalog
            blocks={blocks}
            templates={templates}
            methodologyGroups={methodologyGroups}
            openItem={openItem}
            onOpenItem={setOpenItem}
            onMutated={handleMutated}
          />
        ) : (
          <MicrocyclesGrid microcycles={microcycles} onCreate={() => setWizardOpen(true)} />
        )}
      </div>

      <NewMicrocycleWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <NewSessionModal
        open={newSessionOpen}
        onClose={() => setNewSessionOpen(false)}
        onCreated={(template_id) => {
          setNewSessionOpen(false);
          handleMutated();
          // Alta mínima: el resto de tags se editan en el drawer recién abierto.
          setOpenItem({ kind: 'own', template_id });
        }}
      />
    </div>
  );
}

function SegmentedOption({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'focus-ring inline-flex items-center gap-2 rounded-[calc(var(--r-m)-3px)] px-4 py-1.5 text-[13px] font-semibold transition-colors',
        active
          ? 'bg-[color:var(--surface-container-highest)] text-[color:var(--fg)] shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_1px_3px_rgba(0,0,0,0.45)]'
          : 'text-[color:var(--text-muted)] hover:text-[color:var(--fg)]',
      )}
    >
      {label}
      <span
        className={cn(
          'metric-num rounded-[var(--r-pill)] px-1.5 py-px text-[11px]',
          active
            ? 'bg-[color:var(--accent)]/12 text-[color:var(--accent)]'
            : 'bg-[color:var(--surface-container)] text-[color:var(--text-muted)]',
        )}
      >
        {count}
      </span>
    </button>
  );
}
