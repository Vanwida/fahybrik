'use client';

import { useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';

export interface ProgramCopyAction { busy: boolean; create: () => Promise<void> }

/** Una sola acción de copia compartida por la barra, el menú y la recuperación. */
export function useProgramCopy(programId: string, prepare: () => Promise<boolean>): ProgramCopyAction {
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const create = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    let navigating = false;
    try {
      if (!await prepare()) return;
      const result = await apiJson<{ id: string }>(`/api/coach/program-months/${programId}/duplicate`, { method: 'POST' });
      router.push(`/${locale}/programar/programas/${result.id}`);
      navigating = true;
      toast({ title: 'Copia creada', description: 'Cambia su duración y después asígnala a los atletas.' });
    } catch (err) { toast({ title: 'No se pudo crear la copia', description: errorMessage(err), tone: 'danger' }); }
    finally { if (!navigating) { running.current = false; setBusy(false); } }
  };
  return { busy, create };
}
