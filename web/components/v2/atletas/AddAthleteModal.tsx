'use client';

// AGREGAR ATLETA — coach adds a comp athlete (full free access, no billing) and
// gets a one-time invitation link to send them. Two real backend calls:
//   1. POST /api/coach/athletes              → creates/attaches the athlete row.
//   2. POST /api/coach/athletes/{id}/invite  → mints the account-claim deeplink.
// The link is surfaced ONCE (copyable) — the coach sends it to the athlete, who
// claims the account from it. On close we refresh the roster so the new athlete
// appears. No stubs: nothing is faked, every state below is real.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

type Modality = 'individual' | 'dobles' | 'pro_elite';

const MODALITY_OPTIONS: ReadonlyArray<{ value: Modality; label: string }> = [
  { value: 'individual', label: 'Individual' },
  { value: 'dobles', label: 'Dobles' },
  { value: 'pro_elite', label: 'Pro · Elite' },
];

// Mirrors the server's email check (compAthleteInputSchema) for instant client
// feedback; the server is still the source of truth.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CreatedAthlete {
  id: string;
  full_name: string;
}

export function AddAthleteModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [modality, setModality] = useState<Modality>('individual');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Success state: the created athlete + the (possibly null) invite link.
  const [created, setCreated] = useState<CreatedAthlete | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteWarning, setInviteWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim();
  const emailValid = EMAIL_RE.test(trimmedEmail);
  const canSubmit = trimmedName.length > 0 && emailValid && !submitting;

  function close() {
    // If we created someone, the roster has a new row → refresh before closing.
    if (created) startTransition(() => router.refresh());
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const createRes = await fetch('/api/coach/athletes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: trimmedName,
          email: trimmedEmail,
          modality,
        }),
      });
      const createBody = (await createRes.json().catch(() => null)) as
        | { athlete?: { id?: string; full_name?: string }; error?: { message?: string } }
        | null;

      if (!createRes.ok || !createBody?.athlete?.id) {
        setError(createBody?.error?.message ?? 'No se pudo crear el atleta.');
        return;
      }

      const athlete: CreatedAthlete = {
        id: createBody.athlete.id,
        full_name: createBody.athlete.full_name ?? trimmedName,
      };
      setCreated(athlete);

      // Mint the invitation link so the coach can send it. A failure here is not
      // fatal — the athlete already exists; we surface a soft warning + the link
      // can be regenerated later.
      try {
        const inviteRes = await fetch(`/api/coach/athletes/${athlete.id}/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const inviteBody = (await inviteRes.json().catch(() => null)) as
          | { invite_url?: string; error?: { message?: string } }
          | null;
        if (inviteRes.ok && inviteBody?.invite_url) {
          setInviteUrl(inviteBody.invite_url);
        } else {
          setInviteWarning(
            inviteBody?.error?.message ??
              'El atleta se creó, pero no se pudo generar el enlace. Reintenta desde su perfil.',
          );
        }
      } catch {
        setInviteWarning(
          'El atleta se creó, pero no se pudo generar el enlace. Reintenta desde su perfil.',
        );
      }
    } catch {
      setError('No se pudo crear el atleta. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the link is still selectable in the field */
    }
  }

  const inputCls = cn(
    'v2-focus h-10 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-sm',
    'text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)]',
    'focus:border-[color:var(--v2-border-strong)]',
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Agregar atleta"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={close}
        className="absolute inset-0 bg-[color:var(--v2-scrim,rgba(0,0,0,0.6))]"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop,0_20px_60px_rgba(0,0,0,0.4))]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">
            {created ? 'Atleta creado' : 'Agregar atleta'}
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={close}
            disabled={isPending}
            className="v2-focus inline-flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </div>

        {!created ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="v2-micro">Nombre completo</span>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="p. ej. Marta Ruiz"
                autoFocus
                maxLength={120}
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="v2-micro">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="atleta@email.com"
                className={inputCls}
                aria-invalid={trimmedEmail.length > 0 && !emailValid}
              />
              {trimmedEmail.length > 0 && !emailValid ? (
                <span className="text-[11px] text-[color:var(--v2-danger)]">
                  Email no válido.
                </span>
              ) : null}
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="v2-micro">Modalidad</span>
              <div className="flex flex-wrap gap-1.5">
                {MODALITY_OPTIONS.map((m) => {
                  const active = m.value === modality;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setModality(m.value)}
                      aria-pressed={active}
                      className={cn(
                        'v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] border px-3 text-xs font-semibold transition-colors',
                        active
                          ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]'
                          : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
                      )}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {error ? (
              <p className="text-xs font-medium text-[color:var(--v2-danger)]">{error}</p>
            ) : null}

            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] px-3 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <MIcon name="progress_activity" size={16} className="animate-spin" />
                    Creando…
                  </>
                ) : (
                  <>
                    <MIcon name="person_add" size={16} />
                    Crear e invitar
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3.5">
            <p className="text-sm text-[color:var(--v2-muted)]">
              <span className="font-semibold text-[color:var(--v2-fg)]">{created.full_name}</span>{' '}
              ya está en tu lista. Envíale este enlace para que active su cuenta:
            </p>

            {inviteUrl ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-stretch gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inviteUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className={cn(inputCls, 'v2-num text-xs')}
                    aria-label="Enlace de invitación"
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    className="v2-focus inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
                  >
                    <MIcon name={copied ? 'check' : 'content_copy'} size={16} />
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
                <p className="text-[11px] text-[color:var(--v2-faint)]">
                  Enlace de un solo uso. Caduca; puedes regenerarlo desde el perfil del atleta.
                </p>
              </div>
            ) : (
              <p className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-warn)] bg-[color:var(--v2-warn-soft)] px-3 py-2 text-xs text-[color:var(--v2-warn)]">
                {inviteWarning}
              </p>
            )}

            <div className="mt-1 flex items-center justify-end">
              <button
                type="button"
                onClick={close}
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
              >
                <MIcon name="check" size={16} />
                Hecho
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
