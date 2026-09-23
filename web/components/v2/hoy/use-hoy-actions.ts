'use client';

// Las acciones de Hoy, OPTIMISTAS: la fila se va (y la cifra de cabecera baja) en
// cuanto el coach pulsa; si el servidor falla vuelve con un aviso de error. Cada
// acción confirma con un aviso con «Deshacer» (⌘Z), que manda a la API
// exactamente lo que ella devolvió. Tras cada cambio confirmado, `refresh()`
// trae la bandeja (y la insignia de la barra lateral) del servidor.
//
//   posponer / hecho       → POST /api/coach/inbox/bulk (1 o N atletas)
//   reabrir (pie)          → la misma API, `undo` con `previous: null`
//   proponer descarga      → POST /api/coach/athletes/[id]/week-adjustment/propose
//                            (deshacer = rechazar esa propuesta). Si el motor
//                            contesta «mantener», la fila lo dice y ofrece Hecho.
//   recordar pagos         → POST /api/coach/messages/broadcast, uno por atleta con
//                            su nombre (se confirma antes, como Publicar)
//   publicar a los N       → POST /api/coach/weeks/publish (sin deshacer: ya les
//                            ha llegado el aviso; por eso se confirma antes)
//   mensaje a N            → POST /api/coach/messages/broadcast

