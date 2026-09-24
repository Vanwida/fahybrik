'use client';

// Posponer / Hecho sobre la fila de un atleta (Hoy, vistazo, Mensajes).
//
//   <SnoozeMenu athleteId="11" name="Marc Vidal" onChange={refresh} />
//       «Posponer ▾» → Hasta nueva señal (defecto) · 1 día · 3 días
//   const { snooze, done } = useSnooze();   // para los atajos H y E de Hoy
//   await snooze({ athleteId, name, until: 'signal' });
//
// Sin `signalKind` actúa sobre toda la fila (sus señales accionables, menos las
// que resuelve un grupo de Hoy); con `signalKind`, solo sobre esa (p. ej. «Hecho»
// en un hilo de Mensajes = `message_unanswered`). Cada acción confirma con un
// aviso con «Deshacer», que manda de vuelta exactamente lo que devolvió la API.
// Necesita <PanelProviders> por encima (useToast).

import { useCallback, useState } from 'react';
import { Check, ChevronDown, Clock } from 'lucide-react';
import type { SignalKind } from '@fahybrid/shared/domain/coach/signals';
import { Button, Menu, useToast, type ButtonSize } from '@/components/v2/ui';
import { apiJson, errorMessage } from './api';
import { weekdayDate } from './format';

export type SnoozeUntil = '1d' | '3d' | 'signal';

interface OverrideResult {
  applied: number;
  until_at: string | null;
  undo: { action: 'undo'; restore: unknown[] };
}

export interface SnoozeTarget {
  athleteId: string;
  /** Para el aviso («Marc Vidal pospuesto»). */
  name?: string;
  signalKind?: SignalKind;
}

const UNTIL_LABEL: Record<SnoozeUntil, string> = {
  signal: 'Hasta nueva señal',
  '1d': '1 día',
  '3d': '3 días',
};

function untilText(until: SnoozeUntil, until_at: string | null): string {
  if (until === 'signal' || !until_at) return 'hasta nueva señal';
  return `hasta el ${weekdayDate(until_at.slice(0, 10))}`;
}

/**
 * Las dos acciones con su aviso y su deshacer. `onChange` se llama tras cada
 * cambio confirmado (acción o deshacer) para que la pantalla recargue.
 */
export function useSnooze(onChange?: () => void) {
  const { toast } = useToast();

  const undo = useCallback(
    async (payload: OverrideResult['undo']) => {
      try {
        await apiJson('/api/coach/inbox/snooze', { method: 'POST', body: payload });
        onChange?.();
      } catch (err) {
        toast({ title: 'No se ha podido deshacer', description: errorMessage(err), tone: 'danger' });
      }
    },
    [onChange, toast],
  );

  const snooze = useCallback(
    async (target: SnoozeTarget & { until: SnoozeUntil }): Promise<boolean> => {
      try {
        const res = await apiJson<OverrideResult>('/api/coach/inbox/snooze', {
          method: 'POST',
          body: {
            action: 'snooze',
            athlete_id: target.athleteId,
            until: target.until,
            ...(target.signalKind ? { signal_kind: target.signalKind } : {}),
          },
        });
        onChange?.();
        if (res.applied === 0) {
          toast({ title: 'No había nada que posponer', description: target.name });
          return true;
        }
        toast({
          title: `${target.name ?? 'Pospuesto'}${target.name ? ' · pospuesto' : ''} ${untilText(target.until, res.until_at)}`,
          undo: () => undo(res.undo),
        });
        return true;
      } catch (err) {
        toast({ title: 'No se ha podido posponer', description: errorMessage(err), tone: 'danger' });
        return false;
      }
    },
    [onChange, toast, undo],
  );

  const done = useCallback(
    async (target: SnoozeTarget): Promise<boolean> => {
      try {
        const res = await apiJson<OverrideResult>('/api/coach/inbox/snooze', {
          method: 'POST',
          body: {
            action: 'done',
            athlete_id: target.athleteId,
            ...(target.signalKind ? { signal_kind: target.signalKind } : {}),
          },
        });
        onChange?.();
        if (res.applied === 0) {
          toast({ title: 'No había nada pendiente', description: target.name });
          return true;
        }
        toast({ title: target.name ? `${target.name} · hecho` : 'Hecho', tone: 'ok', undo: () => undo(res.undo) });
        return true;
      } catch (err) {
        toast({ title: 'No se ha podido marcar como hecho', description: errorMessage(err), tone: 'danger' });
        return false;
      }
    },
    [onChange, toast, undo],
  );

  return { snooze, done };
}

/** «Posponer ▾». `withDone` añade el botón «Hecho» al lado. */
export function SnoozeMenu({
  athleteId,
  name,
  signalKind,
  onChange,
  withDone = false,
  size = 'sm',
  variant = 'ghost',
  disabled,
}: SnoozeTarget & {
  onChange?: () => void;
  withDone?: boolean;
  size?: ButtonSize;
  variant?: 'ghost' | 'secondary';
  disabled?: boolean;
}) {
  const { snooze, done } = useSnooze(onChange);
  const [busy, setBusy] = useState<null | 'snooze' | 'done'>(null);
  const run = async (kind: 'snooze' | 'done', fn: () => Promise<boolean>) => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  const pick = (until: SnoozeUntil) => () => void run('snooze', () => snooze({ athleteId, name, signalKind, until }));

  return (
    <span className="inline-flex items-center gap-1">
      <Menu
        align="end"
        width="min-w-44"
        trigger={
          <Button
            size={size}
            variant={variant}
            icon={Clock}
            iconEnd={ChevronDown}
            loading={busy === 'snooze'}
            disabled={disabled}
          >
            Posponer
          </Button>
        }
        items={[
          { label: UNTIL_LABEL.signal, onSelect: pick('signal'), shortcut: 'H' },
          { label: UNTIL_LABEL['1d'], onSelect: pick('1d') },
          { label: UNTIL_LABEL['3d'], onSelect: pick('3d') },
        ]}
      />
      {withDone ? (
        <Button
          size={size}
          variant={variant}
          icon={Check}
          loading={busy === 'done'}
          disabled={disabled}
          onClick={() => void run('done', () => done({ athleteId, name, signalKind }))}
        >
          Hecho
        </Button>
      ) : null}
    </span>
  );
}
