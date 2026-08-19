'use client';

// LeadDetalle — the lead detail screen. A back link + an identity header band
// (avatar · name · status · contact subline · a meta cluster of Objetivo / Nivel /
// Días / Categoría), a soft warning when the onboarding was abandoned, the pipeline
// status control + the alta seam (where the lead becomes an athlete — task #5), a
// contacto card, and the full onboarding summary Pablo reads before the call. Pure
// composition over the server-loaded `lead` payload.

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { AuthorStamp } from '@/components/v2/AuthorStamp';
import { LeadValue } from '@/components/v2/leads/LeadValue';
import { LeadStatusControl } from '@/components/v2/leads/LeadStatusControl';
import { LeadOnboardingSummary } from '@/components/v2/leads/LeadOnboardingSummary';
import { LeadAltaControl } from '@/components/v2/leads/LeadAltaControl';
import { LeadCitaBlock } from '@/components/v2/citas/LeadCitaBlock';
import { SessionReportsBlock } from '@/components/v2/sessions/SessionReportsBlock';
import { LEAD_STATUS_META } from '@/lib/dashboard/coach/leads-status';
import type { CoachLevelOption, LeadDetail } from '@/lib/dashboard/coach/leads';
import { formatRelative } from '@/lib/dashboard/relative-time';
import { cn } from '@/lib/utils';

const SHORT_DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
function formatShortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', SHORT_DATE);
}

function MetaField({
  label,
  value,
  numeric,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="v2-micro">{label}</span>
      <LeadValue
        value={value}
        numeric={numeric}
        className="text-sm font-semibold text-[color:var(--v2-fg)]"
      />
    </div>
  );
}

function ContactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-baseline gap-3">
      <dt className="v2-micro">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

const LINK_CLS =
  'v2-focus break-words text-sm font-medium text-[color:var(--v2-fg)] underline-offset-2 transition-colors hover:text-[color:var(--v2-accent-text)] hover:underline';
const VALUE_CLS = 'text-sm text-[color:var(--v2-fg)]';

