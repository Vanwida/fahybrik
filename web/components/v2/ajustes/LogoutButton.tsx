'use client';

// Cerrar sesión del coach. El acceso al panel es de Clerk (coach-session.ts):
// signOut() borra la sesión, el layout deja de encontrarla y se va a /sign-in.
// Redirección dura después, para no dejar una vista con la sesión ya muerta.

import { useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/v2/ui';

export function LogoutButton({ className }: { className?: string }) {
  const { signOut } = useClerk();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      icon={LogOut}
      loading={loading}
      className={className}
      onClick={async () => {
        setLoading(true);
        try {
          await signOut();
        } finally {
          window.location.href = '/sign-in';
        }
      }}
    >
      Cerrar sesión
    </Button>
  );
}
