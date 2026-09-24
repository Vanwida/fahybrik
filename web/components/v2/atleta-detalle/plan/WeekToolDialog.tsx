'use client';

// Las herramientas de una semana (menú ··· de la fila): copiar a otra semana,
// desplazar ±N días, escalar el volumen (subir o bajar x %), descarga (con el % del coach) y
// evaluar la semana. Cada una dice qué va a tocar antes de hacerlo; mover y
// copiar se pueden deshacer.

import { useMemo, useState } from 'react';
import { Button, Dialog, Field, Input, SegmentedControl, Select, Sheet, useToast } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import type { WeekOpResult } from '@/lib/dashboard/v2/ficha-week-ops';
import { addDaysIso } from '@/lib/dashboard/v2/ficha-dates';
import { weekRangeLabel } from '@/lib/dashboard/v2/ficha-format';
import { EvaluarSemanaPanel } from '../rendimiento/EvaluarSemanaPanel';
import { useFicha, type WeekTool } from '../FichaContext';

const TITLE: Record<Exclude<WeekTool, 'evaluar'>, string> = {
  copy: 'Copiar semana',
  shift: 'Desplazar días',
  scale: 'Escalar volumen',
  deload: 'Descarga',
};

/** Límites del escalado (la API acepta ×0,2–×1,5): bajar 5–80 %, subir 5–50 %. */
const SCALE_LIMITS = { down: { min: 5, max: 80 }, up: { min: 5, max: 50 } } as const;

/** «−20 %» / «+15 %» a partir del `pct` del resultado (positivo = baja). */
function signedPct(pct: number): string {
  return pct > 0 ? `−${pct} %` : `+${Math.abs(pct)} %`;
}

/** Semanas de destino que se ofrecen al copiar (desde la siguiente a la de hoy). */
const COPY_TARGET_WEEKS = 12;

function skippedLine(res: WeekOpResult): string | undefined {
  if (res.skipped.length === 0) return undefined;
  const reasons = [...new Set(res.skipped.map((s) => s.reason.toLowerCase()))].join('; ');
  return `${res.skipped.length} sin tocar: ${reasons}.`;
}

