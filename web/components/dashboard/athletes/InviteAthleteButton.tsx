'use client';

import { useEffect, useId, useState } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface InviteAthleteButtonProps {
  athleteId: string;
  athleteName: string;
}

/** Backend contract: POST /api/coach/athletes/[id]/invite */
interface InviteResponse {
  invite_url: string;
  token: string;
  expires_at: string;
}

const BTN_BASE = cn(
  'focus-ring inline-flex items-center gap-2 rounded-[var(--r-sm)]',
  'text-xs font-bold uppercase tracking-wider transition disabled:opacity-50',
);

const BTN_ACCENT = cn(
  BTN_BASE,
  'bg-[color:var(--accent)] px-4 py-2.5 text-[color:var(--accent-on)] hover:bg-[color:var(--accent-press)]',
);

const BTN_GHOST = cn(
  BTN_BASE,
  'border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-high)]',
  'px-3 py-2 text-[color:var(--fg)] hover:border-[color:var(--accent)]',
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

export function InviteAthleteButton({ athleteId, athleteName }: InviteAthleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const titleId = useId();
  const urlId = useId();

  // Declared before the Escape effect that references it (avoids use-before-declare).
  const closeModal = () => {
    setOpen(false);
    setInvite(null);
    setError(null);
    setCopied(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading]);

  const requestInvite = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    setInvite(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/invite`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `Error (${res.status})`);
      }
      const data = (await res.json()) as InviteResponse;
      setInvite(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la invitación.');
    } finally {
      setLoading(false);
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
      setError('No se pudo copiar. Copia el enlace manualmente.');
    }
  };

  const mailtoHref = invite
    ? `mailto:?subject=${encodeURIComponent(
        'Tu invitación a FAHYBRID',
      )}&body=${encodeURIComponent(
        `Hola ${athleteName},\n\n` +
          `Activa tu cuenta en FAHYBRID desde la app de iOS abriendo este enlace:\n\n` +
          `${invite.invite_url}\n\n` +
          `Firma con Apple para entrar — no necesitas contraseña.\n\nNos vemos en el entreno.`,
      )}`
    : '#';

  const expiry = invite ? formatExpiry(invite.expires_at) : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => void requestInvite()}
        className="h-9 gap-2 px-4 text-[13px] font-semibold"
      >
        <MIcon name="mail" size={18} aria-hidden />
        Enviar invitación
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/70"
            onClick={() => {
              if (!loading) closeModal();
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-6 shadow-xl">
            <h2 id={titleId} className="font-heading text-[color:var(--fg)]">
              Invitación a {athleteName}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              Comparte este enlace para que active su cuenta en la app de iOS.
              Entrará firmando con Apple — la cuenta se vincula por el enlace,
              sin depender del email.
            </p>

            {loading ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
                <MIcon
                  name="progress_activity"
                  size={18}
                  className="animate-spin text-[color:var(--accent)]"
                />
                Generando enlace…
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 flex flex-col gap-3">
                <p className="text-sm text-[color:var(--danger)]" role="alert">
                  {error}
                </p>
                <button type="button" onClick={() => void requestInvite()} className={BTN_GHOST}>
                  <MIcon name="refresh" size={18} aria-hidden />
                  Reintentar
                </button>
              </div>
            ) : null}

            {invite ? (
              <div className="mt-5 flex flex-col gap-4">
                <label htmlFor={urlId} className="block">
                  <span className="font-label-bold text-[color:var(--text-muted)]">
                    Enlace de invitación
                  </span>
                  <input
                    id={urlId}
                    type="text"
                    readOnly
                    value={invite.invite_url}
                    onFocus={(e) => e.currentTarget.select()}
                    className={cn(
                      'mt-1 w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)]',
                      'bg-[color:var(--surface-container-lowest)] px-3 py-2.5 text-sm text-[color:var(--fg)]',
                      'outline-none transition-colors focus:border-[color:var(--accent)]',
                      'focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_35%,transparent)]',
                    )}
                  />
                </label>

                {expiry ? (
                  <p className="text-xs text-[color:var(--text-muted)]">
                    Caduca el <span className="text-[color:var(--fg)]">{expiry}</span>
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void copyLink()} className={BTN_ACCENT}>
                    <MIcon name={copied ? 'check' : 'content_copy'} size={18} aria-hidden />
                    {copied ? 'Copiado' : 'Copiar enlace'}
                  </button>
                  <a href={mailtoHref} className={BTN_GHOST}>
                    <MIcon name="mail" size={18} aria-hidden />
                    Enviar por email
                  </a>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={loading}
                className={cn(
                  'focus-ring rounded-[var(--r-sm)] px-4 py-2 text-xs font-bold uppercase tracking-wider',
                  'text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)] disabled:opacity-50',
                )}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
