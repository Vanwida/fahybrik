'use client';

// Cerrar sesión del coach. El auth del dashboard es Clerk (ver coach-session.ts),
// así que basta con signOut() de Clerk: borra la sesión → getCoachSession pasa a
// null → el gate del layout redirige. Hacemos un hard-redirect a /sign-in después
// para no dejar una vista con sesión ya muerta.
import { useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { MIcon } from '@/components/ui/MIcon';

export function LogoutButton() {
  const { signOut } = useClerk();
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await signOut();
        } finally {
          window.location.href = '/sign-in';
        }
      }}
      className="v2-focus inline-flex items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-4 py-2.5 text-sm font-semibold text-[color:var(--v2-danger,#c0362c)] transition-colors hover:border-[color:var(--v2-danger,#c0362c)] disabled:opacity-60"
      aria-label="Cerrar sesión"
    >
      <MIcon name="logout" size={18} />
      {loading ? 'Cerrando sesión…' : 'Cerrar sesión'}
    </button>
  );
}
