'use client';

// La sub-navegación de Programar: Programas · Biblioteca · Grupos · Tests. Un
// solo nivel de pestañas (Tabs, flechas ←/→). Dentro de un programa, un bloque o
// un grupo no se pinta: allí manda la cabecera con su «volver».

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { Tabs } from '@/components/v2/ui';

const TABS = [
  { value: 'programas', label: 'Programas' },
  { value: 'biblioteca', label: 'Biblioteca' },
  { value: 'grupos', label: 'Grupos' },
  { value: 'tests', label: 'Tests' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export function ProgramarTabs() {
  const locale = useLocale();
  const router = useRouter();
  const path = usePathname() ?? '';
  const parts = path.split('/').filter(Boolean); // [es, programar, <tab>, …]
  const current = (TABS.find((t) => t.value === parts[2])?.value ?? 'programas') as Tab;
  if (parts.length > 3) return null;
  return (
    <Tabs
      aria-label="Programar"
      items={TABS.map((t) => ({ value: t.value, label: t.label }))}
      value={current}
      onValueChange={(v) => router.push(`/${locale}/programar/${v}`)}
      className="mb-5"
    />
  );
}
