// Programar (PLAN §5–§6): Programas · Biblioteca · Grupos · Tests bajo un solo
// destino. La sub-navegación se oculta dentro de una pieza (un programa, un
// bloque, un grupo): allí la cabecera lleva su «volver».

import type { ReactNode } from 'react';
import { ProgramarTabs } from '@/components/v2/planes/ProgramarTabs';

export default function ProgramarLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-col">
      <ProgramarTabs />
      {children}
    </div>
  );
}
