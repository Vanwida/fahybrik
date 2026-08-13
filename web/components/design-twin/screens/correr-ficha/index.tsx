'use client';

// LA FICHA DE UNA CARRERA — la lectura de `lectura-carrera`, alcanzable días
// después desde el historial en vez de solo al terminar.
//
// DE DÓNDE SALE. `lectura-carrera` (12-ago) resolvió QUÉ SE LEE: el veredicto
// contra la banda del coach cuando hubo objetivo, la lectura honesta cuando no.
// Lo que no resolvía —y no tenía por qué, nació para el instante de terminar—
// es la pregunta que solo se puede hacer con HISTORIA detrás: ¿esto que acabo
// de ver es normal en mí, o es distinto? Esta ficha no inventa una segunda
// lectura: hereda `lecturaDeCorrer` y el `Sujeto` de `lectura-carrera` tal
// cual, y añade encima lo dos que solo caben aquí — la comparativa contra tu
// última sesión similar y la lista de todas tus veces con este entreno.
//
// COMPOSICIÓN. Arquetipo Detalle, estrategia llena (§6.2 del CONTRATO-UI): «el
// hueco del Detalle se gana con lo que da sentido al dato — su historia, contra
// qué se compara». Es literalmente el encargo de esta pantalla. Cabecera de
// vista empujada (‹ volver), porque a diferencia de `lectura-carrera` esto no
// se abre al cerrar un entreno: se navega, con push real, desde una fila del
// historial (docs/analiticas-running-mapa.md, NIVEL 2).

import { useEffect } from 'react';
import { S } from '../../kit-composicion/tokens';
import { Apoyo } from '../../kit-vivo';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { distribucionZonas } from '../../zonas';
import { BarraZonas } from '../post-entreno/piezas';
import { Curva } from '../lectura-carrera/curva';
import { lecturaDeCorrer } from '../lectura-carrera/modelo';
import { Mapa, Seccion, TablaKilometros, TablaRepeticiones, derivadasDe } from '../lectura-carrera/piezas';
import { Sujeto } from '../lectura-carrera/sujeto';
import { ESCENAS, type Ficha } from './datos';
import {
  BloqueComparativa,
  BloqueHistorial,
  Cabecera,
  InsigniaRecord,
  LineaProcedencia,
  SelloSuperficie,
  Totales,
} from './piezas';

