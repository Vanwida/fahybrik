'use client';

// PROPUESTA — el chat como TRES BANDAS explícitas:
//
//   1. encabezado fijo (no scrollea nunca)
//   2. conversación, que `llena` cuando hay mensajes y `centra` cuando no
//   3. compositor anclado abajo
//
// La banda 2 es el único cambio real de composición, y es el que arregla los
// ~460 pt muertos: el vacío deja de colgar de un `.padding(.top, 72)` fijo y se
// centra EN SU BANDA, entre encabezado y compositor, con el aire simétrico.
//
// El vacío gana salida: un arranque que RELLENA el compositor (no lo envía — el
// atleta lo edita). Y el error gana el reintento que hoy no existe, porque hoy
// esa rama reutiliza el bloque del vacío cambiando solo el copy.

import { useEffect, useRef, useState } from 'react';
import { Pantalla } from '../../kit-composicion/chrome';
import { EstadoCentrado } from '../../kit-composicion/estados';
import { S } from '../../kit-composicion/tokens';
import { ARRANQUES, COACH, CONVERSACION, CON_FALLO, type Mensaje } from './data';
import { AvatarCoach, Burbuja, CabeceraChat, Compositor, SeparadorDia } from './piezas';

export type ModoChat = 'vacio' | 'conversacion' | 'fallo' | 'error';

export function ChatPropuesta({ modo, onLog }: { modo: ModoChat; onLog: (l: string) => void }) {
  const [borrador, setBorrador] = useState('');

  const mensajes: Mensaje[] = modo === 'fallo' ? CON_FALLO : modo === 'conversacion' ? CONVERSACION : [];
  const hayConversacion = mensajes.length > 0;

  // Un chat se abre por el final: lo último dicho es lo que traes en la cabeza.
  const fondo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fondo.current?.scrollIntoView({ block: 'end' });
  }, [modo]);

  return (
    <Pantalla
      // La estrategia la decide el CONTENIDO, no la pantalla: con mensajes
      // `llena`; sin ellos el mismo hueco se reparte y `centra`.
      estrategia={hayConversacion ? 'llena' : 'centra'}
      cabecera={<CabeceraChat />}
      pie={<Compositor borrador={borrador} />}
    >
      {modo === 'error' ? (
        <EstadoCentrado
          cifra={<AvatarCoach tam={56} />}
          titulo="No se pudo cargar el chat"
          cuerpo="Lo que escribas ahora se guarda y sale solo en cuanto vuelvas a tener línea."
          salida={{ tipo: 'accion', texto: 'Reintentar', onTap: () => onLog('Reintentar → recarga el hilo') }}
        />
      ) : !hayConversacion ? (
        <EstadoCentrado
          cifra={<AvatarCoach tam={56} />}
          titulo={`Escribe a ${COACH.nombreCorto} para empezar`}
          cuerpo="Aquí van dudas, sensaciones y molestias. Lo que le cuentes cambia el entreno de mañana."
          salida={{
            tipo: 'accion',
            texto: 'Contarle cómo he ido hoy',
            onTap: () => {
              setBorrador(ARRANQUES[0]);
              onLog('Arranque → rellena el compositor, no lo envía');
            },
            secundaria: {
              texto: ARRANQUES[1],
              onTap: () => {
                setBorrador(ARRANQUES[1]);
                onLog('Arranque → «¿A qué ritmo tiro mañana?»');
              },
            },
            nota: 'Te contesta cuando pueda. No decimos «en línea»: no lo sabemos.',
          }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.m, padding: `${S.m}px ${S.l}px ${S.l}px` }}>
          {mensajes.map((m) => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
              {m.dia ? <SeparadorDia>{m.dia}</SeparadorDia> : null}
              <Burbuja m={m} onReintentar={() => onLog(`Reintentar el mensaje de las ${m.hora}`)} />
            </div>
          ))}
          <div ref={fondo} />
        </div>
      )}
    </Pantalla>
  );
}
