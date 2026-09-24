'use client';

// «Parejas de dobles» (Atletas › ···): dos atletas que entrenan el mismo plan,
// cada uno a su intensidad. Vincular, asignarles el plan a los dos, el reparto de
// la simulación y deshacer la pareja. Antes ocupaba una columna fija junto a la
// lista (informe B, R12); ahora se abre cuando se necesita y carga entonces.
//
//   GET    /api/coach/doubles/pairs                        parejas activas
//   POST   /api/coach/doubles/pairs                        vincular
//   POST   /api/coach/doubles/pairs/{id}/assign-sequence   plan a los dos
//   DELETE /api/coach/doubles/pairs/{id}                   deshacer

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Lightbulb, Link2, MoreHorizontal, SlidersHorizontal, Unlink } from 'lucide-react';
import type { DoublesPair } from '@/lib/dashboard/coach/doubles-pairs';
import type { RosterRow } from '@/lib/dashboard/athletes/roster';
import {
  Avatar,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  List,
  ListRow,
  Menu,
  Select,
  Sheet,
  SkeletonRows,
  Tag,
  useToast,
} from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { DoblesSimulationEditor } from './DoblesSimulationEditor';
import { CoachGuidanceEditor } from './CoachGuidanceEditor';

function cellLabel(p: DoublesPair): string {
  const lvl = p.level_name ?? 'sin nivel';
  const days = p.training_days_per_week ? `${p.training_days_per_week} días` : 'sin días';
  return `${lvl} · ${days}`;
}