export const meta: TwinMeta = {
  id: 'correr-ficha',
  titulo: 'La ficha de una carrera',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-08-13',
  descripcion:
    'La misma lectura de «al terminar de correr» — veredicto, curva, troceado, mapa — pero navegable días después desde el historial, con lo que solo la historia puede dar: contra qué se compara y todas tus veces con este entreno.',
  fuentes: [],
  enApp:
    'La lectura post-entreno existe (ResumenCarreraView/LecturaDeCarreraView + curva/splits/mapa del 13-ago); lo que no existe: llegar a ella por push desde un historial dentro de la tab, la comparativa vs tu última sesión similar y la lista del mismo entreno.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
  // Sin `composicion`: propuesta pura — la lectura de hoy vive en su propio
  // espejo (`lectura-carrera`), no aquí. Arquetipo detalle, estrategia llena.
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'serie-prescrita',
    titulo: '① 6×800 · con banda y con historia',
    descripcion:
      'La misma serie que ya aprobaste en «Al terminar de correr», vista trece días después desde el historial: el veredicto sigue mandando, y debajo aparece lo que solo da la ficha — contra tu último 6×800 y las tres veces anteriores.',
  },
  {
    id: 'rodaje-libre',
    titulo: '② Rodaje libre · sin banda, con récord',
    descripcion:
      'Nadie pidió ritmo: manda la lectura honesta (el más fuerte de los dos apretones) y la comparativa mide ritmo y pulso contra tu último rodaje parecido — sin % en banda, porque ninguno de los dos la tenía. Esta sesión bate tu mejor 5 km.',
  },
  {
    id: 'importada-garmin',
    titulo: '③ Importada de Garmin · sin veredicto',
    descripcion:
      'Nunca pasó por la app: se declara con una línea fina bajo la cabecera. Sin objetivo no hay banda que romper, y trae un dato que las sesiones nativas de hoy no traen — la cadencia.',
  },
  {
    id: 'cinta',
    titulo: '④ Cuestas en cinta · sin mapa, sin avisarlo',
    descripcion:
      'Seis repeticiones al 6% de inclinación: por encima del umbral de pendiente el troceado se lee en tiempo, no en ritmo — la misma regla que en calle. Sin GPS no hay mapa, y la cinta nunca anuncia lo que nunca pudo tener.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const ficha: Ficha = ESCENAS[escenario] ?? ESCENAS['serie-prescrita']!;
  const { carrera } = ficha;
  const lectura = lecturaDeCorrer(carrera);
  const zonas = distribucionZonas({ duracionS: carrera.duracionS, zonasS: carrera.zonasS });
  const derivadas = [...derivadasDe(carrera), ...(ficha.derivadosExtra ?? [])];

  useEffect(() => {
    onLog(`Ficha: ${ficha.tipo} · sujeto ${lectura.sujeto.clase}`);
    if (ficha.comparativa) onLog(`Comparativa contra ${ficha.comparativa.etiqueta}`);
    if (ficha.historial) onLog(`Historial: ${ficha.historial.filas.length} sesiones anteriores`);
    onLog(carrera.procedencia);
  }, [escenario]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="twin-screen-safe">
      {/* `containerType: 'size'` en la raíz, del mismo modo que `MarcoVivo` en
          kit-vivo: es de ahí de donde `Numeral` (dentro de `Sujeto`) toma su
          escala `cqh`. Sin este contenedor el sujeto se quedaría clavado en el
          suelo del clamp. */}
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', containerType: 'size' }}>
        <Cabecera
          tipo={ficha.tipo}
          fecha={ficha.fechaCorta}
          nombre={ficha.nombreEntreno}
          onBack={() => onLog('Volver al historial')}
        />

        <div className="twin-scroll" style={{ flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: `${S.m}px ${S.l}px ${S.xxl}px` }}>
            {ficha.record && <InsigniaRecord>{ficha.record}</InsigniaRecord>}

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', padding: `${S.l}px 0` }}>
              <Sujeto carrera={carrera} lectura={lectura} voz="veredicto" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
              <Totales carrera={carrera} />
              {ficha.procedenciaExterna && <LineaProcedencia>{ficha.procedenciaExterna}</LineaProcedencia>}
              {carrera.superficie === 'cinta' && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <SelloSuperficie>En cinta</SelloSuperficie>
                </div>
              )}
            </div>

            {carrera.ruta.length > 0 && (
              <Seccion titulo="El recorrido">
                <Mapa ruta={carrera.ruta} />
              </Seccion>
            )}

            {carrera.traza && (
              <Curva
                ritmo={carrera.traza.ritmo}
                pulso={carrera.traza.pulso}
                repeticiones={carrera.repeticiones}
                lectura={lectura}
                kilometros={lectura.troceado === 'kilometros' ? carrera.kilometros.filter((k) => !k.parcial).map((k) => k.cruceS) : []}
                descripcion={`Ritmo y pulso de ${carrera.titulo} a lo largo de la sesión`}
              />
            )}

            {lectura.troceado === 'repeticiones' && (
              <Seccion titulo="Tramo a tramo">
                <TablaRepeticiones
                  repeticiones={carrera.repeticiones}
                  veredictos={lectura.veredictos}
                  veredictosRecuperacion={lectura.veredictosRecuperacion}
                  eje={lectura.eje}
                  certeza={carrera.certezaTramos}
                />
              </Seccion>
            )}

            {lectura.troceado === 'kilometros' && carrera.kilometros.length > 0 && (
              <Seccion titulo="Kilómetro a kilómetro">
                <TablaKilometros kilometros={carrera.kilometros} />
              </Seccion>
            )}

            {/* A diferencia de «al terminar», aquí el reparto de zonas se enseña
                SIEMPRE que hay dato — no solo cuando la zona es el sujeto: esta
                ficha es el hogar completo de la sesión, no el resumen del cierre. */}
            {zonas.length > 0 && (
              <Seccion titulo="Dónde estuvo tu pulso">
                <BarraZonas segmentos={zonas} />
              </Seccion>
            )}

            {/* `flexWrap` y no `FilaApoyos`: «Además» lleva de dos a cuatro
                derivados según la sesión (deriva, bajada de pulso, cadencia,
                inclinación…), y la fila rígida de tres columnas de `FilaApoyos`
                los aplastaría o los dejaría cortos de sobra. `Apoyo` sigue
                siendo el mismo, solo cambia quién reparte el ancho. */}
            {derivadas.length > 0 && (
              <Seccion titulo="Además">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {derivadas.map((d) => (
                    <div key={d.etiqueta} style={{ flex: '1 1 100px' }}>
                      <Apoyo etiqueta={d.etiqueta} valor={d.valor} pie={d.pie} />
                    </div>
                  ))}
                </div>
              </Seccion>
            )}

            {ficha.comparativa && <BloqueComparativa comparativa={ficha.comparativa} />}

            {ficha.historial && (
              <BloqueHistorial titulo={ficha.historial.titulo} filas={ficha.historial.filas} onLog={onLog} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
