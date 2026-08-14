'use client';

// WaitlistQueueCard → "Lista de espera": the coach's capacity overflow (#18). When
// the coach is at their athlete cap, a lead that finishes onboarding joins this FIFO
// queue instead of booking a call. Each row shows the lead's place, contact and wait
// time; the coach MANUALLY releases a plaza (POST …/release-waitlist), which stamps
// the release + emails the lead their booking link. An already-released lead keeps
// its place but shows "Avisado" instead of the button. Modeled on PendingCitasCard.
// The parent only renders this when there is at least one waitlisted lead.

import { useState, useTransition } from 'react';
import { Link } from '@/i18n/navigation';
import { useRouter } from 'next/navigation';
import { leadShortLabel } from '@fahybrid/shared/domain/leads/questions';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/v2/Pill';
import { CitaActionButton } from '@/components/v2/citas/CitaActionButton';
import { formatRelative } from '@/lib/dashboard/relative-time';
import type { WaitlistEntry } from '@/lib/leads/waitlist';

// Per-row feedback after a release attempt (honest about the durable-release / failed-email
// case): the release is committed, but the coach owes the notification manually.
interface RowNote {
  lead_id: string;
  tone: 'warn' | 'danger';
  text: string;
}

export function WaitlistQueueCard({ entries }: { entries: WaitlistEntry[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<RowNote | null>(null);

  async function release(leadId: string) {
    if (busyId) return;
    setBusyId(leadId);
    setNote(null);
    try {
      const res = await fetch(`/api/coach/leads/${leadId}/release-waitlist`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (res.ok) {
        // 200 — plaza released AND the lead was emailed their booking link.
        startTransition(() => router.refresh());
      } else if (res.status === 502) {
        // Release is DURABLE (stamped) but the email didn't go out — surface it honestly
        // so the coach reaches out manually, and still refresh (the row flips to "Avisado").
        setNote({
          lead_id: leadId,
          tone: 'warn',
          text: 'Plaza liberada, pero no pudimos enviarle el email. Escríbele tú el enlace de reserva.',
        });
        startTransition(() => router.refresh());
      } else if (res.status === 409) {
        setNote({ lead_id: leadId, tone: 'danger', text: 'Este lead ya no está en lista de espera.' });
        startTransition(() => router.refresh());
      } else {
        setNote({ lead_id: leadId, tone: 'danger', text: 'No se pudo liberar la plaza. Reintenta.' });
      }
    } catch {
      setNote({ lead_id: leadId, tone: 'danger', text: 'Error de red. Reintenta.' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <MIcon name="hourglass_top" size={18} className="text-[color:var(--v2-accent)]" />
          <h2 className="text-sm font-semibold text-[color:var(--v2-fg)]">Lista de espera</h2>
          <Pill tone="warn" variant="soft">
            <span className="v2-num">{entries.length}</span>
          </Pill>
        </div>
        <Link
          href="/disponibilidad"
          className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="tune" size={15} />
          Cupo
        </Link>
      </div>

      <ul>
        {entries.map((e) => {
          const name = e.nombre?.trim() || e.email;
          const meta = [
            leadShortLabel('objetivo', e.objetivo),
            leadShortLabel('nivel', e.nivel),
            leadShortLabel('ubicacion', e.ubicacion),
          ]
            .filter(Boolean)
            .join(' · ');
          const released = e.released_at != null;
          const rowNote = note?.lead_id === e.lead_id ? note : null;

          return (
            <li
              key={e.lead_id}
              className="flex flex-col gap-2 border-b border-[color:var(--v2-border)] px-3 py-2.5 last:border-b-0"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2.5">
                  {/* FIFO place badge — dimmed once the plaza has been released. */}
                  <span
                    aria-hidden="true"
                    className={
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
                      (released
                        ? 'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-faint)]'
                        : 'bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]')
                    }
                  >
                    <span className="v2-num">{e.position}</span>
                  </span>
                  <Link
                    href={`/leads/${e.lead_id}`}
                    className="v2-focus group flex min-w-0 items-center gap-2.5 rounded-[var(--v2-r-s)]"
                  >
                    <AthleteAvatar name={name} size="sm" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)] transition-colors group-hover:text-[color:var(--v2-accent)]">
                        {name}
                      </span>
                      <span className="truncate text-label text-[color:var(--v2-muted)]">
                        {meta ? `${meta} · ` : ''}en espera desde {formatRelative(e.waitlisted_at)}
                      </span>
                    </span>
                  </Link>
                </div>

                <div className="flex shrink-0 items-center gap-2 pl-10 sm:pl-0">
                  {released ? (
                    <Pill tone="ok" variant="soft">
                      <MIcon name="check" size={13} />
                      Avisado
                    </Pill>
                  ) : (
                    <CitaActionButton
                      label="Liberar plaza"
                      icon="how_to_reg"
                      tone="accent"
                      spinning={busyId === e.lead_id}
                      disabled={busyId != null}
                      onClick={() => void release(e.lead_id)}
                    />
                  )}
                </div>
              </div>

              {rowNote ? (
                <p
                  role="alert"
                  className="pl-10 text-label font-medium sm:pl-0"
                  style={{ color: `var(--v2-${rowNote.tone})` }}
                >
                  {rowNote.text}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Hybrid model (#18): the queue auto-releases in FIFO order; the manual button overrides it. */}
      <p className="border-t border-[color:var(--v2-border)] px-3 py-2 text-label leading-relaxed text-[color:var(--v2-muted)]">
        Automático: cuando se libera una plaza avisamos al primero de la cola. «Liberar plaza» se
        salta el orden.
      </p>
    </Card>
  );
}
