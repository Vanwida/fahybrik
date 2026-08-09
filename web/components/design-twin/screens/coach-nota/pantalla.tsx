'use client';

// LA NOTA — el briefing del plan rehecho, legible.
//
// Es el comunicado más largo de los cinco y el que peor sobrevive al chat: doce
// semanas de estructura, una banda de objetivo y el porqué de cada decisión no
// caben en una burbuja, y sobre todo no se pueden RELEER en octubre sin subir
// media pantalla buscándolos.
//
// Aquí la nota tiene secciones con nombre, y cada una responde a una pregunta:
// qué ha cambiado · a qué aspiro · por qué seis sesiones no son seis palizas ·
// por dónde voy a pasar. El sujeto es la banda del objetivo, en mono y grande,
// porque es el número que el atleta viene a buscar.
//
// El pie es lo que cierra el círculo: un briefing que deja una decisión abierta
// lo DICE y enlaza a ella, en vez de dejar que se pierda en otra pantalla.

import { useEffect, useState, type CSSProperties } from 'react';
import { Card, Display, Hairline, IconCheckCircle, IconChevron, Label, entradaStyle } from '../../kit';
import { Pantalla } from '../../kit-composicion/chrome';
import { S } from '../../kit-composicion/tokens';
import { NOTA_PLAN, PREGUNTA_WAVE } from '../../coach-com/data';
import { conEstado, insignia, type Nota, type SeccionNota } from '../../coach-com/modelo';
import { CabeceraDetalle, ChipTipo, EstadoBadge } from '../../coach-com/piezas';
import { Bloque } from './bloques';

export type ModoNota = 'nueva' | 'al-dia';

export function PantallaNota({ modo, onLog }: { modo: ModoNota; onLog: (linea: string) => void }) {
  const anima = modo === 'nueva';
  const [visible, setVisible] = useState(!anima);

  useEffect(() => {
    if (!anima) return;
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [anima]);

  const nota: Nota = anima ? NOTA_PLAN : conEstado(NOTA_PLAN, 'visto');
  const respondida = !anima;

  return (
    <Pantalla
      estrategia="llena"
      cabecera={
        <CabeceraDetalle
          c={nota}
          onVolver={() => onLog('Volver a Del coach')}
          accesorio={<EstadoBadge estado={insignia(nota)} />}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.l, padding: `${S.l}px ${S.l}px ${S.xl}px` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.s, ...entradaStyle(visible, 0) }}>
          <Display size={26}>{nota.titulo}</Display>
          <span style={{ font: '400 13.5px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {nota.resumen}
          </span>
        </div>

        {nota.secciones.map((seccion, i) => (
          <Seccion key={seccion.etiqueta} seccion={seccion} style={entradaStyle(visible, 90 + i * 90)} />
        ))}

        {nota.cruce ? (
          <div style={entradaStyle(visible, 90 + nota.secciones.length * 90)}>
            <Cruce
              respondida={respondida}
              onAbrir={() => onLog('Del briefing a la pregunta del wave')}
            />
          </div>
        ) : null}
      </div>
    </Pantalla>
  );
}

/** Cada sección es una tarjeta con su etiqueta: se vuelve a UNA, no a la nota entera. */
function Seccion({ seccion, style }: { seccion: SeccionNota; style?: CSSProperties }) {
  return (
    <div style={style}>
      <Card padding={S.l}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
          <Label size={10}>{seccion.etiqueta}</Label>
          <Hairline />
          {seccion.bloques.map((bloque, i) => (
            <Bloque key={i} bloque={bloque} />
          ))}
        </div>
      </Card>
    </div>
  );
}

/**
 * El enlace cruzado. Sin responder es una llamada a la acción; respondido no
 * desaparece, se convierte en el recibo de lo que decidiste: en octubre el
 * atleta va a querer saber sobre qué fecha está montado su taper.
 */
function Cruce({ respondida, onAbrir }: { respondida: boolean; onAbrir: () => void }) {
  const elegida = PREGUNTA_WAVE.opciones.find((o) => o.id === 'sabado');

  return (
    // `all: unset` deja el botón encogiéndose a su contenido: sin el ancho
    // explícito, el recibo corto sale más estrecho que las secciones de arriba.
    <button type="button" onClick={onAbrir} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
      <Card padding={S.l} leftAccent={!respondida}>
        <div style={{ display: 'flex', alignItems: 'center', gap: S.m }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: S.s }}>
              <ChipTipo tipo="pregunta" />
              {respondida ? (
                <span style={{ color: 'var(--twin-ok)', display: 'inline-flex' }}>
                  <IconCheckCircle size={13} />
                </span>
              ) : null}
            </span>
            <span style={{ font: '650 14.5px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
              {PREGUNTA_WAVE.titulo}
            </span>
            <span style={{ font: '400 12.5px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              {respondida && elegida
                ? `Le dijiste: ${elegida.texto}. ${elegida.consecuencia}`
                : 'Falta que le digas si tu wave es el jueves o el sábado. Hasta entonces, el taper va montado sobre el sábado 14.'}
            </span>
          </span>
          <span style={{ color: 'var(--twin-faint)', display: 'inline-flex', flex: '0 0 auto' }}>
            <IconChevron size={13} />
          </span>
        </div>
      </Card>
    </button>
  );
}
