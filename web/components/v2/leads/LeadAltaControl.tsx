'use client';

// Alta control (#5) — replaces the old disabled seam in LeadDetalle. Three states:
//   • already converted → a link to the athlete it became;
//   • alta already sent  → a "sent" marker + resend/edit;
//   • otherwise (a live lead) → "Dar de alta como atleta" → the pre-filled modal.
// The modal is pre-filled from the lead's onboarding (name, email, edad, sexo, nivel,
// días, notas), the coach adjusts, and POST /api/coach/leads/[id]/alta creates the
// athlete + mints the claim invite + emails the lead. The lead becomes `convertido`
// only when the athlete redeems (not here).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import type { AltaPrefill } from '@/lib/leads/alta-mapping';
import type { CoachLevelOption } from '@/lib/dashboard/coach/leads';
import type { LeadStatus } from '@/lib/dashboard/coach/leads-status';

interface AltaState {
  sent_at: string | null;
  converted_athlete_id: string | null;
  prefill: AltaPrefill;
}

const FIELD_CLS =
  'v2-focus h-10 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]';

const SEX_OPTIONS: Array<{ value: 'male' | 'female' | 'other'; label: string }> = [
  { value: 'male', label: 'Hombre' },
  { value: 'female', label: 'Mujer' },
  { value: 'other', label: 'Otro / prefiere no decir' },
];

