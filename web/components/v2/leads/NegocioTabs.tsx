'use client';

// Pestañas de Negocio. Cada una es una ruta (se puede enlazar y volver atrás);
// las flechas cambian de pestaña como en cualquier Tabs del panel.

import { CalendarClock } from 'lucide-react';
import { Tabs, buttonVariants, type TabItem } from '@/components/v2/ui';
import { Link, usePathname, useRouter } from '@/i18n/navigation';

type NegocioTab = 'leads' | 'cobros' | 'embudo';

const ITEMS: TabItem<NegocioTab>[] = [
  { value: 'leads', label: 'Leads' },
  { value: 'cobros', label: 'Cobros' },
  { value: 'embudo', label: 'Embudo' },
];

export function NegocioTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const current = (ITEMS.find((i) => pathname.startsWith(`/negocio/${i.value}`))?.value ?? 'leads') as NegocioTab;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <Tabs
        className="w-full min-w-0 sm:w-auto sm:flex-1"
        aria-label="Secciones de Negocio"
        items={ITEMS}
        value={current}
        onValueChange={(v) => {
          if (v !== current) router.push(`/negocio/${v}`);
        }}
      />
      <Link href="/ajustes/agenda" className={buttonVariants({ variant: 'ghost', className: 'self-start sm:self-auto' })}>
        <CalendarClock strokeWidth={1.75} aria-hidden />
        Agenda y cupo
      </Link>
    </div>
  );
}
