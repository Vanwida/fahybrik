'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DemoSignIn() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(j.error?.message ?? 'No se pudo entrar (¿COACH_ALLOWLIST en .env.local?)');
        return;
      }
      window.location.href = '/es';
    } catch {
      setError('No hay conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void enter()}
        disabled={loading}
        className="h-16 w-full rounded-xl bg-[color:var(--accent)] text-[color:var(--accent-on)] text-lg font-semibold disabled:opacity-60"
      >
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
