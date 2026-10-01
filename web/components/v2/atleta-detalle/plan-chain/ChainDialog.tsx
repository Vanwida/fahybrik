'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Button, Dialog, Field, Input, useToast } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { withCoachReturn } from '@/components/v2/shared/context-link';
import type { PersonalChainNode } from '@/lib/dashboard/coach/personal-plan-chain';
import { resizeLine } from './consequences';

export type ChainAction = { kind: 'add' } | { kind: 'edit' | 'remove' | 'up' | 'down'; node: PersonalChainNode };

export function ChainDialog({ action, athleteId, athleteName, maxWeeks, today, hasChain, onClose, onChanged }: {
  action: ChainAction; athleteId: string; athleteName: string; maxWeeks: number; today: string; hasChain: boolean;
  onClose: () => void; onChanged: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const node = action.kind === 'add' ? null : action.node;
  const [name, setName] = useState(node?.title ?? '');
  const [weeks, setWeeks] = useState(node?.week_count ?? 1);
  const [start, setStart] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = action.kind === 'add' || action.kind === 'edit';
  const title = action.kind === 'add' ? hasChain ? 'Añadir programa personal' : `Primer programa de ${athleteName}`
    : action.kind === 'edit' ? `Nombre y duración de «${node!.title}»`
    : action.kind === 'remove' ? `¿Retirar «${node!.title}»?` : `¿Cambiar de orden «${node!.title}»?`;
  const line = action.kind === 'add'
    ? hasChain ? 'Empieza al terminar lo que ya tiene. Deja de seguir automáticamente el plan de su grupo. Nace oculto: escribe los entrenos y publica la semana cuando esté lista.'
      : 'Empieza el lunes de la fecha elegida. Nace oculto: escribe los entrenos y publica la semana cuando esté lista.'
    : action.kind === 'edit' ? resizeLine(node!, weeks)
    : action.kind === 'remove' ? `Se retiran ${node!.pending_count} sesiones pendientes. Las ${node!.executed_count} entrenadas quedan en el historial. ${node!.executed_count ? 'Las fechas de los programas siguientes se conservan.' : 'Los programas personales siguientes se adelantan para cerrar el hueco.'}`
    : 'Intercambia su posición y sus fechas con el programa personal vecino. El servidor impide mover cualquiera que tenga sesiones hechas.';

  const save = async () => {
    if (busy) return;
    if (editing && (!name.trim() || !Number.isInteger(weeks) || weeks < Math.max(1, node?.min_week_count ?? 1) || weeks > Math.max(maxWeeks, node?.week_count ?? 0))) {
      setError('Revisa el nombre y el número de semanas.');
      return;
    }
    setBusy(true);
    setError(null);
    const base = `/api/coach/athletes/${athleteId}/plan-chain`;
    try {
      if (action.kind === 'add') {
        const r = await apiJson<{ tramo: { month_template_id: string; start_date: string } }>(base, {
          method: 'POST', body: { name: name.trim(), week_count: weeks, ...(!hasChain ? { start_date: start } : {}) },
        });
        onChanged();
        onClose();
        toast({ title: 'Programa personal creado', description: 'Escribe su primer entreno; después publica su semana desde la ficha.' });
        router.push(withCoachReturn(`/programar/programas/${r.tramo.month_template_id}`, `${window.location.pathname}${window.location.search}`));
      } else {
        const url = `${base}/${node!.month_template_id}`;
        if (action.kind === 'edit') await apiJson(url, { method: 'PATCH', body: { name: name.trim(), week_count: weeks } });
        else if (action.kind === 'remove') await apiJson(url, { method: 'DELETE' });
        else await apiJson(`${url}/move`, { method: 'POST', body: { direction: action.kind } });
        onChanged();
        onClose();
        toast({ title: action.kind === 'remove' ? 'Programa retirado' : 'Estructura del plan actualizada', description: 'Lo ya entrenado se conserva.' });
      }
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  return <Dialog open title={title} description={line} onOpenChange={(open) => { if (!open && !busy) onClose(); }} footer={<>
    <Button variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>
    <Button variant={action.kind === 'remove' ? 'destructive' : 'primary'} loading={busy} onClick={() => void save()}>{action.kind === 'add' ? 'Crear y escribir entrenos' : action.kind === 'remove' ? 'Retirar programa' : 'Confirmar cambio'}</Button>
  </>}>
    {editing ? <div className="flex flex-col gap-4">
      <Field label="Nombre" error={error}>{({ id }) => <Input id={id} value={name} maxLength={200} autoFocus onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="Semanas" hint={`De ${Math.max(1, node?.min_week_count ?? 1)} a ${Math.max(maxWeeks, node?.week_count ?? 0)}. El límite de tu método está en Ajustes.`}>{({ id }) => <Input id={id} type="number" min={Math.max(1, node?.min_week_count ?? 1)} max={Math.max(maxWeeks, node?.week_count ?? 0)} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} />}</Field>
      {action.kind === 'add' && !hasChain ? <Field label="Semana de inicio" hint="Se usa el lunes de esta fecha.">{({ id }) => <Input id={id} type="date" value={start} onChange={(e) => setStart(e.target.value)} />}</Field> : null}
    </div> : error ? <p role="alert" className="t-body-sm text-v2-danger">{error}</p> : null}
  </Dialog>;
}
