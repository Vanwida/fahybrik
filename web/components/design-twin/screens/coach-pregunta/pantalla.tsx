'use client';

// LA PREGUNTA — el detalle de una decisión que bloquea el plan.
//
// Estrategia `centra` (§6.1): esto es UNA SOLA DECISIÓN, así que el bloque se
// reparte el aire de forma simétrica en vez de apilarse arriba. No lleva acción
// anclada a propósito: las opciones SON la acción, y un botón «Enviar» debajo
// solo añadiría un segundo toque a algo que ya se contesta con uno.
//
// La pieza que hace que esto no sea una encuesta es la CONSECUENCIA: cada
// opción dice qué le pasa a tu plan si la eliges. Sin eso el atleta contesta a
// ciegas y el coach recibe un dato que no sabe si está informado.

import { useState } from 'react';
import { Card, Display, IconCheckCircle, IconCircle, Notice } from '../../kit';
import { Pantalla } from '../../kit-composicion/chrome';
import { S } from '../../kit-composicion/tokens';
import { PREGUNTA_WAVE } from '../../coach-com/data';
import { insignia, type OpcionPregunta, type Pregunta } from '../../coach-com/modelo';
import { CabeceraDetalle, EstadoBadge } from '../../coach-com/piezas';

export type ModoPregunta = 'sin-responder' | 'respondida';

export function PantallaPregunta({ modo, onLog }: { modo: ModoPregunta; onLog: (linea: string) => void }) {
  const [elegida, setElegida] = useState<string | null>(modo === 'respondida' ? 'sabado' : null);
  const respondida = elegida !== null;

  const pregunta: Pregunta = respondida
    ? { ...PREGUNTA_WAVE, estado: 'respondido', elegida }
    : PREGUNTA_WAVE;
  const opcionElegida = pregunta.opciones.find((o) => o.id === elegida) ?? null;

  const responder = (o: OpcionPregunta) => {
    setElegida(o.id);
    onLog(`Respondido: ${o.texto} · ${o.consecuencia}`);
  };

  return (
    <Pantalla
      estrategia="centra"
      cabecera={
        <CabeceraDetalle
          c={pregunta}
          onVolver={() => onLog('Volver a Del coach')}
          accesorio={<EstadoBadge estado={insignia(pregunta)} />}
        />
      }
    >
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: S.l,
          padding: `${S.l}px ${S.l}px ${S.xl}px`,
          boxSizing: 'border-box',
        }}
      >
        <Display size={26}>{pregunta.titulo}</Display>

        <span style={{ font: '400 14.5px/1.5 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          {pregunta.contexto}
        </span>

        {pregunta.bloquea && !respondida ? (
          <Notice tone="warning">
            Mientras no lo digas, el taper se queda montado contando con el sábado.
          </Notice>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
          {pregunta.opciones.map((o) => (
            <Opcion
              key={o.id}
              opcion={o}
              elegida={o.id === elegida}
              apagada={respondida && o.id !== elegida}
              onTap={() => responder(o)}
            />
          ))}
        </div>

        {respondida && opcionElegida ? (
          <Confirmacion
            texto="Respondido. Pablo lo verá y el taper se ajusta."
            onCambiar={() => {
              setElegida(null);
              onLog('Cambiar respuesta → la pregunta vuelve a estar abierta');
            }}
          />
        ) : null}
      </div>
    </Pantalla>
  );
}

/**
 * Una opción es una tarjeta tocable, no una fila de radio: lo que decide no es
 * el texto de la opción sino su consecuencia, y una consecuencia de dos líneas
 * no cabe al lado de un círculo.
 */
function Opcion({
  opcion,
  elegida,
  apagada,
  onTap,
}: {
  opcion: OpcionPregunta;
  elegida: boolean;
  apagada: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-pressed={elegida}
      // El ancho explícito porque `all: unset` deja el botón encogiéndose a su
      // contenido: «Sábado 14 · El plan se queda como está» saldría más
      // estrecho que la otra opción, y dos opciones no se comparan así.
      style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', opacity: apagada ? 0.5 : 1 }}
    >
      <Card padding={S.l} leftAccent={elegida} elevated={elegida}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: S.m }}>
          <span
            aria-hidden
            style={{ color: elegida ? 'var(--twin-ok)' : 'var(--twin-faint)', display: 'inline-flex', paddingTop: 1 }}
          >
            {elegida ? <IconCheckCircle size={19} /> : <IconCircle size={19} />}
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ font: '650 16px/1.25 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
              {opcion.texto}
            </span>
            <span style={{ font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              {opcion.consecuencia}
            </span>
          </span>
        </div>
      </Card>
    </button>
  );
}

function Confirmacion({ texto, onCambiar }: { texto: string; onCambiar: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: S.s }}>
      <span style={{ color: 'var(--twin-ok)', display: 'inline-flex', flex: '0 0 auto' }}>
        <IconCheckCircle size={15} />
      </span>
      <span style={{ flex: 1, font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        {texto}
      </span>
      <button
        type="button"
        onClick={onCambiar}
        style={{
          all: 'unset',
          cursor: 'pointer',
          flex: '0 0 auto',
          font: '650 13px/1.2 var(--twin-font-sans)',
          color: 'var(--twin-accent-text)',
        }}
      >
        Cambiar
      </button>
    </div>
  );
}