export function LeadDetalle({
  lead,
  levels,
  stripeConfigured = false,
}: {
  lead: LeadDetail;
  levels: CoachLevelOption[];
  stripeConfigured?: boolean;
}) {
  const meta = LEAD_STATUS_META[lead.status];
  // Bumped when a cita is marked "Completada" → the Sesiones block opens the parte form
  // in the same gesture (#14 coupling), so lo hablado se registra en caliente.
  const [citaCompletedTick, setCitaCompletedTick] = useState(0);
  const displayName = lead.nombre?.trim() || lead.email;

  // Identity sub-line: email · teléfono (if any) · "llegó hace N".
  const subParts = [
    lead.email,
    lead.telefono?.trim() || null,
    `llegó ${formatRelative(lead.created_at)}`,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col gap-6">
      {/* Back link */}
      <Link
        href="/leads"
        className="v2-focus inline-flex w-fit items-center gap-1.5 rounded-[var(--v2-r-s)] text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
      >
        <MIcon name="arrow_back" size={16} />
        Leads
      </Link>

      {/* ── Header band ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        {/* Identity */}
        <div className="flex min-w-0 items-start gap-4">
          <AthleteAvatar
            name={displayName}
            size="lg"
            className="h-[58px] w-[58px] text-base"
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <h1 className="v2-display truncate text-2xl text-[color:var(--v2-fg)] sm:text-3xl">
                {displayName}
              </h1>
              <Pill tone={meta.tone} variant="soft">
                {meta.label}
              </Pill>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--v2-muted)]">
              {subParts.map((s, i) => (
                <span key={s} className="flex items-center gap-2">
                  {i > 0 ? <span className="text-[color:var(--v2-faint)]">·</span> : null}
                  <span className={i === subParts.length - 1 ? 'v2-num' : undefined}>{s}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Meta cluster — micro-label-over-value fields (phrase-length labels, so NOT
            the 3xl-display StatTile). */}
        <Card className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-4 lg:gap-x-8">
          <MetaField label="Objetivo" value={lead.objetivo_label} />
          <MetaField label="Nivel" value={lead.nivel_label} />
          <MetaField label="Días/sem" value={lead.dias_label} numeric />
          <MetaField label="Categoría" value={lead.categoria_objetivo_label} />
        </Card>
      </div>

      {/* ── Partial (abandoned onboarding) banner ─────────────────────────── */}
      {lead.is_partial ? (
        <div
          className="flex items-center gap-2.5 rounded-[var(--v2-r-m)] border px-3.5 py-2.5"
          style={{ borderColor: 'var(--v2-warn)', background: 'var(--v2-warn-soft)' }}
        >
          <MIcon name="hourglass_empty" size={18} className="text-[color:var(--v2-warn)]" />
          <span className="text-sm text-[color:var(--v2-fg)]">
            <span className="font-semibold">Onboarding sin terminar</span>
            <span className="text-[color:var(--v2-muted)]">
              {' '}
              · datos parciales, sin teléfono.
            </span>
          </span>
        </div>
      ) : null}

      {/* ── Actions: pipeline status control + alta seam ──────────────────── */}
      <Card className="flex flex-col gap-4 p-4 lg:p-5">
        <LeadStatusControl leadId={lead.id} currentStatus={lead.status} />

        <div className="h-px w-full bg-[color:var(--v2-border)]" />

        {/*
          ALTA (#5) — the lead becomes an athlete: create the account carrying the
          onboarding data, mint the claim invite, email the download link. The lead
          only flips to `convertido` when the athlete redeems (owned by the alta flow,
          never a manual PATCH here).
        */}
        <LeadAltaControl leadId={lead.id} status={lead.status} alta={lead.alta} levels={levels} stripeConfigured={stripeConfigured} />
      </Card>

      {/* ── Cita · videollamada ───────────────────────────────────────────── */}
      <LeadCitaBlock
        appointment={lead.appointment}
        onCompleted={() => setCitaCompletedTick((t) => t + 1)}
      />

      {/* ── Sesiones 1:1 · partes de videollamada (#14) + resumen (#11) ────── */}
      <SessionReportsBlock
        subject={{ lead_id: lead.id }}
        sessions={lead.sessions}
        appointmentId={lead.appointment?.id ?? null}
        isLead
        autoOpenTick={citaCompletedTick}
      />

      {/* ── Historial · quién movió el lead y cuándo (#43) ─────────────────── */}
      {lead.timeline.length > 0 ? (
        <Card className="p-4 lg:p-5">
          <h2 className="v2-micro mb-3">Historial</h2>
          <ol className="flex flex-col gap-3">
            {lead.timeline.map((ev, i) => {
              const toLabel =
                (LEAD_STATUS_META as Record<string, { label?: string }>)[ev.to_status]?.label ??
                ev.to_status;
              return (
                <li key={`${ev.created_at}-${i}`} className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--v2-accent)]"
                  />
                  <AuthorStamp
                    kind={ev.changed_by_kind}
                    name={ev.changed_by_name}
                    verb={ev.from_status == null ? 'abrió el lead' : `movió a ${toLabel}`}
                    at={ev.created_at}
                  />
                </li>
              );
            })}
          </ol>
        </Card>
      ) : null}

      {/* ── Contacto + Onboarding summary ─────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        {/* Contacto */}
        <Card className="self-start p-4 lg:p-5">
          <h2 className="v2-micro mb-3">Contacto</h2>
          <dl className="flex flex-col gap-3">
            <ContactRow label="Email">
              <a href={`mailto:${lead.email}`} className={LINK_CLS}>
                {lead.email}
              </a>
            </ContactRow>
            <ContactRow label="Teléfono">
              {lead.telefono?.trim() ? (
                <a href={`tel:${lead.telefono}`} className={cn(LINK_CLS, 'v2-num')}>
                  {lead.telefono}
                </a>
              ) : (
                <LeadValue value={null} />
              )}
            </ContactRow>
            <ContactRow label="Edad">
              <LeadValue value={lead.edad} numeric className={VALUE_CLS} />
            </ContactRow>
            <ContactRow label="Sexo">
              <LeadValue value={lead.sexo_label} className={VALUE_CLS} />
            </ContactRow>
            <ContactRow label="Ubicación">
              <LeadValue value={lead.ubicacion_label} className={VALUE_CLS} />
            </ContactRow>
            <ContactRow label="Llegó">
              <span className={cn(VALUE_CLS, 'v2-num')}>{formatRelative(lead.created_at)}</span>
            </ContactRow>
            <ContactRow label="Onboarding">
              {lead.submitted_at ? (
                <span className={cn(VALUE_CLS, 'v2-num')}>
                  completado {formatRelative(lead.submitted_at)}
                </span>
              ) : (
                <span className="text-sm font-medium text-[color:var(--v2-warn)]">sin terminar</span>
              )}
            </ContactRow>
            <ContactRow label="RGPD">
              {lead.consent_rgpd ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-[color:var(--v2-fg)]">
                  <MIcon
                    name="check_circle"
                    size={16}
                    filled
                    className="text-[color:var(--v2-ok)]"
                  />
                  {lead.consent_at ? (
                    <span className="v2-num text-[color:var(--v2-muted)]">
                      {formatShortDate(lead.consent_at)}
                    </span>
                  ) : (
                    <span className="text-[color:var(--v2-muted)]">consentido</span>
                  )}
                </span>
              ) : (
                <span className="text-sm text-[color:var(--v2-muted)]">Sin consentimiento</span>
              )}
            </ContactRow>
          </dl>
        </Card>

        {/* Onboarding summary */}
        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="v2-display text-lg text-[color:var(--v2-fg)]">Onboarding completo</h2>
          {lead.summary.length > 0 ? (
            <LeadOnboardingSummary summary={lead.summary} />
          ) : (
            <EmptyState
              icon="assignment"
              title="Sin respuestas todavía"
              description="Este lead no completó ninguna sección del onboarding."
            />
          )}
        </div>
      </div>
    </div>
  );
}
