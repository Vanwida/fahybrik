// La cabecera de cada panel de Ajustes: título + una línea, y en el móvil el
// «‹ Ajustes» para volver a la lista. El resto del panel va como hijos.

import type { ReactNode } from 'react';
import { getLocale } from 'next-intl/server';
import { PageHeader } from '@/components/v2/ui';

export async function AjustesPanel({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const locale = await getLocale();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={actions}
        back={{ href: `/${locale}/ajustes`, label: 'Ajustes' }}
        className="[&>a:first-child]:md:hidden"
      />
      {children}
    </div>
  );
}
