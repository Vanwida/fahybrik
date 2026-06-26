'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface DemoCoachCard {
  slot: 1 | 2;
  label: string;
  athlete_label: string;
}

interface AthleteBearer {
  athlete_id: number;
  athlete_email: string;
  bearer: string;
  expires_at: string;
}

export function DemoAccessClient({
  coaches,
  locale,
}: {
  coaches: DemoCoachCard[];
  locale: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bearers, setBearers] = useState<Record<number, AthleteBearer>>({});

  async function enterAsCoach(slot: number) {
    setError(null);
    setBusy(slot);
    try {
      const res = await fetch('/api/demo/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot }),
      });
      if (!res.ok) {
        setError('No se pudo iniciar la sesión demo. ¿Está sembrada la DB demo?');
        setBusy(null);
        return;
      }
      // Land on the coach dashboard home as this demo coach.
      router.push(`/${locale}/hoy`);
    } catch {
      setError('Error de red al iniciar la sesión demo.');
      setBusy(null);
    }
  }

  async function revealBearer(slot: number) {
    setError(null);
    try {
      const res = await fetch('/api/demo/athlete-bearer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot }),
      });
      if (!res.ok) {
        setError('No se pudo generar el acceso del atleta.');
        return;
      }
      const data = (await res.json()) as AthleteBearer;
      setBearers((prev) => ({ ...prev, [slot]: data }));
    } catch {
      setError('Error de red al generar el acceso del atleta.');
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      {error && (
        <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {coaches.map((c) => {
          const bearer = bearers[c.slot];
          return (
            <div
              key={c.slot}
              className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-neutral-900">{c.label}</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Roster con {c.athlete_label}
              </p>

              <button
                type="button"
                onClick={() => enterAsCoach(c.slot)}
                disabled={busy !== null}
                className="mt-5 inline-flex items-center justify-center rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
              >
                {busy === c.slot ? 'Entrando…' : `Entrar como ${c.label}`}
              </button>

              <div className="mt-4 border-t border-neutral-100 pt-4">
                <button
                  type="button"
                  onClick={() => revealBearer(c.slot)}
                  className="text-xs font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
                >
                  Mostrar acceso a la app (iOS) de {c.athlete_label}
                </button>

                {bearer && (
                  <div className="mt-3 space-y-2 rounded-lg bg-neutral-50 p-3 text-xs">
                    <div>
                      <span className="font-semibold text-neutral-700">athlete_id:</span>{' '}
                      <span className="font-mono text-neutral-900">{bearer.athlete_id}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-neutral-700">email:</span>{' '}
                      <span className="font-mono text-neutral-900">{bearer.athlete_email}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-neutral-700">Bearer JWT</span>
                      <textarea
                        readOnly
                        rows={4}
                        value={bearer.bearer}
                        onFocus={(e) => e.currentTarget.select()}
                        className="mt-1 w-full resize-none rounded border border-neutral-200 bg-white p-2 font-mono text-[10px] leading-snug text-neutral-800"
                      />
                    </div>
                    <p className="text-neutral-400">
                      Caduca: {new Date(bearer.expires_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-neutral-400">
        Acceso de demostración · gated por <code>DEMO_ACCESS</code> · nunca activo en producción
      </p>
    </div>
  );
}
