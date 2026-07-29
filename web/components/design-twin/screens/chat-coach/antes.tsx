'use client';

// HOY — el vacío y el error del chat, transcritos de ChatView.swift:793-809.
//
// Corrección a la sospecha inicial: el compositor **sí** está anclado — es el
// último hijo del `VStack(spacing: 0)` raíz, hermano del ScrollView, así que se
// pega abajo solo. Ese no es el fallo.
//
// El fallo es el de en medio: el bloque vacío cuelga de un `.padding(.top, 72)`
// fijo dentro del ScrollView, ni centrado ni repartido, y deja ~460 pt entre el
// texto y el compositor. Y la rama de error reutiliza ESE MISMO bloque cambiando
// solo el copy (línea 796): sin botón, sin reintento, sin salida.

import { HuecoMuerto } from '../../kit-composicion/estados';
import { Pantalla } from '../../kit-composicion/chrome';
import { S } from '../../kit-composicion/tokens';
import { AvatarCoach, CabeceraChat, Compositor } from './piezas';
import { COACH } from './data';

export function ChatHoy({ modo }: { modo: 'vacio' | 'error' }) {
  const titulo = modo === 'error' ? 'No se pudo cargar el chat' : `Escribe a ${COACH.nombreCorto} para empezar`;
  const cuerpo =
    modo === 'error'
      ? 'Revisa tu conexión. Tus mensajes se enviarán cuando vuelvas.'
      : 'Tu coach responde aquí. Dudas, RPE, sensaciones.';

  return (
    <Pantalla estrategia="llena" cabecera={<CabeceraChat />}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* `.padding(.top, 72)` literal */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: S.m,
            padding: `72px ${S.xxl}px 0`,
            textAlign: 'center',
          }}
        >
          <AvatarCoach tam={56} />
          <span style={{ font: 'italic 700 15px/1.25 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{titulo}</span>
          <span style={{ font: '400 12px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{cuerpo}</span>
        </div>

        <HuecoMuerto
          nota={
            modo === 'error'
              ? 'Y esta rama no ofrece reintentar: es el mismo bloque del vacío con otro texto.'
              : 'Ni centrado ni scrolleado: un padding de 72 pt fijo y el resto se cae.'
          }
        />

        <Compositor />
      </div>
    </Pantalla>
  );
}
