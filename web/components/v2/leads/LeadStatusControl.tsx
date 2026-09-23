'use client';

// Mover un lead por el embudo: solo hacia delante (nuevo → contactado →
// agendado) o a descartado; un descartado se puede reabrir. «Convertido» lo
// pone el alta, nunca un botón. PATCH /api/coach/leads/{id} y refresco.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, Phone, RotateCcw, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, useToast } from '@/components/v2/ui';
import { LEAD_STATUS_META, leadStatusAllowedNext, type LeadStatus } from '@/lib/dashboard/coach/leads-status';
import { readApiError } from '@/components/v2/ajustes/autosave';

const ACTION: Partial<Record<LeadStatus, { label: string; icon: LucideIcon }>> = {
  contactado: { label: 'Marcar contactado', icon: Phone },
  agendado: { label: 'Cita agendada', icon: CalendarCheck },
  descartado: { label: 'Descartar', icon: X },
};

export function LeadStatusControl({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState<LeadStatus | null>(null);

  const move = async (to: LeadStatus, previous: LeadStatus = status) => {
    setSaving(to);
    try {
      const res = await fetch(`/api/coach/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: to }),
      });
      if (!res.ok) {
        toast.toast({ title: 'No se ha podido mover el lead', description: await readApiError(res, ''), tone: 'danger' });
        return;
      }
      toast.toast({
        title: `Movido a «${LEAD_STATUS_META[to].label}»`,
        tone: 'ok',
        // Descartar se deshace reabriendo; avanzar no tiene vuelta (el embudo no retrocede).
        undo: to === 'descartado' && previous !== 'descartado' ? () => void move('nuevo', 'descartado') : undefined,
      });
      startTransition(() => router.refresh());
    } catch {
      toast.toast({ title: 'Sin conexión. No se ha movido.', tone: 'danger' });
    } finally {
      setSaving(null);
    }
  };

  if (status === 'convertido') return null;
  if (status === 'descartado') {
    return (
      <Button icon={RotateCcw} loading={saving === 'nuevo'} disabled={pending} onClick={() => void move('nuevo')}>
        Reabrir
      </Button>
    );
  }
  return (
    <>
      {leadStatusAllowedNext(status).map((to) => {
        const a = ACTION[to];
        if (!a) return null;
        return (
          <Button
            key={to}
            variant={to === 'descartado' ? 'ghost' : 'secondary'}
            icon={a.icon}
            loading={saving === to}
            disabled={saving !== null || pending}
            onClick={() => void move(to)}
          >
            {a.label}
          </Button>
        );
      })}
    </>
  );
}
