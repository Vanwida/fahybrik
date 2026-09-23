'use client';

// Lista de espera (#18): quien terminó el formulario con el cupo lleno, por
// orden de llegada. Al quedar una plaza se avisa sola al primero; «Dar plaza»
// se salta el orden y le manda el enlace para reservar la llamada.

import { useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { leadShortLabel } from '@fahybrid/shared/domain/leads/questions';
import { Avatar, Button, List, ListRow, SectionHeader, StatusBadge, useToast } from '@/components/v2/ui';
import type { WaitlistEntry } from '@/lib/leads/waitlist';
import { formatRelative } from '@/lib/dashboard/relative-time';

export function WaitlistList({ entries }: { entries: WaitlistEntry[] }) {
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const release = async (leadId: string, name: string) => {
    setBusy(leadId);
    try {
      const res = await fetch(`/api/coach/leads/${leadId}/release-waitlist`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (res.ok) toast.toast({ title: `Plaza para ${name}`, description: 'Le hemos mandado el enlace para reservar.', tone: 'ok' });
      else if (res.status === 502)
        toast.toast({
          title: `Plaza para ${name}, pero el correo no ha salido`,
          description: 'Escríbele tú el enlace de reserva.',
          tone: 'warn',
        });
      else if (res.status === 409) toast.toast({ title: `${name} ya no está en la lista de espera`, tone: 'info' });
      else toast.toast({ title: 'No se ha podido dar la plaza', tone: 'danger' });
      startTransition(() => router.refresh());
    } catch {
      toast.toast({ title: 'Sin conexión. No se ha dado la plaza.', tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Lista de espera" count={entries.length} />
      <List aria-label="Lista de espera">
        {entries.map((e) => {
          const name = e.nombre?.trim() || e.email;
          const meta = [leadShortLabel('objetivo', e.objetivo), leadShortLabel('nivel', e.nivel)].filter(Boolean).join(' · ');
          return (
            <ListRow
              key={e.lead_id}
              density="compact"
              href={`/${locale}/negocio/leads/${e.lead_id}`}
              leading={
                <span className="flex items-center gap-2">
                  <span className="w-5 text-right t-meta text-v2-faint t-tnum">{e.position}</span>
                  <Avatar name={name} size="md" />
                </span>
              }
              title={name}
              detail={`${meta ? `${meta} · ` : ''}esperando desde ${formatRelative(e.waitlisted_at)}`}
              trailing={
                e.released_at ? (
                  <StatusBadge tone="ok" label="Avisado" size="sm" />
                ) : (
                  <Button size="sm" loading={busy === e.lead_id} disabled={busy !== null} onClick={() => void release(e.lead_id, name)}>
                    Dar plaza
                  </Button>
                )
              }
            />
          );
        })}
      </List>
    </section>
  );
}
