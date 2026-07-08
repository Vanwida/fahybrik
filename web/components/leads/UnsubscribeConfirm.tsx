'use client';

// Public RGPD unsubscribe confirmation (#10). The email links here (a GET page), NOT to the
// mutating endpoint — so an email-client prefetch can't auto-unsubscribe. The actual opt-out
// only happens when the person presses Confirmar, which POSTs to /api/leads/unsubscribe.

import { useState } from 'react';

type Status = 'idle' | 'submitting' | 'done' | 'error';

const UNSUBSCRIBE_ENDPOINT = '/api/leads/unsubscribe';

export function UnsubscribeConfirm({ token }: { token: string | null }) {
  const [status, setStatus] = useState<Status>('idle');

  if (!token) {
    return (
      <Card
        heading="Enlace no válido"
        body="Este enlace no es correcto o está incompleto. Si querías dejar de recibir recordatorios, escríbenos a hello@fahybrid.com y lo hacemos nosotros."
      />
    );
  }

  if (status === 'done') {
    return (
      <Card
        heading="Hecho, no te escribiremos más"
        body="Hemos dado de baja tus recordatorios. Si algún día quieres retomarlo, escríbenos a hello@fahybrid.com."
      />
    );
  }

  async function confirm() {
    setStatus('submitting');
    try {
      const res = await fetch(UNSUBSCRIBE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      setStatus(res.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  }

  return (
    <Card
      heading="¿Dejar de recibir recordatorios?"
      body="Dejaremos de enviarte los correos de seguimiento de FAHYBRID. Esto no afecta a tu cuenta si ya eres atleta."
    >
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={confirm}
          disabled={status === 'submitting'}
          className="inline-flex items-center justify-center rounded-full bg-[color:var(--accent)] px-6 py-3 text-[15px] font-semibold text-[#0a0a0a] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {status === 'submitting' ? 'Un momento…' : 'Confirmar baja'}
        </button>
        <a
          href="mailto:hello@fahybrid.com"
          className="text-[14px] text-[color:var(--muted)] underline-offset-4 hover:underline"
        >
          Prefiero escribir a Pablo
        </a>
      </div>
      {status === 'error' && (
        <p className="mt-4 text-[14px] text-[color:var(--accent)]" role="alert">
          No hemos podido procesar la baja. Inténtalo de nuevo o escríbenos a hello@fahybrid.com.
        </p>
      )}
    </Card>
  );
}

function Card({
  heading,
  body,
  children,
}: {
  heading: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-[color:var(--outline)] bg-[color:var(--surface)] p-6 md:p-8">
      <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
        FAHYBRID · Recordatorios
      </p>
      <h1 className="font-display text-2xl font-black italic tracking-tight text-[color:var(--fg)] md:text-3xl">
        {heading}
      </h1>
      <p className="mt-4 text-[15px] leading-7 text-[color:var(--fg)]/90">{body}</p>
      {children}
    </div>
  );
}

export default UnsubscribeConfirm;
