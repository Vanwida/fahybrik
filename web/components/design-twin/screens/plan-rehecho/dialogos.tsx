'use client';

// LOS DIÁLOGOS de Plan (`PlanDialogos`, `LiveWorkoutLaunchConflictDialog` y el
// «Límite de visibilidad»): el mismo texto y las mismas salidas que en Swift, en
// un solo sitio para que la pestaña con coach y la libre no los escriban dos veces.

import type { SesionDelPlan } from '../../kit-plan/contrato';
import { TEXTOS } from '../../kit-plan/textos';
import { Alerta } from './capas';

export type Dialogo =
  /** El club no deja ver la semana que viene todavía. */
  | { tipo: 'muro' }
  /** «Empezar» con otro entreno en curso o guardado: nunca se pisa en silencio. */
  | { tipo: 'conflicto'; sesion: SesionDelPlan }
  | { tipo: 'deshacer'; sesion: SesionDelPlan }
  | { tipo: 'borrar'; sesion: SesionDelPlan };

export function Dialogos({
  dialogo,
  muro,
  guardado,
  onCerrar,
  onDeshacer,
  onBorrar,
  onLog,
}: {
  dialogo: Dialogo | null;
  /** El mensaje del club (`plan_visibility.wall_message`). Null: el de por defecto. */
  muro?: string | null;
  /** Título del entreno en curso o guardado, si lo hay. */
  guardado?: string | null;
  onCerrar: () => void;
  onDeshacer?: (s: SesionDelPlan) => void;
  onBorrar: (s: SesionDelPlan) => void;
  onLog: (linea: string) => void;
}) {
  if (!dialogo) return null;

  switch (dialogo.tipo) {
    case 'muro':
      return (
        <Alerta
          titulo={TEXTOS.muro.titulo}
          mensaje={muro ?? TEXTOS.muro.porDefecto}
          botones={[{ texto: TEXTOS.muro.cerrar, onClick: onCerrar }]}
          onCerrar={onCerrar}
        />
      );
    case 'conflicto':
      return (
        <Alerta
          titulo={TEXTOS.conflicto.titulo}
          mensaje={TEXTOS.conflicto.mensaje(guardado ?? null)}
          botones={[
            {
              texto: TEXTOS.conflicto.seguir,
              onClick: () => {
                onCerrar();
                onLog(`Seguir → vuelve al entreno en curso «${guardado}»`);
              },
            },
            {
              texto: TEXTOS.conflicto.terminar,
              destructivo: true,
              onClick: () => {
                onCerrar();
                onLog(`Terminar y empezar → cierra «${guardado}» y abre la ficha de «${dialogo.sesion.titulo}»`);
              },
            },
            { texto: TEXTOS.conflicto.cancelar, neutro: true, onClick: onCerrar },
          ]}
          onCerrar={onCerrar}
        />
      );
    case 'deshacer':
      return (
        <Alerta
          titulo={TEXTOS.deshacer.titulo}
          mensaje={TEXTOS.deshacer.mensaje}
          botones={[
            { texto: TEXTOS.deshacer.confirmar, destructivo: true, onClick: () => onDeshacer?.(dialogo.sesion) },
            { texto: TEXTOS.deshacer.cancelar, neutro: true, onClick: onCerrar },
          ]}
          onCerrar={onCerrar}
        />
      );
    case 'borrar':
      return (
        <Alerta
          titulo={TEXTOS.borrar.titulo}
          mensaje={TEXTOS.borrar.mensaje}
          botones={[
            { texto: TEXTOS.borrar.confirmar, destructivo: true, onClick: () => onBorrar(dialogo.sesion) },
            { texto: TEXTOS.borrar.cancelar, neutro: true, onClick: onCerrar },
          ]}
          onCerrar={onCerrar}
        />
      );
  }
}
