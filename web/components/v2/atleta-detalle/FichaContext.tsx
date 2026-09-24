'use client';

// Lo que comparten las piezas de la ficha: el atleta (cabecera) y las acciones que
// abren paneles globales de la ficha — la conversación, el compositor de
// comunicados, asignar programa, un entreno en el panel-editor, una herramienta
// de semana — y el «recarga el calendario» tras cualquier cambio del plan.

import { createContext, useContext } from 'react';
import type { FichaShell } from '@/lib/dashboard/v2/atleta-detalle-types';

export type WeekTool = 'copy' | 'shift' | 'scale' | 'deload' | 'evaluar';

export interface FichaActions {
  shell: FichaShell;
  openChat: () => void;
  openComposer: () => void;
  openAssign: () => void;
  /** Abre un entreno en el panel-editor; `ai` abre además «Redactar con IA». */
  openSession: (id: string, opts?: { ai?: boolean }) => void;
  openWeekTool: (tool: WeekTool, weekStart: string) => void;
  /** Contador que sube tras cada cambio del plan: el calendario se recarga. */
  calendarVersion: number;
  bumpCalendar: () => void;
  /** Refresca lo que pinta el servidor (estado, «Hacer ahora»). */
  refresh: () => void;
}

export const FichaContext = createContext<FichaActions | null>(null);

export function useFicha(): FichaActions {
  const ctx = useContext(FichaContext);
  if (!ctx) throw new Error('useFicha fuera de <Ficha>');
  return ctx;
}
