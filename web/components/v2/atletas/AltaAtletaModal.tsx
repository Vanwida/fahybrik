'use client';

// AltaAtletaModal — the two-phase "Alta / Invitar atleta" flow for V2.
//
// Phase 1 (form): create a courtesy athlete (POST /api/coach/athletes) — full,
// free app access, no billing. On success we hold the new athlete and slide to…
// Phase 2 (invitar): mint a one-shot account-claim deeplink
// (POST /api/coach/athletes/{id}/invite) the coach shares; the athlete activates
// via Sign in with Apple on iOS. The two are unified because creating an athlete
// and handing them their invite link is the real, single coach journey.
//
// Self-contained state machine; resets fully on close. V2 tokens only. The
// backend already validates every field — the client just calls and surfaces
// the returned message inline.

import { useEffect, useId, useRef, useState } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';
import type { AthleteModality } from '@/lib/dashboard/athletes/list';
import { cn } from '@/lib/utils';

interface AltaAtletaModalProps {
  open: boolean;
  onClose: () => void;
  /** Called when the coach finishes (close after a successful create) so the
      parent can refresh the roster. */
  onCreated: () => void;
}

/** Backend contract: POST /api/coach/athletes (jsonOk returns the body directly). */
interface CreatedAthlete {
  id: string;
  full_name: string;
  modality: AthleteModality;
  comp: true;
}

/** Backend contract: POST /api/coach/athletes/[id]/invite (body returned directly). */
interface InviteResponse {
  invite_url: string;
  token: string;
  expires_at: string;
}

const MODALITY_OPTIONS: ReadonlyArray<{ value: AthleteModality; label: string }> = [
  { value: 'individual', label: 'Individual' },
  { value: 'dobles', label: 'Dobles' },
  { value: 'pro_elite', label: 'Pro' },
];

// Name max mirrors the server schema (compAthleteInputSchema: max 120).
const NAME_MAX = 120;

const FIELD_CLASS = cn(
  'v2-focus mt-1.5 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)]',
  'bg-[color:var(--v2-surface-2)] px-3 py-2.5 text-sm text-[color:var(--v2-fg)]',
  'placeholder:text-[color:var(--v2-faint)] transition-colors',
  'focus:border-[color:var(--v2-border-strong)]',
);

const LABEL_CLASS = 'v2-micro';

// Primary (accent) action — black-on-orange, the Fabrik action relationship.
const BTN_PRIMARY = cn(
  'v2-focus inline-flex h-9 items-center justify-center gap-2 rounded-[var(--v2-r-s)] px-4',
  'bg-[color:var(--v2-accent)] text-[13px] font-semibold text-[color:var(--v2-accent-fg)]',
  'transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50',
);

// Secondary (ghost) action — hairline bordered surface.
const BTN_GHOST = cn(
  'v2-focus inline-flex h-9 items-center justify-center gap-2 rounded-[var(--v2-r-s)] px-4',
  'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] text-[13px] font-semibold',
  'text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:opacity-50',
);

// Quiet text action (Cancelar / Cerrar).
const BTN_QUIET = cn(
  'v2-focus inline-flex h-9 items-center justify-center rounded-[var(--v2-r-s)] px-3',
  'text-[13px] font-semibold text-[color:var(--v2-muted)] transition-colors',
  'hover:text-[color:var(--v2-fg)] disabled:opacity-50',
);

