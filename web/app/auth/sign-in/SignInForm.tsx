'use client';

import { useState, type FormEvent } from 'react';

type Status = 'idle' | 'sending' | 'sent' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignInForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setStatus('error');
      setErrorMsg('Introduce un correo válido.');
      return;
    }
    setStatus('sending');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.status === 204) {
        setStatus('sent');
        return;
      }
      setStatus('error');
      setErrorMsg('No pudimos enviar el enlace. Inténtalo de nuevo.');
    } catch {
      setStatus('error');
      setErrorMsg('No pudimos enviar el enlace. Inténtalo de nuevo.');
    }
  }

  if (status === 'sent') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-[var(--radius-l)] border border-[color:var(--hairline)] bg-[color:var(--surface)] p-5"
      >
        <p className="text-[14px] text-[color:var(--fg)]">
          Revisa tu inbox · enviamos el link a{' '}
          <span className="font-mono text-[13px]">{email.trim().toLowerCase()}</span>
        </p>
        <p className="mt-2 text-[12px] text-[color:var(--muted)]">
          El enlace caduca pronto. Si no llega en un par de minutos, mira en spam.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="email"
          className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted)]"
        >
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === 'error') {
              setStatus('idle');
              setErrorMsg(null);
            }
          }}
          aria-invalid={status === 'error'}
          aria-describedby={errorMsg ? 'email-error' : undefined}
          className="h-12 rounded-[var(--radius-m)] border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 text-[15px] text-[color:var(--fg)] placeholder:text-[color:var(--muted)] outline-none transition focus-visible:border-[color:var(--accent)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/30"
          placeholder="tu@email.com"
        />
        {errorMsg ? (
          <p
            id="email-error"
            role="alert"
            className="text-[12px] text-[color:var(--danger)]"
          >
            {errorMsg}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={status === 'sending'}
        className="h-12 rounded-[var(--radius-m)] bg-[color:var(--accent)] text-[color:var(--accent-on)] text-[14px] font-semibold tracking-[0.02em] uppercase transition hover:bg-[color:var(--accent-press)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === 'sending' ? 'Enviando…' : 'Enviar enlace'}
      </button>
    </form>
  );
}
