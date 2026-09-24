'use client';

// ⌘K — buscar y saltar a cualquier cosa, y hacer las acciones de «+ Nuevo».
//
// Grupos: Atletas · Programas · Grupos · Biblioteca (de /api/coach/search, con
// dueño) · Acciones · Ir a (estáticos, en el cliente). Sin consulta: Recientes
// (este navegador), Acciones, Ir a. Teclado: ↑↓ moverse, Enter abrir, ⌘Enter en
// un atleta abre su conversación, Esc cerrar. Las acciones que piden atleta
// («Mensaje a…») ponen el ⌘K en modo «¿A quién?»; Retroceso con el campo vacío
// vuelve atrás.

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import {
  ArrowRight,
  BookOpen,
  CalendarRange,
  Clock,
  Layers,
  LoaderCircle,
  Plus,
  Search,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Avatar, EmptyState, ErrorState, Input, Kbd, SkeletonRows, Tag } from '@/components/v2/ui';
import { OVERLAY_Z, usePanelPortal } from '@/components/v2/ui/portal';
import { cn } from '@/lib/utils';
import { ACTIONS, filterEntries, visibleScreens, type ShellAction } from './destinations';
import { athleteHref, groupHref, libraryHref, programHref } from './intents';
import { useShell } from './ShellContext';
import { CHAT_READY, PENDING_ACTIONS } from './ShellOverlays';
import { useCoachSearch } from './use-coach-search';
import { pushRecent, readRecents, type RecentItem } from './viewer-prefs';

interface Option {
  id: string;
  group: string;
  label: string;
  meta?: string | null;
  icon?: LucideIcon;
  avatar?: { name: string; url: string | null };
  /** Pista a la derecha cuando la fila está activa («⌘↵ Mensaje»). */
  hint?: string;
  run: (withMod: boolean) => void;
}

const RECENT_ICON: Record<RecentItem['kind'], LucideIcon> = {
  athlete: Users,
  program: CalendarRange,
  group: Layers,
  library: BookOpen,
  screen: ArrowRight,
};