function formatExpiry(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Phase = 'form' | 'invite';

export function AltaAtletaModal({ open, onClose, onCreated }: AltaAtletaModalProps) {
  const [phase, setPhase] = useState<Phase>('form');

  // Phase 1 — form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [modality, setModality] = useState<AthleteModality>('individual');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Phase 2 — invitar
  const [athlete, setAthlete] = useState<CreatedAthlete | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const titleId = useId();
  const nameId = useId();
  const emailId = useId();
  const modalityId = useId();
  const urlId = useId();

  const nameRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const busy = submitting || inviteLoading;

  // Full reset when the modal closes — legitimate sync to `open`, not a derived
  // setState per render. Disable acotado, mirroring the V1 pattern.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      setPhase('form');
      setFullName('');
      setEmail('');
      setModality('individual');
      setSubmitting(false);
      setFormError(null);
      setAthlete(null);
      setInviteLoading(false);
      setInviteError(null);
      setInvite(null);
      setCopied(false);
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Escape-to-close (unless mid-request).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  // Focus management — land focus on the first field / panel when a phase mounts.
  useEffect(() => {
    if (!open) return;
    if (phase === 'form') nameRef.current?.focus();
    else panelRef.current?.focus();
  }, [open, phase]);

  if (!open) return null;

  const submitForm = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    if (!name) {
      setFormError('El nombre es obligatorio.');
      return;
    }
    if (!mail) {
      setFormError('El email es obligatorio.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/coach/athletes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name, email: mail, modality }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        // 409 (email_in_use / athlete_other_coach) and 400 surface their message.
        throw new Error(body.error?.message ?? `Error (${res.status})`);
      }
      const data = (await res.json()) as { athlete: CreatedAthlete };
      setAthlete(data.athlete);
      setPhase('invite');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo dar de alta al atleta.');
    } finally {
      setSubmitting(false);
    }
  };

  const requestInvite = async () => {
    if (!athlete) return;
    setInviteLoading(true);
    setInviteError(null);
    setInvite(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/coach/athletes/${athlete.id}/invite`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        // 409 athlete_already_linked / 404 not_found surface their message.
        throw new Error(body.error?.message ?? `Error (${res.status})`);
      }
      const data = (await res.json()) as InviteResponse;
      setInvite(data);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'No se pudo generar la invitación.');
    } finally {
      setInviteLoading(false);
    }
  };

  const copyLink = async () => {
    if (!invite) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(invite.invite_url);
      } else {
        // Fallback for non-secure contexts where the async Clipboard API is absent.
        const el = document.createElement('textarea');
        el.value = invite.invite_url;
        el.setAttribute('readonly', '');
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setInviteError('No se pudo copiar. Copia el enlace manualmente.');
    }
  };

  const resetToForm = () => {
    setPhase('form');
    setFullName('');
    setEmail('');
    setModality('individual');
    setFormError(null);
    setAthlete(null);
    setInvite(null);
    setInviteError(null);
    setCopied(false);
  };

  const finish = () => {
    onCreated();
    onClose();
  };

  const mailtoHref =
    invite && athlete
      ? `mailto:?subject=${encodeURIComponent('Tu invitación a FAHYBRID')}&body=${encodeURIComponent(
          `Hola ${athlete.full_name},\n\n` +
            `Activa tu cuenta en FAHYBRID desde la app de iOS abriendo este enlace:\n\n` +
            `${invite.invite_url}\n\n` +
            `Firma con Apple para entrar — no necesitas contraseña.\n\nNos vemos en el entreno.`,
        )}`
      : '#';

  const expiry = invite ? formatExpiry(invite.expires_at) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/60"
        onClick={() => {
          if (!busy) onClose();
        }}
      />

      {phase === 'form' ? (
        <form
          onSubmit={(e) => void submitForm(e)}
          className={cn(
            'relative z-10 w-full max-w-md rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)]',
            'bg-[color:var(--v2-surface)] p-6 shadow-[var(--v2-shadow-pop)]',
          )}
        >
          <h2 id={titleId} className="v2-display text-2xl text-[color:var(--v2-fg)]">
            Alta de atleta
          </h2>
          <p className="mt-2 text-sm text-[color:var(--v2-muted)]">
            Crea una cuenta de cortesía con acceso completo a la app y sin cobro. Después podrás
            generarle el enlace para que entre firmando con Apple.
          </p>

          <div className="mt-5 space-y-4">
            <label htmlFor={nameId} className="block">
              <span className={LABEL_CLASS}>Nombre completo</span>
              <input
                ref={nameRef}
                id={nameId}
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={NAME_MAX}
                placeholder="Ej. Alex Solé"
                className={FIELD_CLASS}
              />
            </label>

            <label htmlFor={emailId} className="block">
              <span className={LABEL_CLASS}>Email</span>
              <input
                id={emailId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="atleta@email.com"
                autoComplete="off"
                className={FIELD_CLASS}
              />
            </label>

            <label htmlFor={modalityId} className="block">
              <span className={LABEL_CLASS}>Modalidad</span>
              <select
                id={modalityId}
                value={modality}
                onChange={(e) => setModality(e.target.value as AthleteModality)}
                className={FIELD_CLASS}
              >
                {MODALITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {formError ? (
            <p className="mt-3 text-sm text-[color:var(--v2-danger)]" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={submitting} className={BTN_QUIET}>
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting ? (
                <>
                  <MIcon
                    name="progress_activity"
                    size={18}
                    className="animate-spin"
                    aria-hidden
                  />
                  Creando…
                </>
              ) : (
                'Crear y continuar'
              )}
            </button>
          </div>
        </form>
      ) : (
        <div
          ref={panelRef}
          tabIndex={-1}
          className={cn(
            'v2-focus relative z-10 w-full max-w-md rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)]',
            'bg-[color:var(--v2-surface)] p-6 shadow-[var(--v2-shadow-pop)]',
          )}
        >
          <div className="flex items-center gap-2">
            <MIcon name="check_circle" size={20} className="text-[color:var(--v2-ok)]" aria-hidden />
            <h2 id={titleId} className="v2-display text-2xl text-[color:var(--v2-fg)]">
              {athlete?.full_name} creado
            </h2>
          </div>
          <p className="mt-2 text-sm text-[color:var(--v2-muted)]">
            Genera el enlace de invitación y compártelo para que active su cuenta en la app de iOS.
            Entrará firmando con Apple — la cuenta se vincula por el enlace, no por el email.
          </p>

          {/* No invite minted yet — primary CTA to generate it. */}
          {!invite ? (
            <div className="mt-5 flex flex-col gap-3">
              {inviteError ? (
                <p className="text-sm text-[color:var(--v2-danger)]" role="alert">
                  {inviteError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void requestInvite()}
                disabled={inviteLoading}
                className={cn(BTN_PRIMARY, 'w-full')}
              >
                {inviteLoading ? (
                  <>
                    <MIcon
                      name="progress_activity"
                      size={18}
                      className="animate-spin"
                      aria-hidden
                    />
                    Generando enlace…
                  </>
                ) : (
                  <>
                    <MIcon name="link" size={18} aria-hidden />
                    {inviteError ? 'Reintentar' : 'Generar enlace de invitación'}
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-4">
              <label htmlFor={urlId} className="block">
                <span className={LABEL_CLASS}>Enlace de invitación</span>
                <input
                  id={urlId}
                  type="text"
                  readOnly
                  value={invite.invite_url}
                  onFocus={(e) => e.currentTarget.select()}
                  className={FIELD_CLASS}
                />
              </label>

              {expiry ? (
                <p className="text-xs text-[color:var(--v2-muted)]">
                  Caduca el <span className="text-[color:var(--v2-fg)]">{expiry}</span>
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void copyLink()} className={BTN_PRIMARY}>
                  <MIcon name={copied ? 'check' : 'content_copy'} size={18} aria-hidden />
                  {copied ? 'Copiado' : 'Copiar enlace'}
                </button>
                <a href={mailtoHref} className={BTN_GHOST}>
                  <MIcon name="mail" size={18} aria-hidden />
                  Enviar por email
                </a>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button type="button" onClick={resetToForm} disabled={inviteLoading} className={BTN_QUIET}>
              <MIcon name="person_add" size={18} aria-hidden />
              <span className="ml-1.5">Añadir otro</span>
            </button>
            <button type="button" onClick={finish} disabled={inviteLoading} className={BTN_GHOST}>
              Hecho
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
