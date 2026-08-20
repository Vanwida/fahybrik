'use client';

// LA LECTURA DE UNA SESIÓN — al terminar algo que no es una carrera sola.
//
// CARD 118. Una sesión real de fuerza y trineos de 47′ se leía a pantalla
// completa como «RITMO MEDIO · 0:00/km · Corriste a una sola intensidad», sin
// una palabra del peso muerto, el remo o los trineos: la app solo sabía
// contar la historia de una carrera y la contaba aunque la sesión no lo fuera.
// El enrutado ya decide en Swift cuándo esto NO es una carrera; esta es la
// lectura que le corresponde a la que no lo es. Ver `lectura-carrera` para la
// que sí — comparten voz (`kit-vivo`, `BandaAnclada`) y no la reinventan.
//
// COMPOSICIÓN. Arquetipo Detalle, estrategia llena (§6.1 del CONTRATO-UI): el
// cromo y el sujeto caen en el mismo punto óptico que en las diez vistas en
// vivo (§10.3), y por debajo la pantalla scrollea con el desglose, que es
// donde vive el contenido real — un simulacro de cuatro rondas se agrupa por
// ronda (§ modelo.agruparPorRonda), no en una lista donde «Correr» se repite
// sin decir a qué estación cierra.
//
// Se abre desde el historial: es una REVISIÓN, no un registro por rellenar.
// Por eso la capa 4 se lee («LoQueDijoElAtleta»), no se pregunta de nuevo —
// misma regla que `lectura-carrera` en `momento: 'revision'`.

import { useEffect } from 'react';
import { Ambiente, Apoyo, BANDA, BandaAnclada, FilaApoyos, FranjaAccion, zonaDe } from '../../kit-vivo';
import { reloj } from '../../kit-composicion/formato';
import { Seccion } from '../lectura-carrera/piezas';
import { BarraZonas } from '../post-entreno/piezas';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { ESCENAS } from './datos';
import { agruparPorRonda, pulsoMedioDeSesion, sujetoDeSesion, zonasDeSesion, type Sesion } from './modelo';
import { Cabecera, CabeceraDesglose, GrupoRonda, LoQueDijoElAtleta } from './piezas';
import { Sujeto } from './sujeto';

export const meta: TwinMeta = {
  id: 'lectura-sesion',
  titulo: 'Al terminar — lo que hiciste, no solo cómo corriste',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-08-20',
  descripcion:
    'Card 118: una sesión de fuerza y trineos se leía como una carrera a 0:00/km. El sujeto lo elige el FORMATO de la sesión — tiempo, rondas o volumen — y el desglose cuenta cada bloque en su propio idioma, en el orden en que pasó.',
  fuentes: [],
  enApp:
    'El enrutado que decide cuándo una sesión NO es una carrera ya está en Swift; esta lectura para el resto de sesiones (fuerza, mixtas, simulacros) todavía no existe.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'fuerza-trineos',
    titulo: '① Fuerza B + Trineos · 47:02',
    descripcion:
      'La sesión real del 20-ago que abrió la card. Sin formato de reloj ni de tanda: el sujeto es la duración, y el desglose enseña ocho tramos sin inventar ni un metro ni una carga que no se guardó.',
  },
  {
    id: 'simulacro-hyrox',
    titulo: '② Simulacro HYROX · 4 rondas',
    descripcion:
      'Plantilla 687 real: calentamiento + 4 rondas de correr 1.000 m cerradas con ski, burpee broad jump, remo y wall balls. El sujeto es el tiempo total y el desglose agrupa cada ronda con su cabecera y su tiempo. Ejecución simulada.',
  },
  {
    id: 'fuerza-pura',
    titulo: '③ Fuerza pura · sin pulsómetro',
    descripcion:
      'Sentadilla, press banca y dominadas: el sujeto es el volumen en toneladas y debajo la serie más pesada. Sin pulso en ningún bloque no hay barra de zonas — no una vacía, ninguna. Ejecución simulada.',
  },
];

export function Screen({ escenario, appearance, onLog }: TwinScreenProps) {
  const sesion: Sesion = ESCENAS[escenario] ?? ESCENAS['fuerza-trineos']!;
  const sujeto = sujetoDeSesion(sesion);
  const zonas = zonasDeSesion(sesion);
  const zona = zonaDe(pulsoMedioDeSesion(sesion));
  // El agrupado sale del DATO (§ modelo.agruparPorRonda): si ningún bloque
  // trae ronda, esto produce un único grupo sin cabecera — lista plana, igual
  // que antes de que el simulacro necesitara rondas.
  const grupos = agruparPorRonda(sesion.bloques);
  const totalRondas = Math.max(0, ...sesion.bloques.map((b) => b.ronda ?? 0));

  useEffect(() => {
    onLog(`Formato: ${sesion.formato.clase} · sujeto ${sujeto.clase} · ${sesion.bloques.length} bloques`);
    onLog(sesion.procedencia);
  }, [escenario]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="twin-screen-safe">
      <Ambiente zona={zona} appearance={appearance} />
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'grid',
          gridTemplateRows: `minmax(0, 1fr) ${BANDA.accion}px`,
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: BANDA.hueco,
          padding: BANDA.hueco,
          boxSizing: 'border-box',
          // El numeral del sujeto escala con el lienzo (`cqh`): sin contenedor
          // de consulta se queda clavado en el suelo del clamp (§10.2).
          containerType: 'size',
        }}
      >
        <div className="twin-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: BANDA.hueco }}>
            <Cabecera titulo={sesion.titulo} cuando={sesion.cuando} completitud={sesion.completitud} />
            <BandaAnclada>
              <Sujeto sujeto={sujeto} />
            </BandaAnclada>
          </div>

          <Seccion titulo="Bloque a bloque" nota={`${sesion.bloques.length} en orden`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <CabeceraDesglose />
              {grupos.map((g, i) => (
                <GrupoRonda key={i} grupo={g} rondas={totalRondas} />
              ))}
            </div>
          </Seccion>

          {/* Las zonas de pulso, si las hay — nunca una barra vacía (§7). */}
          {zonas.length > 0 && (
            <Seccion titulo="Dónde estuvo tu pulso">
              <BarraZonas segmentos={zonas} />
            </Seccion>
          )}

          {/* Duración total, aparte, cuando el sujeto no es ya el tiempo: en
              «for-time» y «libre» sería el mismo número dos veces (ruido). */}
          {(sujeto.clase === 'fuerza' || sujeto.clase === 'amrap' || sujeto.clase === 'emom') && (
            <Seccion titulo="Además">
              <FilaApoyos>
                <Apoyo etiqueta="Duración" valor={reloj(sesion.duracionTotalS)} />
              </FilaApoyos>
            </Seccion>
          )}

          <LoQueDijoElAtleta dicho={sesion.dicho} />
        </div>

        <FranjaAccion titulo="Cerrar" onClick={() => onLog('Cerrado')} />
      </div>
    </div>
  );
}
