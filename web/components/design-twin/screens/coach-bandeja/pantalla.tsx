'use client';

// LA BANDEJA — «Del coach».
//
// Arquetipo Lista (§6.2): el sujeto es EL CONJUNTO Y SU ESTADO, no un
// comunicado suelto. Por eso lo primero que se ve no es el más reciente sino lo
// que te BLOQUEA, y por eso la bandeja en calma se ve distinta de la bandeja
// llena: «estás al día» es información, y hoy no existe en ninguna parte.
//
// El orden no es cronológico a propósito, y es la decisión de diseño de la
// pantalla: (1) lo que bloquea, (2) lo que hay que hacer, (3) el foco que no
// caduca, (4) lo que hay que entender. Un briefing de 12 semanas por encima de
// una tarea que vence hoy sería ordenar por fecha de publicación, que es justo
// lo que hace el chat y por lo que las cosas se pierden.
//
// Sin nada publicado la Lista DEGRADA A VACÍO (§6.2): centrado, con salida, y
// la salida es el chat — porque la frontera entre las dos superficies hay que
// decirla, no suponerla.

import { useEffect, useState } from 'react';
import { Card, IconCheckCircle, entradaStyle } from '../../kit';
import { NavBar, Pantalla, Seccion } from '../../kit-composicion/chrome';
import { EstadoCentrado } from '../../kit-composicion/estados';
import { S } from '../../kit-composicion/tokens';
import {
  FOCO_SUENO,
  NOTA_PLAN,
  PREGUNTA_WAVE,
  PROTOCOLO_CALENTAMIENTO,
  TAREA_BETA_ALANINA,
  TAREA_TESTS,
} from '../../coach-com/data';
import {
  alDia,
  conEstado,
  insignia,
  type Pregunta,
  type Tarea,
} from '../../coach-com/modelo';
import { ChipTipo, ComunicadoCard, EstadoBadge } from '../../coach-com/piezas';

export type ModoBandeja = 'semana-fuerte' | 'al-dia' | 'vacio';

/** El estado de partida de cada escenario, determinista. La interacción es local. */
function guion(modo: ModoBandeja): { pregunta: Pregunta; tareas: Tarea[]; vista: boolean } {
  if (modo === 'al-dia') {
    return {
      pregunta: { ...PREGUNTA_WAVE, estado: 'respondido', elegida: 'sabado' },
      tareas: [conEstado(TAREA_BETA_ALANINA, 'hecho'), conEstado(TAREA_TESTS, 'hecho')],
      vista: true,
    };
  }
  return { pregunta: PREGUNTA_WAVE, tareas: [TAREA_BETA_ALANINA, TAREA_TESTS], vista: false };
}

