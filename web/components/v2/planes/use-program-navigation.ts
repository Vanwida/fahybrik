'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/v2/ui';

/** También cubre los enlaces de la navegación global, fuera del editor. */
export function useProgramNavigation(hasPending: () => boolean, settle: () => Promise<boolean>) {
  const router = useRouter();
  const { toast } = useToast();
  const preparing = useRef<Promise<boolean> | null>(null);
  const prepare = useCallback(async () => {
    if (preparing.current) return preparing.current;
    const result = settle();
    preparing.current = result;
    try {
      const ready = await result;
      if (!ready) toast({ title: 'Aún hay cambios o entregas pendientes', description: 'Revisa el aviso de guardado y vuelve a intentarlo.', tone: 'warn' });
      return ready;
    } finally { preparing.current = null; }
  }, [settle, toast]);
  useEffect(() => {
    const protect = (event: MouseEvent) => {
      if (!hasPending() || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      void prepare().then((ready) => { if (ready) router.push(`${url.pathname}${url.search}${url.hash}`); });
    };
    document.addEventListener('click', protect, true);
    return () => document.removeEventListener('click', protect, true);
  }, [hasPending, prepare, router]);
  return prepare;
}
