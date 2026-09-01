'use client';

// El guion completo de «preguntar SOBRE algo», paso a paso.
//
// Lo que hay que poder juzgar mirando esto no es si el chip es bonito: es
// CUÁNTA PANTALLA cuesta la idea. Por eso cada guion enseña el cromo nativo
// donde entra la fila nueva (un menú de pulsación larga que ya existía, el
// diálogo del «+» que ya existía) en vez de enseñar solo el resultado.

import { useEffect, useRef } from 'react';
import { Pantalla } from '../../kit-composicion/chrome';
import { S } from '../../kit-composicion/tokens';
import type { Mensaje } from '../chat-coach/data';
import { Burbuja, CabeceraChat, ChipContexto, Compositor, SeparadorDia } from '../chat-coach/piezas';
import {
  BORRADOR,
  CONTEXTO_SESION,
  ELEGIBLES,
  HILO_CON_CONTEXTO,
  HILO_EJERCICIO,
  MENU_ADJUNTAR,
  MENU_EJERCICIO,
  MENU_SESION,
} from './data';
import {
  EJERCICIOS,
  FilaEjercicio,
  FondoBrief,
  FondoPlan,
  HojaDeAcciones,
  MenuFlotante,
  SelectorDeEntreno,
  TarjetaSesion,
  Velo,
} from './piezas';

export type Guion =
  | 'menu-plan'
  | 'mas'
  | 'cual'
  | 'chip'
  | 'enviado'
  | 'menu-ejercicio'
  | 'ejercicio-enviado';

/** El hilo ANTES de que exista el mensaje con contexto: las dos últimas sobran. */
const HILO_PREVIO = HILO_CON_CONTEXTO.slice(0, -2);

function Conversacion({ mensajes }: { mensajes: Mensaje[] }) {
  // Un chat se abre por el final: lo último dicho es lo que traes en la cabeza.
  const fondo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fondo.current?.scrollIntoView({ block: 'end' });
  }, [mensajes]);

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        gap: S.m,
        padding: `${S.m}px ${S.l}px ${S.l}px`,
      }}
    >
      {mensajes.map((m) => (
        <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
          {m.dia ? <SeparadorDia>{m.dia}</SeparadorDia> : null}
          <Burbuja m={m} />
        </div>
      ))}
      <div ref={fondo} />
    </div>
  );
}

/** Banda 3 con el contexto esperando encima de la fila de escritura. */
function PieConContexto({ etiqueta, borrador }: { etiqueta: string; borrador?: string }) {
  return (
    <div style={{ borderTop: '1px solid var(--twin-hairline)', paddingTop: S.m, background: 'var(--twin-bg)' }}>
      <ChipContexto etiqueta={etiqueta} />
      <Compositor borrador={borrador} sinBorde />
    </div>
  );
}

function Capa({ children, overlay }: { children: React.ReactNode; overlay?: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {children}
      {overlay}
    </div>
  );
}

/** Lo que la cronología del panel cuenta de cada guion. */
const CRONICA: Record<Guion, string> = {
  'menu-plan': 'Pulsación larga en la sesión → el menú que ya existe, con una fila más',
  'menu-ejercicio': 'Pulsación larga en el ejercicio → hoy esta fila no tiene menú; nace con dos entradas',
  mas: 'El «+» de siempre. La fila nueva va última: no mueve la memoria muscular de nadie',
  cual: 'La única superficie nueva de toda la propuesta, y solo se ve si la pides',
  chip: 'Contexto puesto y visible antes de enviar. Se quita con la ✕',
  enviado: 'La tarjeta viaja dentro de la burbuja: pregunta y sujeto son una sola cosa',
  'ejercicio-enviado': 'Contexto fino: el ejercicio DENTRO del entreno, no el entreno entero',
};

export function PantallaContexto({ guion, onLog }: { guion: Guion; onLog: (l: string) => void }) {
  useEffect(() => {
    onLog(CRONICA[guion]);
    // El escenario remonta el componente, así que esto corre una vez por guion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guion]);

  if (guion === 'menu-plan' || guion === 'menu-ejercicio') {
    const esPlan = guion === 'menu-plan';
    // A qué altura está la cosa pulsada en su pantalla: la copia levantada
    // aparece EXACTAMENTE donde estaba, que es lo que hace iOS, y el menú
    // cuelga de ella. Medido sobre el propio fondo de al lado.
    const arranque = esPlan ? 52 : 75;
    return (
      <Capa
        overlay={
          <Velo colocacion="arriba">
            <div style={{ padding: `${arranque}px ${S.l}px 0`, display: 'grid', gap: S.s }}>
              {esPlan ? (
                <TarjetaSesion levantada />
              ) : (
                <FilaEjercicio n={EJERCICIOS[0].n} nombre={EJERCICIOS[0].nombre} dosis={EJERCICIOS[0].dosis} levantada />
              )}
              <MenuFlotante filas={esPlan ? MENU_SESION : MENU_EJERCICIO} />
            </div>
          </Velo>
        }
      >
        {esPlan ? <FondoPlan /> : <FondoBrief />}
      </Capa>
    );
  }

  const conChip = guion === 'chip';
  const mensajes =
    guion === 'enviado' ? HILO_CON_CONTEXTO : guion === 'ejercicio-enviado' ? HILO_EJERCICIO : HILO_PREVIO;

  const chat = (
    <Pantalla
      estrategia="llena"
      cabecera={<CabeceraChat />}
      pie={
        conChip ? (
          <PieConContexto etiqueta={CONTEXTO_SESION.label} borrador={BORRADOR} />
        ) : (
          <Compositor />
        )
      }
    >
      <Conversacion mensajes={mensajes} />
    </Pantalla>
  );

  if (guion === 'mas') {
    return (
      <Capa
        overlay={
          <Velo>
            <HojaDeAcciones titulo="Añadir al mensaje" filas={MENU_ADJUNTAR} />
          </Velo>
        }
      >
        {chat}
      </Capa>
    );
  }

  if (guion === 'cual') {
    return (
      <Capa
        overlay={
          <Velo>
            <SelectorDeEntreno secciones={ELEGIBLES} elegido={CONTEXTO_SESION.ref} />
          </Velo>
        }
      >
        {chat}
      </Capa>
    );
  }

  return chat;
}
