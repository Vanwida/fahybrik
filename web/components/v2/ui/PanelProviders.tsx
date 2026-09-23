'use client';

import type { ReactNode } from 'react';
import { ToastProvider } from './Toast';
import { TooltipProvider } from './Tooltip';

/**
 * Proveedores de los primitivos (avisos con Deshacer + tooltips agrupados).
 * Se monta UNA vez dentro de `.v2-root`, envolviendo el contenido del shell.
 */
export function PanelProviders({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <ToastProvider>{children}</ToastProvider>
    </TooltipProvider>
  );
}
