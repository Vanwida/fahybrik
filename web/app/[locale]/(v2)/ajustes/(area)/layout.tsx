// Ajustes — un área con sub-navegación a la izquierda (escritorio) y una
// columna de 720 px. En el móvil la sub-navegación es la lista de /ajustes y
// cada panel trae su «‹ Ajustes». La lista de puesta en marcha va en «Tu
// perfil», que es donde se entra a Ajustes.

import type { ReactNode } from 'react';
import { AjustesNav } from '@/components/v2/ajustes/AjustesNav';

export default function AjustesAreaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[968px] gap-8">
      <aside className="hidden w-[200px] shrink-0 md:block">
        <div className="sticky top-20">
          <AjustesNav />
        </div>
      </aside>
      <div className="flex min-w-0 max-w-[720px] flex-1 flex-col gap-6">
        {children}
      </div>
    </div>
  );
}
