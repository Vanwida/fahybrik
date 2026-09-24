'use client';

// Pestañas de Negocio. Cada una es una ruta (se puede enlazar y volver atrás);
// las flechas cambian de pestaña como en cualquier Tabs del panel.

import { Tabs, type TabItem } from '@/components/v2/ui';
import { usePathname, useRouter } from '@/i18n/navigation';

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
    <Tabs
      aria-label="Secciones de Negocio"
      items={ITEMS}
      value={current}
      onValueChange={(v) => {
        if (v !== current) router.push(`/negocio/${v}`);
      }}
    />
  );
}