export function CommandPalette() {
  const { paletteOpen, paletteMode, closePalette, openPalette, negocio, runAction, runWithAthlete, openChat } = useShell();
  const { anchor, container } = usePanelPortal();
  return (
    <DialogPrimitive.Root open={paletteOpen} onOpenChange={(next) => (next ? openPalette(paletteMode) : closePalette())}>
      <span ref={anchor} hidden />
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Backdrop
          className={cn(
            'fixed inset-0 bg-v2-scrim transition-opacity duration-[var(--v2-dur-fast)]',
            'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
            OVERLAY_Z,
          )}
        />
        <DialogPrimitive.Popup
          className={cn(
            'fixed left-1/2 top-2 flex max-h-[calc(100dvh-16px)] w-[calc(100vw-16px)] -translate-x-1/2 flex-col sm:top-[12vh] sm:max-h-[min(72dvh,560px)] sm:w-[calc(100vw-32px)] sm:max-w-[640px]',
            'overflow-hidden rounded-panel border border-v2-border bg-v2-elevated text-v2-fg shadow-pop outline-none',
            'transition-[opacity,scale] duration-[var(--v2-dur-fast)] ease-[var(--v2-ease)]',
            'data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0',
            'data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 motion-reduce:transition-none',
            OVERLAY_Z,
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {paletteMode.kind === 'pick' ? paletteMode.label : 'Buscar en el panel'}
          </DialogPrimitive.Title>
          {paletteOpen ? (
            <PaletteBody
              key={paletteMode.kind === 'pick' ? paletteMode.action : 'search'}
              negocio={negocio}
              pick={paletteMode.kind === 'pick' ? paletteMode : null}
              onExitPick={() => openPalette({ kind: 'search' })}
              onClose={closePalette}
              runAction={runAction}
              runWithAthlete={runWithAthlete}
              openChat={openChat}
            />
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PaletteBody({
  negocio,
  pick,
  onExitPick,
  onClose,
  runAction,
  runWithAthlete,
  openChat,
}: {
  negocio: boolean;
  pick: { action: ShellAction; label: string } | null;
  onExitPick: () => void;
  onClose: () => void;
  runAction: ReturnType<typeof useShell>['runAction'];
  runWithAthlete: ReturnType<typeof useShell>['runWithAthlete'];
  openChat: ReturnType<typeof useShell>['openChat'];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recents] = useState<RecentItem[]>(() => readRecents());
  const listRef = useRef<HTMLDivElement>(null);
  const search = useCoachSearch(query, true);
  const q = query.trim();

  const go = (href: string, recent?: RecentItem) => {
    if (recent) pushRecent(recent);
    onClose();
    router.push(href);
  };

  const options = useMemo<Option[]>(() => {
    const out: Option[] = [];
    const data = search.data;

    const athleteOption = (a: { id: string; name: string; avatar_url: string | null; level: string | null }): Option => ({
      id: `athlete-${a.id}`,
      group: 'Atletas',
      label: a.name,
      meta: a.level,
      avatar: { name: a.name, url: a.avatar_url },
      hint: pick || !CHAT_READY ? undefined : '⌘↵ Mensaje',
      run: (withMod) => {
        const recent: RecentItem = { kind: 'athlete', id: a.id, label: a.name, meta: a.level, href: athleteHref(a.id), avatar_url: a.avatar_url };
        pushRecent(recent);
        if (pick) return runWithAthlete(pick.action, { id: a.id, name: a.name });
        if (withMod && CHAT_READY) {
          onClose();
          return openChat({ id: a.id, name: a.name });
        }
        go(recent.href);
      },
    });

    if (pick) {
      if (q === '') {
        recents
          .filter((r) => r.kind === 'athlete')
          .forEach((r) => out.push({ ...athleteOption({ id: r.id, name: r.label, avatar_url: r.avatar_url ?? null, level: r.meta }), group: 'Recientes' }));
      } else {
        data.athletes.forEach((a) => out.push(athleteOption(a)));
      }
      return out;
    }

    if (q === '') {
      recents.forEach((r) =>
        out.push({
          id: `recent-${r.kind}-${r.id}`,
          group: 'Recientes',
          label: r.label,
          meta: r.meta,
          icon: r.kind === 'athlete' ? undefined : RECENT_ICON[r.kind],
          avatar: r.kind === 'athlete' ? { name: r.label, url: r.avatar_url ?? null } : undefined,
          run: () => go(r.href, r),
        }),
      );
    } else {
      data.athletes.forEach((a) => out.push(athleteOption(a)));
      data.programs.forEach((p) => {
        const meta = p.weeks === 1 ? '1 semana' : `${p.weeks} semanas`;
        out.push({
          id: `program-${p.id}`,
          group: 'Programas',
          label: p.name,
          meta,
          icon: CalendarRange,
          run: () => go(programHref(p.id), { kind: 'program', id: p.id, label: p.name, meta, href: programHref(p.id) }),
        });
      });
      data.groups.forEach((g) =>
        out.push({
          id: `group-${g.id}`,
          group: 'Grupos',
          label: g.name,
          icon: Layers,
          run: () => go(groupHref(g.id), { kind: 'group', id: g.id, label: g.name, meta: 'Grupo', href: groupHref(g.id) }),
        }),
      );
      data.library.forEach((item) => {
        const meta = item.kind === 'bloque' ? 'Bloque' : 'Entreno';
        out.push({
          id: `library-${item.kind}-${item.id}`,
          group: 'Biblioteca',
          label: item.name,
          meta,
          icon: BookOpen,
          run: () => go(libraryHref(item), { kind: 'library', id: `${item.kind}-${item.id}`, label: item.name, meta, href: libraryHref(item) }),
        });
      });
    }

    filterEntries(ACTIONS.filter((a) => !PENDING_ACTIONS.has(a.id)), q).forEach((a) =>
      out.push({ id: `action-${a.id}`, group: 'Acciones', label: a.label, icon: Plus, run: () => runAction(a.id) }),
    );
    filterEntries(visibleScreens({ negocio }), q).forEach((s) =>
      out.push({
        id: `screen-${s.id}`,
        group: 'Ir a',
        label: s.label,
        meta: s.section,
        icon: ArrowRight,
        run: () => go(s.href, { kind: 'screen', id: s.id, label: s.label, meta: s.section, href: s.href }),
      }),
    );
    return out;
    // `go` cierra sobre router/onClose, estables durante la vida del ⌘K.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.data, q, pick, recents, negocio, runAction, runWithAthlete, openChat]);

  const activeIndex = options.length === 0 ? -1 : Math.min(active, options.length - 1);
  const activeId = activeIndex >= 0 ? options[activeIndex]!.id : undefined;

  const move = (delta: number) => {
    if (options.length === 0) return;
    const next = (activeIndex + delta + options.length) % options.length;
    setActive(next);
    listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0) options[activeIndex]!.run(e.metaKey || e.ctrlKey);
    } else if (e.key === 'Backspace' && query === '' && pick) {
      e.preventDefault();
      onExitPick();
    }
  };

  const searching = q !== '' && search.status === 'loading';
  const dataGroupsEmpty =
    search.data.athletes.length + search.data.programs.length + search.data.groups.length + search.data.library.length === 0;

  // Agrupar conservando el orden.
  const groups: { name: string; items: { opt: Option; index: number }[] }[] = [];
  options.forEach((opt, index) => {
    const last = groups[groups.length - 1];
    if (last && last.name === opt.group) last.items.push({ opt, index });
    else groups.push({ name: opt.group, items: [{ opt, index }] });
  });

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-v2-border px-3">
        {pick ? (
          <Tag className="shrink-0">{pick.label}</Tag>
        ) : (
          <Search aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-v2-faint" />
        )}
        <Input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={pick ? '¿A quién? Escribe un nombre' : 'Buscar atleta, programa, entreno o pantalla…'}
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={activeId ? `palette-${activeId}` : undefined}
          aria-autocomplete="list"
          className="h-11 flex-1 rounded-none border-0 bg-transparent px-1 text-[15px] shadow-none hover:border-0 focus-visible:shadow-none"
        />
        {searching ? <LoaderCircle aria-label="Buscando" className="size-4 shrink-0 animate-spin text-v2-faint" /> : null}
        <DialogPrimitive.Close
          aria-label="Cerrar"
          className="flex size-8 shrink-0 items-center justify-center rounded-ctl text-v2-muted outline-none hover:bg-v2-hover hover:text-v2-fg focus-visible:shadow-[0_0_0_2px_var(--v2-accent)] sm:hidden"
        >
          <X aria-hidden strokeWidth={1.75} className="size-4" />
        </DialogPrimitive.Close>
      </div>

      <div ref={listRef} id="palette-list" role="listbox" aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {search.status === 'error' ? (
          <ErrorState className="m-1.5" title="No se ha podido buscar" onRetry={search.retry} />
        ) : null}
        {q !== '' && search.status === 'loading' && search.dataQuery === '' ? (
          <SkeletonRows rows={3} className="divide-y-0" />
        ) : null}
        {groups.map((group) => (
          <div key={group.name} role="group" aria-label={group.name} className="pb-1">
            <div className="flex items-center gap-2 px-2 pb-1 pt-2 t-label text-v2-faint">
              {group.name === 'Recientes' ? <Clock aria-hidden className="size-3" strokeWidth={2} /> : null}
              {group.name}
            </div>
            {group.items.map(({ opt, index }) => (
              <PaletteRow
                key={opt.id}
                opt={opt}
                index={index}
                active={index === activeIndex}
                onHover={() => setActive(index)}
              />
            ))}
          </div>
        ))}
        {options.length === 0 && search.status !== 'error' && !(q !== '' && search.status === 'loading') ? (
          <EmptyState
            className="px-2 py-3"
            title={
              pick && q === ''
                ? 'Escribe el nombre del atleta.'
                : `Nada con «${q}».`
            }
            description={pick ? undefined : 'Prueba con otro nombre o con una pantalla, como «cobros» o «club»'}
          />
        ) : null}
        {q !== '' && search.status === 'ready' && dataGroupsEmpty && options.length > 0 && !pick ? (
          <p className="px-2 pb-1 pt-2 t-meta text-v2-faint">Ningún atleta, programa ni entreno con «{q}».</p>
        ) : null}
      </div>

      <div className="hidden h-9 shrink-0 items-center gap-4 border-t border-v2-border px-3 t-meta text-v2-faint sm:flex">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> moverse
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> abrir
        </span>
        {pick ? (
          <span className="flex items-center gap-1.5">
            <Kbd>⌫</Kbd> volver
          </span>
        ) : CHAT_READY ? (
          <span className="flex items-center gap-1.5">
            <Kbd>⌘↵</Kbd> mensaje al atleta
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1.5">
          <Kbd>Esc</Kbd> cerrar
        </span>
      </div>
    </>
  );
}

function PaletteRow({ opt, index, active, onHover }: { opt: Option; index: number; active: boolean; onHover: () => void }) {
  const Icon = opt.icon;
  return (
    <div
      id={`palette-${opt.id}`}
      role="option"
      aria-selected={active}
      data-index={index}
      onMouseMove={active ? undefined : onHover}
      onClick={(e) => opt.run(e.metaKey || e.ctrlKey)}
      className={cn(
        'relative flex h-9 cursor-default select-none items-center gap-2.5 rounded-ctl px-2 t-body text-v2-fg',
        'pointer-coarse:h-11',
        active && 'bg-v2-select',
      )}
    >
      {opt.avatar ? (
        <Avatar name={opt.avatar.name} src={opt.avatar.url} size="sm" />
      ) : Icon ? (
        <span className="flex size-6 shrink-0 items-center justify-center text-v2-muted">
          <Icon aria-hidden strokeWidth={1.75} className="size-4" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
      {active && opt.hint ? <span className="hidden shrink-0 t-meta text-v2-faint sm:inline">{opt.hint}</span> : null}
      {opt.meta ? <span className="shrink-0 t-meta text-v2-faint">{opt.meta}</span> : null}
    </div>
  );
}
