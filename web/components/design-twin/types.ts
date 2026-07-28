// El doble — contrato entre el escenario (TwinStage) y cada pantalla.
//
// Una pantalla del doble es un módulo que exporta { meta, escenarios, Screen }.
// El Screen es React puro: recibe orientación/apariencia/escenario y pinta el
// contenido del lienzo del iPhone (o del Watch). El marco (isla, barra de
// estado, bisel) lo pone DeviceFrame — la pantalla solo respeta los safe areas
// vía las vars --twin-safe-*. Cambiar de escenario REMONTA el componente
// (key), así cada guion se reproduce determinista desde cero.

import type { ComponentType } from 'react';

export type TwinOrientation = 'portrait' | 'landscape';
export type TwinAppearance = 'light' | 'dark';

/** Estado de sincronía con la app real — el sello del índice. */
export type TwinEstado =
  /** Réplica de una pantalla shipeada; `fuentes` apunta al Swift que espeja. */
  | 'espejo'
  /** Mockup de algo aún no construido en la app (sustituye al artifact suelto). */
  | 'propuesta'
  /** Hueco reconocido: la pantalla existe en la app pero aún no tiene doble. */
  | 'pendiente';

export type TwinZona =
  | 'Entreno en vivo'
  | 'Conexiones y relojes'
  | 'Marcas y tests'
  | 'Plan y hoy'
  | 'Perfil y ajustes';

export interface TwinEscenario {
  id: string;
  titulo: string;
  /** Una línea: qué simula y qué hay que mirar. */
  descripcion: string;
}

export interface TwinScreenProps {
  orientation: TwinOrientation;
  appearance: TwinAppearance;
  /** Escenario activo (id de `escenarios`). El remount ya viene dado por key. */
  escenario: string;
  /** Línea para la cronología del panel («0:02 · PM5 encontrado»). */
  onLog: (linea: string) => void;
}

export interface TwinMeta {
  id: string;
  titulo: string;
  zona: TwinZona;
  estado: Exclude<TwinEstado, 'pendiente'>;
  /** Una línea para la card del índice. */
  descripcion: string;
  /** Rutas repo-relativas del Swift espejado (vacío si es propuesta). */
  fuentes: string[];
  dispositivo: 'iphone' | 'watch';
  soportaHorizontal: boolean;
}

export interface TwinScreenModule {
  meta: TwinMeta;
  escenarios: TwinEscenario[];
  Screen: ComponentType<TwinScreenProps>;
}

/** Card de hueco para el índice — pantallas de la app aún sin doble. */
export interface TwinPendiente {
  titulo: string;
  zona: TwinZona;
  descripcion: string;
}
