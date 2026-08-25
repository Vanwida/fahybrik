'use client';

// LA LECTURA DE UNA SESIÓN — al terminar algo que no es una carrera sola.
//
// CARD 118. Una sesión real de fuerza y trineos de 47′ se leía a pantalla
// completa como «RITMO MEDIO · 0:00/km · Corriste a una sola intensidad», sin
// una palabra del peso muerto, el remo o los trineos: la app solo sabía
// contar la historia de una carrera y la contaba aunque la sesión no lo fuera.
//
// REHECHA para la CARD 124, viendo la app real con capturas de Apple Fitness
// delante. Alex, con la primera versión: «de tanto contar bloque a bloque se
// perdió la foto de la sesión entera» — el desglose bloque a bloque estaba
// bien, pero faltaban los totales (tiempo, distancia, ritmo, FC, calorías),
// la gráfica del pulso de la sesión ENTERA y el mapa cuando hubo GPS. También
// pidió un icono elaborado que diga de un vistazo qué tipo de entreno fue
// (`IconoTipoEntreno`, en el kit compartido) y dejó de sufrir las fuentes
// pequeñas: nada aquí baja de 15 pt (§4.1 del CONTRATO-UI), y todo se mide
// contra un fondo sólido conocido (§4.2).
//
// LAS SIETE CAPAS, EN ESTE ORDEN (ver `modelo.ts` para el porqué de cada una):
// cabecera · totales · gráfica de pulso · mapa · desglose · zonas · lo que
// dijo el atleta. El mapa se REUTILIZA de `lectura-carrera` (mismo
// `PuntoRuta`): no se redibuja un segundo mapa para esta pantalla.

import { useEffect } from 'react';
import { Ambiente, FranjaAccion, zonaDe } from '../../kit-vivo';
import { Mapa } from '../lectura-carrera/piezas';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { ESCENAS, TRAZA_PULSO } from './datos';
import { agruparPorRonda, piezasDeDesglose, zonasDeSesion, type Sesion } from './modelo';
import {
  AccionesRecap,
  Cabecera,
  CabeceraDesglose,
  GrupoRonda,
  LoQueDijoElAtleta,
  RejillaTotales,
  TarjetaSeccion,
  TarjetaSerie,
  BarraZonasSesion,
  FilaBloque,
} from './piezas';
import { GraficaPulso } from './grafica';

export const meta: TwinMeta = {
  id: 'lectura-sesion',
  titulo: 'Al terminar — la foto de la sesión entera',
  zona: 'Entreno en vivo',
  estado: 'construida',
  actualizado: '2026-08-25',
  descripcion:
    'Card 132: el recap lleno enseña el entreno (VO2max serie a serie, sled, lunges). Completado / técnica / captura van abajo. La 144 ya llena los números con la ejecución.',
  fuentes: [
    'ios/FAHYBRIK/Workout/PostWorkout/LecturaDeSesionView.swift',
    'shared/domain/recap-sticker.ts',
  ],
  enApp:
    'LecturaDeSesionView. El recap lleno agrupa la tanda. Completado / técnica / captura van al final del scroll.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'fuerza-trineos',
    titulo: '① Fuerza B + Trineos · 47:02',
    descripcion:
      'La sesión real del 20-ago que abrió la card 118, ahora con sus totales reales: FC media 115 ppm, FC máxima 149. Sin metros de carrera (la cinta no conectó) y sin calorías ni GPS: los recuadros que faltan no están por error, están porque el dato no existe — es el caso que prueba la regla de no inventar.',
  },
  {
    id: 'simulacro-hyrox',
    titulo: '② Simulacro HYROX · 4 rondas',
    descripcion:
      'Plantilla 687 real: calentamiento + 4 rondas de correr 1.000 m cerradas con ski, burpee broad jump, remo y wall balls. La distancia se midió en dos modalidades (y dos máquinas de ergómetro): el total no la enseña, pero el ritmo medio de CORRER sí tiene recuadro propio. Ejecución simulada.',
  },
  {
    id: 'fuerza-pura',
    titulo: '③ Fuerza pura · sin pulsómetro',
    descripcion:
      'Sentadilla, press banca y dominadas: el resultado es el volumen en toneladas y debajo la serie más pesada. Sin pulso en ningún bloque no hay recuadros de FC, ni gráfica, ni barra de zonas — ninguna, no una vacía. Ejecución simulada.',
  },
  {
    id: 'simulacro-calle',
    titulo: '④ El mismo simulacro, en la calle',
    descripcion:
      'Idéntico al ②, pero al aire libre: aparece el mapa con la ruta coloreada por zona de pulso. La ruta es un trazo inventado y plausible (no hay un GPS de ejemplo real en la base todavía) — declarado en la procedencia, no fingido como medido.',
  },
  {
    id: 'recap-lleno',
    titulo: '⑤ Recap lleno · VO2max + sled + lunges',
    descripcion:
      'Card 132. Al acabar se ve el entreno: ocho parciales de VO2max con tiempos y ritmos reales, sled y lunges. Completado / técnica / captura van abajo. La pegatina recorta esos parciales.',
  },
];

