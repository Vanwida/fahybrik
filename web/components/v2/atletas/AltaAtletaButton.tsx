'use client';

// AltaAtletaButton — the roster trigger for the "Alta / Invitar atleta" flow.
// Owns the modal open state; on a finished create it revalidates the server
// roster via router.refresh() so the new athlete appears without a reload.

import { useState } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';
import { AltaAtletaModal } from '@/components/v2/atletas/AltaAtletaModal';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export function AltaAtletaButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'v2-focus inline-flex h-9 shrink-0 items-center gap-2 rounded-[var(--v2-r-s)] px-3.5',
          'bg-[color:var(--v2-accent)] text-[13px] font-semibold text-[color:var(--v2-accent-fg)]',
          'transition-colors hover:bg-[color:var(--v2-accent-press)]',
        )}
      >
        <MIcon name="person_add" size={18} aria-hidden />
        Alta / Invitar
      </button>

      <AltaAtletaModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
