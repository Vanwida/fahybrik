'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, ErrorState, IconButton, Skeleton, StatusBadge } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { withCoachReturn } from '@/components/v2/shared/context-link';
import { shortDate } from '@fahybrid/shared/domain/coach/athlete-state';
import type { PersonalChainNode } from '@/lib/dashboard/coach/personal-plan-chain';
import { useFicha } from '../FichaContext';
import { ChainDialog, type ChainAction } from './ChainDialog';

interface ChainData { chain: PersonalChainNode[]; max_weeks: number; today: string }

export function PersonalPlanChain() {
  const { shell, calendarVersion, bumpCalendar } = useFicha();
  const query = useSearchParams();
  const router = useRouter();
  const creating = query.get('crear_programa') === '1';
  const structureRequested = query.get('plan_estructura') === '1';
  const [expanded, setExpanded] = useState(creating || query.get('plan_estructura') === '1' || !shell.has_upcoming_plan);
  const visible = expanded || creating || structureRequested;
  const [data, setData] = useState<ChainData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ChainAction | null>(null);
  const currentAction: ChainAction | null = action ?? (creating ? { kind: 'add' } : null);
  const load = useCallback(async (active: () => boolean = () => true) => {
    try {
      const result = await apiJson<ChainData>(`/api/coach/athletes/${shell.athlete_id}/plan-chain`);
      if (active()) { setData(result); setError(null); }
    } catch (err) { if (active()) setError(errorMessage(err)); }
  }, [shell.athlete_id]);
  useEffect(() => {
    let mounted = true;
    if (visible) void Promise.resolve().then(() => load(() => mounted));
    return () => { mounted = false; };
  }, [visible, calendarVersion, load]);
  const toggle = () => {
    setExpanded(!visible);
    if (visible && structureRequested) {
      const url = new URL(window.location.href); url.searchParams.delete('plan_estructura');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    }
  };
  const close = () => {
    setAction(null);
    if (creating) {
      const url = new URL(window.location.href); url.searchParams.delete('crear_programa');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    }
  };
  const openEditor = (node: PersonalChainNode) => router.push(withCoachReturn(`/programar/programas/${node.month_template_id}`, `${window.location.pathname}${window.location.search}`));
  return <section id="plan-chain" className="rounded-panel border border-v2-border bg-v2-surface">
    <Button variant="ghost" className="w-full justify-between p-3" aria-expanded={visible} onClick={toggle}>
      Estructura del plan{data ? ` · ${data.chain.length} ${data.chain.length === 1 ? 'programa' : 'programas'}` : ''}
      <span className="t-meta text-v2-muted">{visible ? 'Cerrar' : 'Ver y gestionar'}</span>
    </Button>
    {visible ? <div className="flex flex-col gap-3 border-t border-v2-border p-3">
      {error ? <ErrorState title={error} onRetry={() => void load()} /> : !data ? <Skeleton className="h-24" /> : <>
        {data.chain.length === 0 ? <p className="t-body-sm text-v2-muted">Todavía no tiene un programa. Crea el primero, escribe sus entrenos y publica su semana.</p> : <ol className="flex flex-col divide-y divide-v2-border">
          {data.chain.map((node) => <li key={node.assignment_id} className="flex flex-wrap items-center gap-2 py-3">
            <div className="min-w-0 flex-1">
              <Button variant="ghost" className="h-auto justify-start px-0 text-left" onClick={() => openEditor(node)}>{node.title}</Button>
              <p className="t-meta text-v2-muted">{node.week_count} {node.week_count === 1 ? 'semana' : 'semanas'} · {shortDate(node.start_date)} – {shortDate(node.end_date)}{node.is_personal ? ` · ${node.executed_count} ${node.executed_count === 1 ? 'sesión hecha' : 'sesiones hechas'}` : ' · Biblioteca'}</p>
            </div>
            {node.current_week ? <StatusBadge tone="neutral" label={`Semana ${node.current_week}`} /> : null}
            {node.is_personal ? <>
              <IconButton size="sm" icon={ArrowUp} label={`Mover ${node.title} antes`} disabled={!node.can_move_up} onClick={() => setAction({ kind: 'up', node })} />
              <IconButton size="sm" icon={ArrowDown} label={`Mover ${node.title} después`} disabled={!node.can_move_down} onClick={() => setAction({ kind: 'down', node })} />
              <IconButton size="sm" icon={Pencil} label={`Nombre y duración de ${node.title}`} onClick={() => setAction({ kind: 'edit', node })} />
              <IconButton size="sm" icon={Trash2} label={`Retirar ${node.title}`} onClick={() => setAction({ kind: 'remove', node })} />
            </> : null}
          </li>)}
        </ol>}
        <Button icon={Plus} variant={data.chain.length ? 'secondary' : 'primary'} className="self-start" onClick={() => setAction({ kind: 'add' })}>{data.chain.length ? 'Añadir programa personal' : 'Crear su primer programa'}</Button>
        <p className="t-meta text-v2-muted">Las fechas y las sesiones hechas se comprueban al confirmar cada cambio. La publicación de semanas se gestiona en el calendario.</p>
      </>}
    </div> : null}
    {currentAction && data ? <ChainDialog key={`${currentAction.kind}-${'node' in currentAction ? currentAction.node.assignment_id : 'new'}`} action={currentAction} athleteId={shell.athlete_id} athleteName={shell.name} maxWeeks={data.max_weeks} today={data.today} hasChain={data.chain.length > 0} onClose={close} onChanged={() => { void load(); bumpCalendar(); }} /> : null}
  </section>;
}
