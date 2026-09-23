'use client';

// LA FICHA DEL ATLETA — un cockpit (DECISIONS 2026-09-23, informe C §4). Arriba,
// siempre: quién es, por qué está marcado y qué toca hacer. Debajo, tres pestañas:
// Plan (el calendario editable y su estado), Rendimiento y Perfil. Cada pestaña la
// pinta el servidor (`children`); aquí vive lo que las tres comparten y los
// paneles que se abren desde cualquier sitio (conversación, comunicado, asignar,
// entreno, herramientas de semana).

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { Tabs } from '@/components/v2/ui';
import { AssignSheet } from '@/components/v2/shared';
import { useShell } from '@/components/v2/shell/ShellContext';
import { cn } from '@/lib/utils';
import type { FichaShell, FichaTab, FichaUrl } from '@/lib/dashboard/v2/atleta-detalle-types';
import { Compositor } from './del-coach/Compositor';
import { FichaContext, type FichaActions, type WeekTool } from './FichaContext';
import { FichaHeader } from './ficha/FichaHeader';
import { StatusBanner } from './ficha/StatusBanner';
import { HacerAhora } from './ficha/HacerAhora';
import { SessionSheet } from './sheet/SessionSheet';
import { WeekToolDialog } from './plan/WeekToolDialog';

const TAB_ITEMS: { value: FichaTab; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'rendimiento', label: 'Rendimiento' },
  { value: 'perfil', label: 'Perfil' },
];

export function Ficha({
  shell,
  url,
  nav,
  children,
}: {
  shell: FichaShell;
  url: FichaUrl;
  /** K/J entre atletas: llega en streaming (el roster no bloquea la ficha). */
  nav: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { openChat: shellOpenChat } = useShell();
  const [pending, startTransition] = useTransition();

  const [composer, setComposer] = useState(url.comunicado);
  const [assign, setAssign] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(url.sesion);
  const [sessionAi, setSessionAi] = useState(false);
  const [weekTool, setWeekTool] = useState<{ tool: WeekTool; weekStart: string } | null>(null);
  const [calendarVersion, setCalendarVersion] = useState(0);

  const replaceQuery = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(search.toString());
      mutate(p);
      const qs = p.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [pathname, router, search],
  );

  const openChat = useCallback(
    () => shellOpenChat({ id: shell.athlete_id, name: shell.name }),
    [shellOpenChat, shell.athlete_id, shell.name],
  );

  // Enlaces viejos `?tab=mensajes` y los chips «Responder»: la conversación se
  // abre en el panel del shell, encima de la ficha.
  useEffect(() => {
    if (url.chat) {
      openChat();
      replaceQuery((p) => p.delete('chat'));
    }
    // Solo al llegar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);
  const bumpCalendar = useCallback(() => {
    setCalendarVersion((v) => v + 1);
    refresh();
  }, [refresh]);

  const openSession = useCallback(
    (id: string, opts?: { ai?: boolean }) => {
      setSessionId(id);
      setSessionAi(opts?.ai ?? false);
      replaceQuery((p) => p.set('sesion', id));
    },
    [replaceQuery],
  );
  const closeSession = useCallback(() => {
    setSessionId(null);
    replaceQuery((p) => p.delete('sesion'));
  }, [replaceQuery]);

  const openComposer = useCallback(() => setComposer(true), []);
  const closeComposer = useCallback(() => {
    setComposer(false);
    if (search.get('comunicado')) replaceQuery((p) => p.delete('comunicado'));
  }, [replaceQuery, search]);

  const actions = useMemo<FichaActions>(
    () => ({
      shell,
      openChat,
      openComposer,
      openAssign: () => setAssign(true),
      openSession,
      openWeekTool: (tool, weekStart) => setWeekTool({ tool, weekStart }),
      calendarVersion,
      bumpCalendar,
      refresh,
    }),
    [shell, openChat, openComposer, openSession, calendarVersion, bumpCalendar, refresh],
  );

  const goTab = (tab: FichaTab) => {
    const p = new URLSearchParams();
    const desde = search.get('desde');
    if (tab !== 'plan') p.set('tab', tab);
    const zoom = search.get('zoom');
    if (tab === 'plan' && zoom) p.set('zoom', zoom);
    if (desde) p.set('desde', desde);
    const qs = p.toString();
    startTransition(() => router.push(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false }));
  };

  return (
    <FichaContext.Provider value={actions}>
      <div className="mx-auto flex w-full min-w-0 max-w-[var(--v2-container)] flex-col gap-3 sm:gap-4">
        <FichaHeader nav={nav} />
        <StatusBanner />
        <HacerAhora />
        <Tabs items={TAB_ITEMS} value={url.tab} onValueChange={goTab} aria-label="Secciones del atleta" />
        <div
          aria-busy={pending || undefined}
          className={cn('min-w-0 transition-opacity duration-[var(--v2-dur)]', pending && 'opacity-60')}
        >
          {children}
        </div>
      </div>

      {composer ? (
        <Compositor
          modo="publicar"
          destinatarios={[{ athlete_id: shell.athlete_id, full_name: shell.name }]}
          coachName={shell.club_name}
          onCerrar={closeComposer}
          onHecho={() => {
            closeComposer();
            refresh();
          }}
        />
      ) : null}

      <AssignSheet
        open={assign}
        onClose={() => setAssign(false)}
        athleteIds={[shell.athlete_id]}
        athletes={[{ id: shell.athlete_id, name: shell.name, avatar_url: shell.avatar_url }]}
        onAssigned={() => bumpCalendar()}
      />

      {sessionId ? (
        <SessionSheet key={sessionId} sessionId={sessionId} startWithAi={sessionAi} onClose={closeSession} />
      ) : null}

      {weekTool ? (
        <WeekToolDialog tool={weekTool.tool} weekStart={weekTool.weekStart} onClose={() => setWeekTool(null)} />
      ) : null}
    </FichaContext.Provider>
  );
}