export function Screen({ escenario, appearance, onLog }: TwinScreenProps) {
  const sesion: Sesion = ESCENAS[escenario] ?? ESCENAS['fuerza-trineos']!;
  const zona = zonaDe(sesion.fcMediaPpm);
  const traza = TRAZA_PULSO[escenario];
  // El agrupado sale del DATO (§ modelo.agruparPorRonda): si ningún bloque
  // trae ronda, esto produce un único grupo sin cabecera — lista plana, igual
  // que antes de que el simulacro necesitara rondas.
  const grupos = agruparPorRonda(sesion.bloques);
  const piezas = piezasDeDesglose(sesion.bloques);
  const haySerie = piezas.some((p) => p.form === 'series');
  const totalRondas = Math.max(0, ...sesion.bloques.map((b) => b.ronda ?? 0));
  const zonas = zonasDeSesion(sesion);

  useEffect(() => {
    onLog(`Formato: ${sesion.formato.clase} · ${sesion.bloques.length} bloques · FC ${sesion.fcMediaPpm ?? 'sin medir'}`);
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
          gridTemplateRows: 'minmax(0, 1fr) 76px',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 12,
          padding: 12,
          boxSizing: 'border-box',
        }}
      >
        <div className="twin-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <Cabecera sesion={sesion} appearance={appearance} />

          <TarjetaSeccion titulo="Los totales">
            <RejillaTotales sesion={sesion} />
          </TarjetaSeccion>

          {/* La gráfica del pulso de TODA la sesión — lo que más pidió Alex.
              Sin pulso en ningún bloque (fuerza pura) no hay traza: ninguna
              gráfica, no una vacía (§7). */}
          {traza && traza.length > 1 && sesion.fcMediaPpm != null && sesion.fcMaxPpm != null && (
            <TarjetaSeccion titulo="Tu pulso">
              <GraficaPulso muestras={traza} mediaPpm={sesion.fcMediaPpm} maxPpm={sesion.fcMaxPpm} duracionS={sesion.duracionTotalS} />
            </TarjetaSeccion>
          )}

          {/* El mapa, solo con GPS — mismo dibujo que `lectura-carrera`, con
              el mismo título de sección grande que el resto de capas: o
              todas son secciones, o ninguna lo es (Alex, 20-ago). */}
          {sesion.ruta.length > 0 && (
            <TarjetaSeccion titulo="El recorrido">
              <Mapa ruta={sesion.ruta} />
            </TarjetaSeccion>
          )}

          <TarjetaSeccion titulo="Bloque a bloque" nota={`${sesion.bloques.length} en orden`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <CabeceraDesglose />
              {haySerie
                ? piezas.map((p, i) =>
                    p.form === 'series' ? (
                      <TarjetaSerie key={`s-${i}`} series={p.series} />
                    ) : (
                      <FilaBloque key={`b-${p.block.position}`} bloque={sesion.bloques[p.block.position]!} />
                    ),
                  )
                : grupos.map((g, i) => <GrupoRonda key={i} grupo={g} rondas={totalRondas} />)}
            </div>
          </TarjetaSeccion>

          {/* Las zonas de pulso, si las hay — nunca una barra vacía (§7). */}
          {zonas.length > 0 && (
            <TarjetaSeccion titulo="Dónde estuvo tu pulso">
              <BarraZonasSesion segmentos={zonas} />
            </TarjetaSeccion>
          )}

          <LoQueDijoElAtleta dicho={sesion.dicho} />

          <AccionesRecap completa={sesion.completitud.completa} onLog={onLog} />
        </div>

        <FranjaAccion titulo="Cerrar" onClick={() => onLog('Cerrado')} />
      </div>
    </div>
  );
}