export function Bandeja({ modo, onLog }: { modo: ModoBandeja; onLog: (linea: string) => void }) {
  const inicial = guion(modo);
  const [pregunta, setPregunta] = useState<Pregunta>(inicial.pregunta);
  const [tareas, setTareas] = useState<Tarea[]>(inicial.tareas);
  const [entrada, setEntrada] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntrada(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (modo === 'vacio') {
    return (
      <Pantalla estrategia="centra" cabecera={<NavBar titulo="Del coach" />}>
        <EstadoCentrado
          titulo="Aquí no hay nada todavía"
          cuerpo="Cuando Pablo te publique un protocolo, una tarea o el porqué de tu plan, vivirá aquí. El día a día sigue en el chat."
          salida={{
            tipo: 'accion',
            texto: 'Abrir el chat',
            onTap: () => onLog('Vacío → abrir el chat, que es donde sigue el día a día'),
            nota: 'Lo que se publica aquí lleva estado: Pablo ve si lo has hecho, no solo si lo has abierto.',
          }}
        />
      </Pantalla>
    );
  }

  const protocolo = modo === 'al-dia' ? conEstado(PROTOCOLO_CALENTAMIENTO, 'visto') : PROTOCOLO_CALENTAMIENTO;
  const nota = modo === 'al-dia' ? conEstado(NOTA_PLAN, 'visto') : NOTA_PLAN;
  const enCalma = alDia([pregunta, ...tareas, protocolo, nota, FOCO_SUENO]);
  const pendientes = tareas.filter((t) => t.estado !== 'hecho').length + (protocolo.estado === 'publicado' ? 1 : 0);

  const marcarTarea = (id: string) =>
    setTareas((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const hecha = t.estado === 'hecho';
        onLog(hecha ? `Desmarcada: ${t.titulo}` : `Hecha: ${t.titulo}`);
        return conEstado(t, hecha ? 'visto' : 'hecho');
      }),
    );

  return (
    <Pantalla estrategia="llena" cabecera={<NavBar titulo="Del coach" />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.l, padding: `${S.m}px ${S.l}px ${S.xl}px` }}>
        {enCalma ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: S.s, ...entradaStyle(entrada, 0) }}>
            <span style={{ color: 'var(--twin-ok)', display: 'inline-flex', flex: '0 0 auto' }}>
              <IconCheckCircle size={15} />
            </span>
            <span style={{ font: '500 13px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              Estás al día. Nada que responder ni que hacer.
            </span>
          </div>
        ) : null}

        <BloquePregunta
          pregunta={pregunta}
          entrada={entrada}
          onResponder={() => {
            setPregunta((p) => ({ ...p, estado: 'respondido', elegida: 'sabado' }));
            onLog('Responder → se abre la pregunta del wave');
          }}
          onAbrir={() => onLog('Abre la pregunta del wave')}
        />

        <section style={{ display: 'flex', flexDirection: 'column', gap: S.m, ...entradaStyle(entrada, 120) }}>
          <Seccion
            accesorio={
              <span style={{ font: '600 11px/1 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
                {pendientes === 0 ? 'nada pendiente' : `${pendientes} pendiente${pendientes === 1 ? '' : 's'}`}
              </span>
            }
          >
            Para hacer
          </Seccion>

          {tareas.map((t) => (
            <Card key={t.id} padding={S.m}>
              <ComunicadoCard
                c={t}
                marcar={{
                  hecho: t.estado === 'hecho',
                  etiqueta: `Marcar hecho: ${t.titulo}`,
                  onTap: () => marcarTarea(t.id),
                }}
                detalle={
                  <span style={{ font: '400 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                    {t.estado === 'hecho' ? t.resumen : `Vence ${t.vence}. ${t.porque}`}
                  </span>
                }
                onAbrir={() => onLog(`Abre la tarea: ${t.titulo}`)}
              />
            </Card>
          ))}

          <Card padding={S.m}>
            <ComunicadoCard c={protocolo} onAbrir={() => onLog('Abre el calentamiento del día de carrera')} />
          </Card>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: S.m, ...entradaStyle(entrada, 200) }}>
          <Seccion>El foco</Seccion>
          <Card padding={S.l}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: S.s }}>
                <ChipTipo tipo="foco" />
                <span style={{ flex: 1 }} />
                <EstadoBadge estado={insignia(FOCO_SUENO)} />
              </div>
              <span style={{ font: '650 17px/1.25 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
                {FOCO_SUENO.titulo}
              </span>
              <span style={{ font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                {FOCO_SUENO.linea}
              </span>
            </div>
          </Card>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: S.m, ...entradaStyle(entrada, 280) }}>
          <Seccion>Notas</Seccion>
          <Card padding={S.m}>
            <ComunicadoCard c={nota} onAbrir={() => onLog('Abre el briefing del plan de Singles Pro')} />
          </Card>
        </section>
      </div>
    </Pantalla>
  );
}

/**
 * La pregunta, arriba y con filo de acento mientras bloquea. Cuando ya está
 * respondida baja a tarjeta normal y enseña LO QUE ELEGISTE: una decisión que
 * cambia el taper no puede desaparecer de la bandeja al contestarla.
 */
function BloquePregunta({
  pregunta,
  entrada,
  onResponder,
  onAbrir,
}: {
  pregunta: Pregunta;
  entrada: boolean;
  onResponder: () => void;
  onAbrir: () => void;
}) {
  const respondida = pregunta.estado === 'respondido';
  const elegida = pregunta.opciones.find((o) => o.id === pregunta.elegida);

  return (
    <Card
      padding={S.l}
      topAccent={!respondida}
      elevated={!respondida}
      style={entradaStyle(entrada, 40)}
    >
      <ComunicadoCard
        c={pregunta}
        onAbrir={onAbrir}
        detalle={
          <span style={{ font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {respondida && elegida ? `Le dijiste: ${elegida.texto}. ${elegida.consecuencia}` : pregunta.contexto}
          </span>
        }
        pie={
          respondida ? null : (
            <button type="button" className="tw-btn-primary" onClick={onResponder} style={{ width: '100%', height: 46 }}>
              Responder
            </button>
          )
        }
      />
    </Card>
  );
}