function PairRow({ pair, onChanged }: { pair: DoublesPair; onChanged: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const both = pair.athlete_a.has_active_plan && pair.athlete_b.has_active_plan;
  const names = `${pair.athlete_a.full_name} y ${pair.athlete_b.full_name}`;

  const assign = async () => {
    setBusy(true);
    try {
      await apiJson(`/api/coach/doubles/pairs/${pair.id}/assign-sequence`, { method: 'POST', body: {} });
      toast({ title: `Plan asignado a ${names}`, tone: 'ok' });
      onChanged();
    } catch (err) {
      toast({ title: 'No se ha podido asignar el plan', description: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const dissolve = async () => {
    setBusy(true);
    try {
      await apiJson(`/api/coach/doubles/pairs/${pair.id}`, { method: 'DELETE' });
      toast({ title: `${names} ya no son pareja` });
      setConfirm(false);
      onChanged();
    } catch (err) {
      toast({ title: 'No se ha podido deshacer la pareja', description: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ListRow
        leading={
          <span className="flex -space-x-1.5">
            <Avatar name={pair.athlete_a.full_name} size="md" className="ring-2 ring-v2-surface" />
            <Avatar name={pair.athlete_b.full_name} size="md" className="ring-2 ring-v2-surface" />
          </span>
        }
        title={names}
        detail={
          <>
            <Tag>{cellLabel(pair)}</Tag>
            <span className="t-meta text-v2-faint">{both ? 'Los dos con plan' : 'Sin plan común todavía'}</span>
          </>
        }
        trailing={
          <>
            <Button size="sm" variant="ghost" icon={SlidersHorizontal} onClick={() => setSimOpen(true)}>
              Reparto
            </Button>
            <Button size="sm" icon={CalendarCheck} loading={busy} onClick={() => void assign()}>
              {both ? 'Reasignar plan' : 'Asignar plan'}
            </Button>
            <Menu
              trigger={<IconButton icon={MoreHorizontal} label="Más" size="sm" />}
              items={[{ label: 'Deshacer pareja', icon: Unlink, danger: true, onSelect: () => setConfirm(true) }]}
            />
          </>
        }
      />
      {simOpen ? <DoblesSimulationEditor athleteId={String(pair.athlete_a.athlete_id)} onClose={() => setSimOpen(false)} /> : null}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        size="sm"
        title="¿Deshacer la pareja?"
        description={`${names} siguen con su plan, cada uno por su lado.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" loading={busy} onClick={() => void dissolve()}>
              Deshacer pareja
            </Button>
          </>
        }
      />
    </>
  );
}

function LinkPairDialog({
  open,
  onClose,
  candidates,
  onLinked,
}: {
  open: boolean;
  onClose: () => void;
  candidates: RosterRow[];
  onLinked: () => void;
}) {
  const { toast } = useToast();
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = (exclude: string | null) =>
    candidates
      .filter((c) => c.athlete_id !== exclude)
      .map((c) => ({ value: c.athlete_id, label: c.name, hint: c.level?.label }));

  const submit = async () => {
    if (!a || !b) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson('/api/coach/doubles/pairs', { method: 'POST', body: { athlete_a_id: Number(a), athlete_b_id: Number(b) } });
      toast({ title: 'Pareja vinculada', tone: 'ok' });
      setA(null);
      setB(null);
      onLinked();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'No se ha podido vincular la pareja.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? null : onClose())}
      size="sm"
      title="Vincular pareja"
      description="Si tienen distinto nivel o días, alinéalos antes. Si a uno le falta, se copia del otro."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={!a || !b || a === b} onClick={() => void submit()}>
            Vincular
          </Button>
        </>
      }
    >
      {candidates.length < 2 ? (
        <EmptyState title="Hacen falta dos atletas sin pareja" />
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Atleta 1">
            {({ id }) => <Select id={id} size="lg" placeholder="Elegir atleta" value={a} onValueChange={setA} options={options(b)} />}
          </Field>
          <Field label="Atleta 2" error={error}>
            {({ id }) => <Select id={id} size="lg" placeholder="Elegir atleta" value={b} onValueChange={setB} options={options(a)} />}
          </Field>
        </div>
      )}
    </Dialog>
  );
}

export function DoublesSheet({ rows, onClose }: { rows: readonly RosterRow[]; onClose: () => void }) {
  const [pairs, setPairs] = useState<DoublesPair[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    apiJson<{ pairs: DoublesPair[] }>('/api/coach/doubles/pairs', { signal: ctrl.signal })
      .then((res) => {
        setPairs(res.pairs);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(errorMessage(err, 'No se han podido cargar las parejas.'));
      });
    return () => ctrl.abort();
  }, [nonce]);

  // Quien ya está en una pareja no se puede volver a elegir.
  const candidates = useMemo(() => {
    const paired = new Set((pairs ?? []).flatMap((p) => [String(p.athlete_a.athlete_id), String(p.athlete_b.athlete_id)]));
    return rows.filter((r) => r.lifecycle !== 'baja' && !paired.has(r.athlete_id));
  }, [rows, pairs]);

  return (
    <Sheet
      open
      onOpenChange={(o) => (o ? null : onClose())}
      size="lg"
      title={`Parejas de dobles${pairs ? ` · ${pairs.length}` : ''}`}
      description="Dos atletas que entrenan el mismo plan, cada uno a su intensidad."
      footer={
        <>
          <Button variant="ghost" icon={Lightbulb} onClick={() => setTipsOpen(true)}>
            Consejos de dobles
          </Button>
          <Button variant="primary" icon={Link2} onClick={() => setLinkOpen(true)}>
            Vincular pareja
          </Button>
        </>
      }
    >
      {error ? (
        <ErrorState title="No se han podido cargar las parejas" description={error} onRetry={reload} />
      ) : !pairs ? (
        <SkeletonRows rows={3} />
      ) : pairs.length === 0 ? (
        <EmptyState title="Todavía no hay parejas" description="vincula a dos atletas que entrenen juntos" />
      ) : (
        <List aria-label="Parejas de dobles">
          {pairs.map((p) => (
            <PairRow key={p.id} pair={p} onChanged={reload} />
          ))}
        </List>
      )}
      <LinkPairDialog open={linkOpen} onClose={() => setLinkOpen(false)} candidates={candidates} onLinked={reload} />
      {tipsOpen ? <CoachGuidanceEditor onClose={() => setTipsOpen(false)} /> : null}
    </Sheet>
  );
}
