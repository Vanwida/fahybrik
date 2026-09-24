'use client';

// La ficha de un lead en un panel a la derecha: la lista sigue a la vista y
// J/K cambian de lead. Orden = lo que el coach hace con él: qué toca (mover,
// convertir), la llamada, sus partes, cómo contactarle, lo que contestó y quién
// lo ha movido. Cerrar (Esc o ✕) vuelve a /negocio/leads.

import { useState, type ReactNode } from 'react';
import { Mail, Phone } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { SectionHeader, Sheet, StatusBadge, buttonVariants } from '@/components/v2/ui';
import { SessionReportsBlock } from '@/components/v2/sessions/SessionReportsBlock';
import { LeadCitaBlock } from '@/components/v2/citas/LeadCitaBlock';
import { LEAD_STATUS_META } from '@/lib/dashboard/coach/leads-status';
import type { CoachLevelOption, LeadDetail } from '@/lib/dashboard/coach/leads';
import { formatRelative } from '@/lib/dashboard/relative-time';
import { LeadStatusControl } from './LeadStatusControl';
import { LeadAltaControl } from './LeadAltaControl';
import { LEAD_TONE, leadName } from './lead-ui';
import { useCoachTimeZone, zonedFormat } from '@/lib/coach/coach-timezone-context';

const DAY: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-v2-border pt-4 first:border-t-0 first:pt-0">
      <SectionHeader title={title} />
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-baseline gap-3 py-1">
      <dt className="t-body-sm text-v2-muted">{label}</dt>
      <dd className="min-w-0 t-body text-v2-fg">{children}</dd>
    </div>
  );
}

const dash = <span className="text-v2-faint">—</span>;

export function LeadPanel({
  lead,
  levels,
  axisLabel,
  stripeConfigured,
}: {
  lead: LeadDetail;
  levels: CoachLevelOption[];
  axisLabel: string;
  stripeConfigured: boolean;
}) {
  const router = useRouter();
  const DAY_FMT = zonedFormat(useCoachTimeZone(), 'es-ES', DAY);
  const day = (iso: string) => DAY_FMT.format(new Date(iso)).replace('.', '');
  const [completedTick, setCompletedTick] = useState(0);
  const meta = LEAD_STATUS_META[lead.status];
  const name = leadName(lead);

  return (
    <Sheet
      open
      modal={false}
      size="lg"
      onOpenChange={(o) => {
        if (!o) router.push('/negocio/leads');
      }}
      title={name}
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusBadge tone={LEAD_TONE[meta.tone]} label={meta.label} size="sm" />
          <span className="t-meta text-v2-faint">llegó {formatRelative(lead.created_at)}</span>
        </span>
      }
      actions={
        <>
          <a href={`mailto:${lead.email}`} aria-label={`Escribir a ${name}`} className={buttonVariants({ variant: 'ghost', className: 'w-8 px-0' })}>
            <Mail aria-hidden strokeWidth={1.75} />
          </a>
          {lead.telefono ? (
            <a href={`tel:${lead.telefono}`} aria-label={`Llamar a ${name}`} className={buttonVariants({ variant: 'ghost', className: 'w-8 px-0' })}>
              <Phone aria-hidden strokeWidth={1.75} />
            </a>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {lead.is_partial ? (
          <StatusBadge tone="warn" variant="soft" label="No terminó el formulario: faltan respuestas y el teléfono" />
        ) : null}

        <Section title="Qué toca">
          <div className="flex flex-wrap items-center gap-2">
            <LeadAltaControl
              leadId={lead.id}
              status={lead.status}
              alta={lead.alta}
              levels={levels}
              axisLabel={axisLabel}
              stripeConfigured={stripeConfigured}
            />
            <LeadStatusControl leadId={lead.id} status={lead.status} />
          </div>
        </Section>

        <Section title="Llamada">
          <LeadCitaBlock appointment={lead.appointment} onCompleted={() => setCompletedTick((t) => t + 1)} />
        </Section>

        <Section title="Partes de las llamadas">
          <SessionReportsBlock
            subject={{ lead_id: lead.id }}
            sessions={lead.sessions}
            appointmentId={lead.appointment?.id ?? null}
            isLead
            autoOpenTick={completedTick}
          />
        </Section>

        <Section title="Contacto">
          <dl>
            <Row label="Correo">
              <a href={`mailto:${lead.email}`} className="break-all underline-offset-2 hover:underline">
                {lead.email}
              </a>
            </Row>
            <Row label="Teléfono">
              {lead.telefono?.trim() ? (
                <a href={`tel:${lead.telefono}`} className="t-tnum underline-offset-2 hover:underline">
                  {lead.telefono}
                </a>
              ) : (
                dash
              )}
            </Row>
            <Row label="Edad">{lead.edad != null ? <span className="t-tnum">{lead.edad}</span> : dash}</Row>
            <Row label="Sexo">{lead.sexo_label || dash}</Row>
            <Row label="Dónde">{lead.ubicacion_label || dash}</Row>
            <Row label="Objetivo">{lead.objetivo_label || dash}</Row>
            <Row label="Nivel que dice">{lead.nivel_label || dash}</Row>
            <Row label="Días por semana">{lead.dias_label || dash}</Row>
            <Row label="Consentimiento">
              {lead.consent_rgpd ? `Sí${lead.consent_at ? `, el ${day(lead.consent_at)}` : ''}` : 'No'}
            </Row>
          </dl>
        </Section>

        <Section title="Respuestas del formulario">
          {lead.summary.length === 0 ? (
            <p className="t-body-sm text-v2-faint">No contestó ninguna pregunta.</p>
          ) : (
            lead.summary.map((g) => (
              <div key={g.block} className="flex flex-col gap-0.5">
                <h4 className="t-body-sm font-medium text-v2-muted">{g.label}</h4>
                <dl>
                  {g.rows.map((r, i) => (
                    <Row key={i} label={r.question}>
                      {r.answer}
                    </Row>
                  ))}
                </dl>
              </div>
            ))
          )}
        </Section>

        {lead.timeline.length > 0 ? (
          <Section title="Historial">
            <ol className="flex flex-col gap-1.5">
              {lead.timeline.map((ev, i) => {
                const to = (LEAD_STATUS_META as Record<string, { label: string }>)[ev.to_status]?.label ?? ev.to_status;
                const who = ev.changed_by_name ?? (ev.changed_by_kind === 'lead' ? 'El lead' : 'El sistema');
                return (
                  <li key={`${ev.created_at}-${i}`} className="flex items-baseline justify-between gap-3 t-body-sm">
                    <span className="text-v2-fg">
                      {who} {ev.from_status == null ? 'lo abrió' : `lo movió a «${to}»`}
                    </span>
                    <span className="shrink-0 t-meta text-v2-faint t-tnum">{day(ev.created_at)}</span>
                  </li>
                );
              })}
            </ol>
          </Section>
        ) : null}
      </div>
    </Sheet>
  );
}