const MODALITY_OPTIONS: Array<{ value: 'individual' | 'dobles'; label: string }> = [
  { value: 'individual', label: 'Individual' },
  { value: 'dobles', label: 'Dobles' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function LeadAltaControl({
  leadId,
  status,
  alta,
  levels,
}: {
  leadId: string;
  status: LeadStatus;
  alta: AltaState;
  levels: CoachLevelOption[];
}) {
  const [open, setOpen] = useState(false);

  // Converted — the loop is closed. Link to the athlete.
  if (alta.converted_athlete_id) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <MIcon name="check_circle" size={18} filled className="text-[color:var(--v2-ok)]" />
        <span className="text-[color:var(--v2-fg)]">Convertido en atleta.</span>
        <Link
          href={`/atletas/${alta.converted_athlete_id}`}
          className="v2-focus font-semibold text-[color:var(--v2-accent)] underline-offset-2 hover:underline"
        >
          Ver ficha →
        </Link>
      </div>
    );
  }

  const terminal = status === 'descartado';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={terminal}
          onClick={() => setOpen(true)}
          className="inline-flex h-10 w-fit items-center gap-2 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MIcon name="person_add" size={18} />
          {alta.sent_at ? 'Reenviar / editar alta' : 'Dar de alta como atleta'}
        </button>
        {alta.sent_at ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--v2-muted)]">
            <MIcon name="mark_email_read" size={16} className="text-[color:var(--v2-ok)]" />
            Alta enviada · {formatDate(alta.sent_at)} — pendiente de que el atleta la reclame.
          </span>
        ) : null}
      </div>
      {terminal ? (
        <span className="text-xs text-[color:var(--v2-muted)]">
          El lead está descartado. Reábrelo antes de darlo de alta.
        </span>
      ) : null}

      {open ? (
        <AltaModal leadId={leadId} prefill={alta.prefill} levels={levels} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}

function AltaModal({
  leadId,
  prefill,
  levels,
  onClose,
}: {
  leadId: string;
  prefill: AltaPrefill;
  levels: CoachLevelOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const defaultLevelId = levels.find((l) => l.name === prefill.level_name)?.id ?? '';

  const [fullName, setFullName] = useState(prefill.full_name);
  const [email, setEmail] = useState(prefill.email);
  const [edad, setEdad] = useState(prefill.edad != null ? String(prefill.edad) : '');
  const [sex, setSex] = useState<string>(prefill.sex ?? '');
  const [days, setDays] = useState(
    prefill.training_days_per_week != null ? String(prefill.training_days_per_week) : '',
  );
  const [levelId, setLevelId] = useState(defaultLevelId);
  const [modality, setModality] = useState<'individual' | 'dobles'>(
    prefill.modality === 'dobles' ? 'dobles' : 'individual',
  );
  const [notes, setNotes] = useState(prefill.notes);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ inviteUrl: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => {
    if (done) startTransition(() => router.refresh());
    onClose();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/coach/leads/${leadId}/alta`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          edad: edad.trim() ? Number(edad) : null,
          sex: sex || null,
          training_days_per_week: days.trim() ? Number(days) : null,
          level_id: levelId ? Number(levelId) : null,
          modality,
          notes: notes.trim(),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; alta?: { invite_url: string; email_sent: boolean }; error?: { message?: string } }
        | null;
      if (!res.ok || !data?.alta) {
        setError(data?.error?.message ?? 'No se pudo dar de alta al lead.');
        return;
      }
      setDone({ inviteUrl: data.alta.invite_url, emailSent: data.alta.email_sent });
    } catch {
      setError('Error de red. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Cerrar" onClick={close} className="absolute inset-0 bg-[color:var(--v2-scrim,rgba(0,0,0,0.6))]" />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop,0_20px_60px_rgba(0,0,0,0.4))]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">Dar de alta como atleta</h2>
          <button type="button" aria-label="Cerrar" onClick={close} className="v2-focus inline-flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]">
            <MIcon name="close" size={20} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-[color:var(--v2-fg)]">
              <MIcon name="check_circle" size={20} filled className="text-[color:var(--v2-ok)]" />
              Atleta creado.{' '}
              {done.emailSent ? 'Le hemos enviado el email de alta.' : 'Copia el enlace y envíaselo (email no configurado).'}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="v2-micro">Enlace de alta</span>
              <div className="flex items-center gap-2">
                <input readOnly value={done.inviteUrl} className={FIELD_CLS} />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(done.inviteUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="v2-focus inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-sm font-semibold text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]"
                >
                  <MIcon name={copied ? 'check' : 'content_copy'} size={16} />
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </label>
            <div className="mt-1 flex justify-end">
              <button type="button" onClick={close} className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]">
                Hecho
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <p className="text-xs text-[color:var(--v2-muted)]">
              Pre-rellenado desde su onboarding. Ajusta lo que quieras y confirma — le llega el email para descargar la app.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="v2-micro">Nombre completo</span>
              <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={FIELD_CLS} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="v2-micro">Email</span>
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD_CLS} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="v2-micro">Edad</span>
                <input type="number" min={12} max={100} value={edad} onChange={(e) => setEdad(e.target.value)} className={FIELD_CLS} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="v2-micro">Días / semana</span>
                <input type="number" min={1} max={14} value={days} onChange={(e) => setDays(e.target.value)} className={FIELD_CLS} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="v2-micro">Sexo</span>
                <select value={sex} onChange={(e) => setSex(e.target.value)} className={FIELD_CLS}>
                  <option value="">—</option>
                  {SEX_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="v2-micro">Nivel</span>
                <select value={levelId} onChange={(e) => setLevelId(e.target.value)} className={FIELD_CLS}>
                  <option value="">—</option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>{l.name} · {l.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="v2-micro">Modalidad</span>
              <div className="flex gap-2">
                {MODALITY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setModality(o.value)}
                    className={
                      'v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] border px-3 text-xs font-semibold transition-colors ' +
                      (modality === o.value
                        ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]'
                        : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]')
                    }
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="v2-micro">Notas para el coach</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={FIELD_CLS + ' h-auto resize-y py-2 leading-relaxed'} />
            </label>

            {error ? <p className="text-xs font-medium text-[color:var(--v2-danger)]">{error}</p> : null}

            <div className="mt-1 flex items-center justify-end gap-2">
              <button type="button" onClick={close} className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] px-3 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]">
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50">
                {submitting ? 'Dando de alta…' : 'Dar de alta y enviar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