import { useCallback, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { BulkWeekPublishResult } from '@fahybrid/shared/schema/week-publishing';
import type { HoyProposal, HoyRow, SystemicGroup } from '@/lib/dashboard/hoy/hoy-types';
import { useToast } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { weekdayDate } from '@/components/v2/shared/format';
import type { SnoozeUntil } from '@/components/v2/shared/SnoozeMenu';
import {
  groupKey,
  overrideTargets,
  prunePending,
  reopenPayload,
  type PendingKind,
  type PendingRow,
  type ReopenTarget,
} from './hoy-model';
import { untilLabel } from './hoy-format';
import { paymentReminderText } from './payment-reminder';

interface OverrideResult {
  applied: number;
  until_at: string | null;
  undo: { action: 'undo'; restore: unknown[] };
}

interface ProposalResult {
  proposal: { id: string; proposal: { recommendation: 'keep' | 'soften' | 'swap' | 'rest_day'; coach_summary: string } };
}

function who(rows: ReadonlyArray<Pick<HoyRow, 'name'>>): string {
  return rows.length === 1 ? rows[0]!.name : `${rows.length} atletas`;
}

export function useHoyActions({ generatedAt }: { generatedAt: string }) {
  const router = useRouter();
  const { toast, dismiss } = useToast();
  // El aviso con «Deshacer» de cada atleta: si se reabre desde el pie, se retira.
  const undoToasts = useRef(new Map<string, string>());
  const [pending, setPending] = useState<Map<string, PendingRow>>(() => new Map());
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(() => new Set());
  // Lo que contestó el motor a «Proponer descarga» en esta visita (gana a la fila).
  const [proposals, setProposals] = useState<Map<string, HoyProposal | 'enviando'>>(() => new Map());
  const setProposal = useCallback((id: string, value: HoyProposal | 'enviando' | null) => {
    setProposals((prev) => {
      const next = new Map(prev);
      if (value == null) next.delete(id);
      else next.set(id, value);
      return next;
    });
  }, []);

  const refresh = useCallback(() => router.refresh(), [router]);

  // Llega una bandeja nueva del servidor: se olvida lo que ya refleja (ajuste de
  // estado durante el render, sin efecto: https://react.dev/learn/you-might-not-need-an-effect).
  const [seenAt, setSeenAt] = useState(generatedAt);
  if (seenAt !== generatedAt) {
    setSeenAt(generatedAt);
    const generated = Date.parse(generatedAt);
    setPending((prev) => (prev.size === 0 ? prev : prunePending(prev, generated, generated)));
    setHiddenGroups((prev) => (prev.size === 0 ? prev : new Set()));
  }

  const mark = useCallback((rows: ReadonlyArray<HoyRow>, kind: PendingKind) => {
    setPending((prev) => {
      const next = new Map(prev);
      for (const row of rows) next.set(row.athlete_id, { kind, row, until: null, settled_at: null });
      return next;
    });
  }, []);

  const unmark = useCallback((ids: ReadonlyArray<string>) => {
    setPending((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const settle = useCallback((ids: ReadonlyArray<string>, until: string | null) => {
    const at = Date.now();
    setPending((prev) => {
      const next = new Map(prev);
      for (const id of ids) {
        const p = next.get(id);
        if (p) next.set(id, { ...p, until, settled_at: at });
      }
      return next;
    });
  }, []);

  const undoOverride = useCallback(
    async (payload: OverrideResult['undo'], ids: ReadonlyArray<string>) => {
      unmark(ids);
      try {
        await apiJson('/api/coach/inbox/bulk', { method: 'POST', body: payload });
      } catch (err) {
        toast({ title: 'No se ha podido deshacer', description: errorMessage(err), tone: 'danger' });
      } finally {
        refresh();
      }
    },
    [refresh, toast, unmark],
  );

  /** Posponer (1 d · 3 d · hasta nueva señal) o marcar hecho una o varias filas. */
  const override = useCallback(
    async (rows: ReadonlyArray<HoyRow>, kind: PendingKind, until: SnoozeUntil = 'signal'): Promise<boolean> => {
      if (rows.length === 0) return false;
      const ids = rows.map((r) => r.athlete_id);
      mark(rows, kind);
      try {
        const res = await apiJson<OverrideResult>('/api/coach/inbox/bulk', {
          method: 'POST',
          body:
            kind === 'done'
              ? { action: 'done', items: overrideTargets(rows) }
              : { action: 'snooze', items: overrideTargets(rows), until },
        });
        settle(ids, res.until_at);
        refresh();
        const canUndo = res.undo.restore.length > 0;
        const toastId = toast({
          title:
            kind === 'done'
              ? `${who(rows)} · hecho`
              : `${who(rows)} · ${rows.length === 1 ? 'pospuesto' : 'pospuestos'} ${untilLabel(until === 'signal' ? null : res.until_at)}`,
          tone: kind === 'done' ? 'ok' : 'neutral',
          undo: canUndo ? () => undoOverride(res.undo, ids) : undefined,
        });
        for (const id of ids) undoToasts.current.set(id, toastId);
        return true;
      } catch (err) {
        unmark(ids);
        toast({
          title: kind === 'done' ? 'No se ha podido marcar como hecho' : 'No se ha podido posponer',
          description: errorMessage(err),
          tone: 'danger',
        });
        return false;
      }
    },
    [mark, refresh, settle, toast, undoOverride, unmark],
  );

  /** Reabre lo pospuesto o resuelto (pie): quita sus overrides y la fila vuelve. */
  const reopen = useCallback(
    async (targets: ReadonlyArray<ReopenTarget>, name: string): Promise<void> => {
      if (targets.length === 0) return;
      const ids = [...new Set(targets.map((t) => t.athlete_id))];
      unmark(ids);
      for (const id of ids) {
        const t = undoToasts.current.get(id);
        if (t) dismiss(t);
        undoToasts.current.delete(id);
      }
      try {
        await apiJson('/api/coach/inbox/bulk', { method: 'POST', body: reopenPayload(targets) });
        refresh();
        toast({ title: `${name} vuelve a la bandeja` });
      } catch (err) {
        toast({ title: 'No se ha podido reabrir', description: errorMessage(err), tone: 'danger' });
      }
    },
    [dismiss, refresh, toast, unmark],
  );

  /**
   * «Proponer descarga»: el motor evalúa (con la señal que la pidió) y crea la
   * propuesta. Si contesta «mantener», la fila enseña su motivo y ofrece Hecho.
   */
  const proposeDeload = useCallback(
    async (row: Pick<HoyRow, 'athlete_id' | 'name'>): Promise<void> => {
      const id = row.athlete_id;
      setProposal(id, 'enviando');
      try {
        const res = await apiJson<ProposalResult>(`/api/coach/athletes/${id}/week-adjustment/propose`, {
          method: 'POST',
          body: {},
        });
        const p = res.proposal;
        const keep = p.proposal.recommendation === 'keep';
        setProposal(id, {
          id: p.id,
          outcome: keep ? 'mantener' : 'propuesta',
          summary: p.proposal.coach_summary || (keep ? 'Su semana no pide cambios' : ''),
        });
        refresh();
        if (keep) {
          toast({ title: `${row.name}: el motor no propone cambios`, description: p.proposal.coach_summary || undefined });
          return;
        }
        toast({
          title: `Descarga propuesta para ${row.name}`,
          description: 'Revísala y apruébala en su ficha.',
          tone: 'ok',
          action: { label: 'Ver', onClick: () => router.push(`/atletas/${id}`) },
          undo: async () => {
            try {
              await apiJson(`/api/coach/athletes/${id}/week-adjustment/${p.id}/reject`, { method: 'POST', body: {} });
              setProposal(id, null);
            } catch (err) {
              toast({ title: 'No se ha podido retirar la propuesta', description: errorMessage(err), tone: 'danger' });
            } finally {
              refresh();
            }
          },
        });
      } catch (err) {
        setProposal(id, null);
        toast({ title: 'No se ha podido proponer la descarga', description: errorMessage(err), tone: 'danger' });
      }
    },
    [refresh, router, setProposal, toast],
  );

  /**
   * «Recordar pagos» (ya confirmado): a cada atleta, un mensaje suyo en su chat
   * con su nombre. El grupo sigue hasta que paguen (el pago lo cierra, no el aviso).
   */
  const remindPayments = useCallback(
    async (people: ReadonlyArray<{ athlete_id: string; name: string }>): Promise<void> => {
      if (people.length === 0) return;
      try {
        const results = await Promise.all(
          people.map((p) =>
            apiJson<{ sent: number; failed: number }>('/api/coach/messages/broadcast', {
              method: 'POST',
              body: { athlete_ids: [p.athlete_id], body: paymentReminderText(p.name) },
            }).then(
              (r) => r.sent > 0,
              () => false,
            ),
          ),
        );
        const ok = results.filter(Boolean).length;
        refresh();
        toast(
          ok === people.length
            ? { title: ok === 1 ? `Recordatorio enviado a ${people[0]!.name}` : `Recordatorio enviado a ${ok}`, tone: 'ok' }
            : { title: `Enviado a ${ok} de ${people.length}`, description: 'Vuelve a probar con los que faltan.', tone: 'warn' },
        );
      } catch (err) {
        toast({ title: 'No se ha podido enviar', description: errorMessage(err), tone: 'danger' });
      }
    },
    [refresh, toast],
  );

  /** «Publicar a los N» (ya confirmado): la fila del grupo se va al momento. */
  const publishGroup = useCallback(
    async (group: SystemicGroup): Promise<void> => {
      if (!group.week_start) return;
      const key = groupKey(group);
      setHiddenGroups((prev) => new Set(prev).add(key));
      try {
        const res = await apiJson<BulkWeekPublishResult>('/api/coach/weeks/publish', {
          method: 'POST',
          body: { athlete_ids: group.athlete_ids, week_start: group.week_start },
        });
        refresh();
        toast({
          title:
            res.published === 0
              ? 'Ya la veían todos'
              : `Semana del ${weekdayDate(group.week_start)} publicada a ${res.published}`,
          description: res.already_visible > 0 && res.published > 0 ? `${res.already_visible} ya la veían.` : undefined,
          tone: res.published > 0 ? 'ok' : 'neutral',
        });
      } catch (err) {
        setHiddenGroups((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        toast({ title: 'No se ha podido publicar', description: errorMessage(err), tone: 'danger' });
      }
    },
    [refresh, toast],
  );

  /** «Mensaje a N»: el mismo texto, cada uno en su conversación. */
  const broadcast = useCallback(
    async (ids: ReadonlyArray<string>, body: string): Promise<boolean> => {
      try {
        const res = await apiJson<{ sent: number; failed: number }>('/api/coach/messages/broadcast', {
          method: 'POST',
          body: { athlete_ids: ids, body },
        });
        refresh();
        toast({
          title: res.sent === 1 ? 'Mensaje enviado' : `Mensaje enviado a ${res.sent}`,
          description: res.failed > 0 ? `${res.failed} no se han podido enviar. Vuelve a probar con ellos.` : undefined,
          tone: res.failed > 0 ? 'warn' : 'ok',
        });
        return res.failed === 0;
      } catch (err) {
        toast({ title: 'No se ha podido enviar', description: errorMessage(err), tone: 'danger' });
        return false;
      }
    },
    [refresh, toast],
  );

  return {
    pending,
    hiddenGroups,
    proposals,
    override,
    reopen,
    proposeDeload,
    remindPayments,
    publishGroup,
    broadcast,
    refresh,
  };
}