export function WeekToolDialog({ tool, weekStart, onClose }: { tool: WeekTool; weekStart: string; onClose: () => void }) {
  const { shell, bumpCalendar } = useFicha();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [days, setDays] = useState('1');
  const [pct, setPct] = useState('20');
  const [direction, setDirection] = useState<'down' | 'up'>('down');
  const range = weekRangeLabel(weekStart);
  const base = `/api/coach/athletes/${shell.athlete_id}`;

  const thisMonday = useMemo(() => {
    const [y, m, d] = shell.today.split('-').map(Number) as [number, number, number];
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    return dt.toISOString().slice(0, 10);
  }, [shell.today]);
  const targets = useMemo(
    () =>
      Array.from({ length: COPY_TARGET_WEEKS }, (_, i) => addDaysIso(thisMonday, 7 * i))
        .filter((m) => m !== weekStart)
        .map((m) => ({ value: m, label: weekRangeLabel(m) })),
    [thisMonday, weekStart],
  );

  if (tool === 'evaluar') {
    return (
      <Sheet open onOpenChange={(o) => !o && onClose()} title="Evaluar semana" description={shell.name} size="lg">
        <EvaluarSemanaPanel athleteId={shell.athlete_id} />
      </Sheet>
    );
  }

  const run = async () => {
    setBusy(true);
    setError(null);
    const body =
      tool === 'copy'
        ? { op: 'copy', to_week_start: target }
        : tool === 'shift'
          ? { op: 'shift', days: Number(days) }
          : tool === 'scale'
            ? { op: 'scale', factor: direction === 'down' ? 1 - Number(pct) / 100 : 1 + Number(pct) / 100 }
            : { op: 'deload' };
    try {
      const { result } = await apiJson<{ result: WeekOpResult }>(`${base}/plan/semana/${weekStart}`, {
        method: 'POST',
        body,
      });
      bumpCalendar();
      onClose();
      if (tool === 'copy') {
        toast({
          title: `${result.created.length} ${result.created.length === 1 ? 'entreno copiado' : 'entrenos copiados'} a ${weekRangeLabel(target!)}`,
          description: skippedLine(result),
          tone: result.created.length > 0 ? 'ok' : 'warn',
          undo:
            result.created.length > 0
              ? async () => {
                  for (const c of result.created) {
                    await apiJson(`${base}/plan/day/${c.date}`, {
                      method: 'PATCH',
                      body: { kind: 'rest', assignment_id: Number(c.id) },
                    }).catch(() => undefined);
                  }
                  bumpCalendar();
                }
              : undefined,
        });
      } else if (tool === 'shift') {
        toast({
          title: `${result.moved.length} ${result.moved.length === 1 ? 'entreno movido' : 'entrenos movidos'} ${Number(days) > 0 ? '+' : ''}${days} d`,
          description: skippedLine(result),
          undo:
            result.moved.length > 0
              ? async () => {
                  for (const m of result.moved) {
                    await apiJson(`${base}/sessions/${m.id}/reschedule`, {
                      method: 'POST',
                      body: { to_iso_date: m.from },
                    }).catch(() => undefined);
                  }
                  bumpCalendar();
                }
              : undefined,
        });
      } else {
        toast({
          title:
            result.lines_changed > 0
              ? `Volumen ${signedPct(result.pct ?? 0)} en ${result.lines_changed} ${result.lines_changed === 1 ? 'línea' : 'líneas'}`
              : 'Nada que escalar',
          description:
            result.lines_changed > 0
              ? `Semana ${range}${result.factor != null ? ` · ×${String(Math.round(result.factor * 100) / 100).replace('.', ',')}` : ''}. La intensidad no cambia.`
              : 'Los entrenos pendientes no tienen series ni tiempos que escalar.',
          tone: result.lines_changed > 0 ? 'ok' : 'neutral',
        });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const invalid =
    (tool === 'copy' && !target) ||
    (tool === 'shift' && (!Number.isInteger(Number(days)) || Number(days) === 0 || Math.abs(Number(days)) > 14)) ||
    (tool === 'scale' && !(Number(pct) >= SCALE_LIMITS[direction].min && Number(pct) <= SCALE_LIMITS[direction].max));

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title={`${TITLE[tool]} · ${range}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void run()} loading={busy} disabled={invalid}>
            {tool === 'copy' ? 'Copiar' : tool === 'shift' ? 'Desplazar' : 'Aplicar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {tool === 'copy' ? (
          <>
            <p className="t-body text-v2-muted">
              Cada entreno se copia al mismo día de la semana de destino, con su copia propia. La semana de destino
              tiene que tener programa asignado.
            </p>
            <Field label="Copiar a la semana">
              {({ id }) => (
                <Select id={id} options={targets} value={target} onValueChange={setTarget} placeholder="Elegir semana…" />
              )}
            </Field>
          </>
        ) : tool === 'shift' ? (
          <>
            <p className="t-body text-v2-muted">
              Mueve los entrenos pendientes de esta semana. Lo que ya hizo no se mueve, y nada cae en un día pasado.
            </p>
            <Field label="Días (negativo = antes)">
              {({ id, describedBy }) => (
                <Input id={id} aria-describedby={describedBy} type="number" min={-14} max={14} step={1} value={days} onChange={(e) => setDays(e.target.value)} size="lg" />
              )}
            </Field>
          </>
        ) : tool === 'scale' ? (
          <>
            <p className="t-body text-v2-muted">
              Series o rondas, o tiempo o distancia en un trabajo continuo. La intensidad no se toca. Solo entrenos
              pendientes.
            </p>
            <SegmentedControl
              aria-label="Sentido"
              value={direction}
              onValueChange={setDirection}
              items={[
                { value: 'down', label: 'Reducir' },
                { value: 'up', label: 'Aumentar' },
              ]}
              className="self-start"
            />
            <Field
              label={direction === 'down' ? 'Reducir un' : 'Aumentar un'}
              hint={`Entre ${SCALE_LIMITS[direction].min} y ${SCALE_LIMITS[direction].max} %.`}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="number"
                  min={SCALE_LIMITS[direction].min}
                  max={SCALE_LIMITS[direction].max}
                  step={5}
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  trailing="%"
                  size="lg"
                />
              )}
            </Field>
          </>
        ) : (
          <p className="t-body text-v2-muted">
            Reduce el volumen de los entrenos pendientes de esta semana con tu porcentaje de descarga (Ajustes ›
            Método). La intensidad no se toca.
          </p>
        )}
        {error ? (
          <p role="alert" className="t-body-sm text-v2-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
