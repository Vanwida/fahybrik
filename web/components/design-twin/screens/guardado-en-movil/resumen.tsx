'use client';

// «resumen» — el resumen del entreno cuando el servidor lo rechaza.
//
// Es el MISMO registro de `post-entreno` (la tarjeta se importa de allí, no se
// copia): lo que el atleta hizo no cambia porque el servidor diga que no. Lo que
// cambia es la franja de abajo, y solo ella:
//
//   antes    GUARDAR
//   después  «Guardado en tu móvil» + la línea de Alex + CERRAR
//
// Tres cosas que salen fuera y por qué:
//   · La línea «Se va a guardar» de la tarjeta: ya no se va a guardar, ya ESTÁ
//     guardado — en el móvil. Dejarla contradiría el aviso de abajo.
//   · Esfuerzo / Cómo ha ido / Notas: viajaron dentro del envío y el teléfono
//     guarda ese envío entero (`RequestQueue.rejected`). Reabrirlas aquí sería
//     ofrecer editar algo que ya no va a ningún sitio.
//   · REINTENTAR: un 4xx es determinista (`RequestQueue.isRetriable`), repetir
//     el mismo envío da el mismo rechazo. Hoy es la ÚNICA salida de la pantalla
//     y no sale a ningún sitio (escenario «hoy»). Tampoco «subir como libre»:
//     perdería el vínculo con la sesión del coach (DECISIONS 2026-09-25).
//
// El guion arranca en GUARDANDO… porque así llega el atleta a este estado: tocó
// GUARDAR, esperó, y la pantalla se asienta — sin sacudida, sin rojo.

import { useState } from 'react';
import { CTA, Pantalla, entradaStyle } from '../../kit';
import { useTimeline } from '../../sim';
import { TarjetaRegistro } from '../post-entreno/propuesta';
import { RECHAZADO } from './datos';
import { AvisoGuardado } from './piezas';

/** Lo que tarda en volver el 4xx en el guion. Lo bastante para leer GUARDANDO…, nada más. */
const RESPUESTA_MS = 1300;

/** Un frame: el aviso se monta oculto y LUEGO entra, o la transición no corre. */
const FRAME_MS = 32;

export function Resumen({ onLog }: { onLog: (linea: string) => void }) {
  const [asentado, setAsentado] = useState(false);
  const [visible, setVisible] = useState(false);

  useTimeline([
    {
      at: RESPUESTA_MS,
      run: () => {
        setAsentado(true);
        onLog('El servidor contesta 4xx → la cola lo guarda en `rejected` (no lo tira) y el reloj conserva su copia');
      },
    },
    { at: RESPUESTA_MS + FRAME_MS, run: () => setVisible(true) },
  ]);

  return (
    <Pantalla
      accion={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {asentado && <AvisoGuardado style={entradaStyle(visible, 0)} />}
          <CTA
            title={asentado ? 'CERRAR' : 'GUARDANDO…'}
            height={64}
            style={asentado ? undefined : { opacity: 0.55, pointerEvents: 'none' }}
            onClick={() => onLog('CERRAR — el resumen se cierra. El entreno queda en tu historial como «Sin subir».')}
          />
          {/* La línea bajo la acción es la misma posición que «Se guarda tal cual»
              en el resumen de siempre: dice qué pasa después de tocar. Es la
              única frase añadida al copy de Alex — une el aviso con el
              historial, que es donde el atleta va a volver a verlo. */}
          <p
            style={{
              margin: 0,
              minHeight: 14,
              textAlign: 'center',
              font: '500 11px var(--twin-font-sans)',
              color: 'var(--twin-faint)',
              ...entradaStyle(visible, 120),
            }}
          >
            Lo tienes en tu historial, marcado «Sin subir».
          </p>
        </div>
      }
    >
      <TarjetaRegistro sesion={RECHAZADO.sesion} medido={RECHAZADO.medido} onLog={onLog} encabezado={null} />
    </Pantalla>
  );
}
