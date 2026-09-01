'use client';

// Chat con el coach — PROPUESTA de composición (§6 del docs/CONTRATO-UI.md).
//
// 1197 líneas y CERO usos de `Theme.Spacing`. El vacío cuelga de un
// `.padding(.top, 72)` fijo — ni centrado ni scrolleado — y deja ~460 pt entre
// el texto y el compositor. La rama de error reutiliza ese mismo bloque
// cambiando solo el copy, así que no ofrece reintentar.
//
// Corrección al diagnóstico de partida, y conviene decirlo: **el compositor ya
// está anclado**. Es el último hijo del `VStack(spacing: 0)` raíz, hermano del
// ScrollView, así que se pega abajo solo. Lo que falta no es anclarlo, es que
// la banda de en medio decida qué hace con su hueco.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { ChatHoy } from './antes';
import { ChatPropuesta, type ModoChat } from './propuesta';

export const meta: TwinMeta = {
  id: 'chat-coach',
  titulo: 'Chat — tres bandas explícitas',
  zona: 'Perfil y ajustes',
  estado: 'construida',
  actualizado: '2026-07-29',
  descripcion:
    'Encabezado fijo · conversación que llena (y centra cuando está vacía) · compositor anclado. Con la conversación real de producción y el error que por fin ofrece reintentar.',
  fuentes: ['ios/FAHYBRIK/Chat/ChatView.swift'],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'hoy-vacio',
    titulo: 'HOY · hilo sin estrenar',
    descripcion:
      'El caso real del hilo 265 (lleva desde el 9 de julio a cero). Padding de 72 pt fijo y el resto se cae: la franja mide el hueco.',
  },
  {
    id: 'vacio',
    titulo: 'Propuesta · hilo sin estrenar',
    descripcion:
      'El bloque se centra en SU banda, entre encabezado y compositor, y gana salida: el arranque rellena el compositor sin enviarlo.',
  },
  {
    id: 'conversacion',
    titulo: 'Propuesta · conversación real',
    descripcion:
      'Los ocho mensajes del hilo 276 tal cual: sled, ritmo del 500, el negativo del remo. Separadores por día y hora bajo cada burbuja.',
  },
  {
    id: 'fallo',
    titulo: 'Propuesta · un mensaje no sale',
    descripcion: 'El reintento vive pegado al mensaje que falló, que es donde el atleta lo busca.',
  },
  {
    id: 'hoy-error',
    titulo: 'HOY · no carga',
    descripcion: 'La rama de error reutiliza el bloque del vacío cambiando el copy (línea 796): no hay reintentar.',
  },
  {
    id: 'error',
    titulo: 'Propuesta · no carga',
    descripcion: 'Mismo sitio, mismo centrado, y un botón de reintentar. El compositor sigue vivo: lo escrito se encola.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  if (escenario === 'hoy-vacio' || escenario === 'hoy-error') {
    return (
      <div className="twin-screen-safe">
        <ChatHoy modo={escenario === 'hoy-error' ? 'error' : 'vacio'} />
      </div>
    );
  }
  return (
    <div className="twin-screen-safe">
      <ChatPropuesta modo={escenario as ModoChat} onLog={onLog} />
    </div>
  );
}
