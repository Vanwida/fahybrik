'use client';

import { useState } from 'react';
import { APP_STORE_URL } from '@/lib/invites/deeplinks';

/**
 * Interactive account-activation card for the public /invite/[token] page.
 *
 * Replaces the old dead-end ("open the app + sign in with Apple", which stranded
 * anyone without an Apple device): the athlete ACTIVATES their account right here,
 * on the web, with their email + a one-time code. Two steps → the shared
 * /api/auth/email endpoints, with `invite_token` so verify also REDEEMS the
 * invitation (marks it claimed, grants access). "Abrir en la app" stays as a
 * secondary path for those who prefer Apple/iOS.
 */
export function InviteActivateCard({
  token,
  invitedEmail,
  openHref,
}: {
  token: string;
  invitedEmail: string;
  openHref: string;
}) {
  const [phase, setPhase] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState(invitedEmail);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const hasAppStore = APP_STORE_URL.length > 0;
  const normalizedEmail = email.trim().toLowerCase();
  const emailLooksValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail);

  async function sendCode(resend: boolean) {
    if (!emailLooksValid || busy) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const r = await fetch('/api/auth/email/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      if (r.status === 429) {
        setError('Has pedido demasiados códigos. Espera un momento e inténtalo de nuevo.');
        return;
      }
      if (!r.ok) {
        setError('No hemos podido enviar el código. Inténtalo de nuevo.');
        return;
      }
      setPhase('code');
      if (resend) setInfo('Te hemos enviado un código nuevo.');
    } catch {
      setError('Sin conexión. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.length !== 6 || busy) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const r = await fetch('/api/auth/email/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, code, invite_token: token }),
      });
      if (r.ok) {
        setPhase('done');
        return;
      }
      const body = (await r.json().catch(() => null)) as { error?: { code?: string } } | null;
      const c = body?.error?.code;
      if (c === 'email_mismatch') {
        setError('Ese email no coincide con el de tu invitación. Usa el email al que te invitó tu entrenador.');
      } else if (c === 'token_expired' || c === 'token_revoked' || c === 'token_invalid') {
        setError('Esta invitación ya no es válida. Pídele a tu entrenador que te envíe una nueva.');
      } else if (c === 'too_many_attempts') {
        setError('Demasiados intentos. Pide un código nuevo.');
      } else {
        setError('El código no es válido o ha caducado. Revísalo o pide uno nuevo.');
      }
    } catch {
      setError('Sin conexión. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto flex min-h-[80vh] max-w-[560px] flex-col items-center justify-center px-6 py-20 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">FAHYBRID</p>

      {phase === 'done' ? (
        <>
          <h1 className="mt-6 font-display text-[clamp(1.9rem,5vw,2.75rem)] font-black italic leading-[1.05] tracking-tight text-[color:var(--fg)]">
            Cuenta activada
          </h1>
          <p className="mt-5 max-w-[42ch] leading-relaxed text-[color:var(--muted)]">
            Ya está. Descarga la app y entra con tu email o con Apple: tu plan te espera dentro.
          </p>
          <div className="mt-10 flex w-full max-w-[320px] flex-col items-stretch gap-3">
            {hasAppStore ? (
              <a
                href={APP_STORE_URL}
                className="inline-flex items-center justify-center rounded-lg bg-[color:var(--accent)] px-5 py-3 font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)]"
              >
                Descargar en App Store
              </a>
            ) : (
              <span
                aria-disabled="true"
                title="Disponible próximamente en la App Store"
                className="inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-[color:var(--hairline)] px-5 py-3 font-semibold text-[color:var(--muted)] opacity-60"
              >
                Descargar en App Store
              </span>
            )}
            <a
              href={openHref}
              className="inline-flex items-center justify-center rounded-lg border border-[color:var(--hairline)] px-5 py-3 font-semibold text-[color:var(--fg)] transition-colors hover:border-[color:var(--fg)]"
            >
              Abrir en la app
            </a>
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-6 font-display text-[clamp(1.9rem,5vw,2.75rem)] font-black italic leading-[1.05] tracking-tight text-[color:var(--fg)]">
            Activa tu cuenta
          </h1>
          <p className="mt-5 max-w-[42ch] leading-relaxed text-[color:var(--muted)]">
            {phase === 'email'
              ? 'Tu entrenador ya te ha creado el perfil. Actívalo con tu email y un código — sin contraseñas.'
              : `Te hemos enviado un código de 6 dígitos a ${normalizedEmail}. Escríbelo para activar tu cuenta.`}
          </p>

          <div className="mt-9 flex w-full max-w-[360px] flex-col items-stretch gap-3">
            {phase === 'email' ? (
              <>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendCode(false);
                  }}
                  placeholder="tu@email.com"
                  aria-label="Tu email"
                  className="w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-3 text-center text-[color:var(--fg)] outline-none focus:border-[color:var(--accent)]"
                />
                <button
                  type="button"
                  disabled={!emailLooksValid || busy}
                  onClick={() => sendCode(false)}
                  className="inline-flex items-center justify-center rounded-lg bg-[color:var(--accent)] px-5 py-3 font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? 'Enviando…' : 'Enviar código'}
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') verify();
                  }}
                  placeholder="000000"
                  aria-label="Código de 6 dígitos"
                  className="w-full rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-3 text-center text-[1.6rem] font-bold tracking-[0.4em] text-[color:var(--fg)] outline-none focus:border-[color:var(--accent)]"
                />
                <button
                  type="button"
                  disabled={code.length !== 6 || busy}
                  onClick={verify}
                  className="inline-flex items-center justify-center rounded-lg bg-[color:var(--accent)] px-5 py-3 font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? 'Activando…' : 'Activar cuenta'}
                </button>
                <div className="mt-1 flex items-center justify-center gap-3 text-[13px] text-[color:var(--muted)]">
                  <button type="button" disabled={busy} onClick={() => sendCode(true)} className="underline-offset-4 hover:underline disabled:opacity-50">
                    Reenviar código
                  </button>
                  <span aria-hidden>·</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPhase('email');
                      setCode('');
                      setError(null);
                      setInfo(null);
                    }}
                    className="underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    Cambiar email
                  </button>
                </div>
              </>
            )}

            {error ? (
              <p className="text-[13px] leading-relaxed text-[color:var(--danger)]" role="alert">
                {error}
              </p>
            ) : info ? (
              <p className="text-[13px] text-[color:var(--muted)]">{info}</p>
            ) : null}
          </div>

          <div className="mt-9 border-t border-[color:var(--hairline)] pt-6">
            <p className="text-[13px] text-[color:var(--muted)]">
              ¿Prefieres Apple?{' '}
              <a href={openHref} className="text-[color:var(--fg)] underline-offset-4 hover:underline">
                Ábrelo en la app
              </a>
              .
            </p>
          </div>
        </>
      )}
    </section>
  );
}
