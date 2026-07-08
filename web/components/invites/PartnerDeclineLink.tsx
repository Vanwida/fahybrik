'use client';

import { useState } from 'react';

type DeclineState = 'idle' | 'confirming' | 'declining' | 'done' | 'error';

/**
 * Discreet "No me interesa" affordance on the partner-invite landing, for the
 * invitee who does NOT have the app installed (they land on the web instead of
 * the redeem screen). Without it, declining is impossible from the web and the
 * inviter stays blocked until the invitation expires.
 *
 * Same token-authenticated endpoint as the in-app decline
 * (POST /api/athlete/partner/decline). A terminal/invalid token (410/404) is
 * treated as "done" from the invitee's point of view — the outcome they wanted.
 */
export function PartnerDeclineLink({ token }: { token: string }) {
  const [state, setState] = useState<DeclineState>('idle');

  if (state === 'done') {
    return (
      <p className="mt-8 max-w-[42ch] text-[13px] leading-relaxed text-[color:var(--muted)]">
        Invitación rechazada. Se lo haremos saber a tu compañero/a.
      </p>
    );
  }

  async function decline() {
    setState('declining');
    try {
      const res = await fetch('/api/athlete/partner/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok || res.status === 410 || res.status === 404) {
        setState('done');
        return;
      }
      setState('error');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="mt-8 flex flex-col items-center gap-2">
      {state === 'confirming' ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px]">
          <span className="text-[color:var(--muted)]">¿Rechazar la invitación?</span>
          <button
            type="button"
            onClick={decline}
            className="font-semibold text-[color:var(--fg)] underline-offset-4 hover:underline"
          >
            Sí, rechazar
          </button>
          <button
            type="button"
            onClick={() => setState('idle')}
            className="text-[color:var(--muted)] underline-offset-4 hover:underline"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setState('confirming')}
          disabled={state === 'declining'}
          className="text-[13px] text-[color:var(--muted)] underline-offset-4 hover:underline disabled:opacity-60"
        >
          {state === 'declining' ? 'Rechazando…' : 'No me interesa'}
        </button>
      )}
      {state === 'error' && (
        <span className="text-[12px] text-[color:var(--muted)]">
          No pudimos procesarlo. Inténtalo de nuevo.
        </span>
      )}
    </div>
  );
}
