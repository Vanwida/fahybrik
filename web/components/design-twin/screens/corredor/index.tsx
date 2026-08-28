'use client';

// EL CORREDOR EN EL TELÉFONO — la misma interfaz que la muñeca, con sitio.
//
// Todo lo que decide QUÉ se ve (el sujeto, el segundo nivel, el juicio del
// ritmo, quién puede cerrar la estación, cuándo aprieta el cap) vive en
// `guion.ts` y lo lee también `watch-corredor`. Aquí sólo se decide cómo se
// reparte el sitio que la muñeca no tiene: la franja de contexto permanente,
// los tres apoyos y la ruta aplanada.
//
// Lo que esta pantalla arregla del iPhone de hoy, punto por punto:
//
//   · La distancia decía «sin medir» con el GPS fuerte y la traza pintándose.
//     Ahora la medida tiene tres estados y el CERO es un dato: recién fijado,
//     el sujeto lee 800 m que faltan.
//   · No había ni chip de estación ni posición en la ruta. Ahora la franja de
//     contexto dice «Estación 3/8 · Run» y no se va de la pantalla.
//   · El `time_cap` lo calculaba el motor y no lo pintaba nadie. Ahora está en
//     la franja, y se enciende en los últimos 30 s.
//   · El ritmo salía de la velocidad GPS suavizada aquí y de metros/tiempo en
//     la muñeca — dos números de la misma carrera. Ahora hay uno.

import { useEffect, useState } from 'react';
import { fmtClock, useTicker } from '../../sim';
import { SP } from '../../kit';
import {
  Ambiente,
  Apoyo,
  EtiquetaSujeto,
  FilaApoyos,
  Fogonazo,
  FranjaAccion,
  MarcoVivo,
  Numeral,
} from '../../kit-vivo';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Cabecera, Chip, CintaRuta, Drenaje, FranjaContexto, Pie, Veredicto } from './piezas';
import {
  CAP_URGENTE_S,
  FUNDIDO,
  RUTA,
  avanzar,
  capQueda,
  cerrarPorToque,
  colorJuicio,
  deltaSkm,
  distanciaMedida,
  estacionDe,
  estadoMedida,
  estado,
  etiquetaSujeto,
  fraccionEstacion,
  juzgar,
  mensajeSuceso,
  metrosHechos,
  objetivoEscrito,
  palabraJuicio,
  posicion,
  ritmoEscrito,
  sujetoDe,
  sujetoEscrito,
  tocarEsLaUnicaSalida,
  type Estado,
  type Suceso,
} from './guion';

export const meta: TwinMeta = {
  id: 'corredor',
  titulo: 'El corredor · iPhone',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  descripcion:
    'Una sola interfaz de corredor, y ésta es su cara grande. El sujeto es lo que FALTA de la estación que tienes delante; el ritmo va debajo ya juzgado contra el objetivo del coach; la estación, el cap y el crono del bloque no se van de la pantalla. Comparte `guion.ts` con «El corredor · muñeca»: el mismo escenario enseña el mismo instante en las dos.',
  fuentes: [],
  dispositivo: 'iphone',
  // Un corredor lleva el móvil en una mano y en vertical. La cara horizontal es
  // la del monitor de una máquina, y una carrera al aire libre no tiene monitor.
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'estacion-carrera',
    titulo: 'Estación 3/8 · Run 800 m, cap 4:00',
    descripcion:
      'El caso de la card. Los metros bajan de verdad, el ritmo se juzga contra los 4:15/km del coach y el cap va en la franja. Abre «El corredor · muñeca» en este mismo escenario: es el mismo instante, con el mismo sujeto y el mismo número.',
  },
  {
    id: 'cap-encima',
    titulo: 'El cap apretando',
    descripcion:
      'Séptima estación con las piernas fundidas: el cap baja de 30 s y se enciende, el ritmo se pone rojo y el juicio dice «aprieta». Ni una frase inventada — es el número contra lo que escribió el coach.',
  },
  {
    id: 'estacion-ciega',
    titulo: 'Estación ciega · 60 wall balls',
    descripcion:
      'Nadie cuenta un wall ball. No falta nada medible, así que el sujeto cae al reloj de la estación, la dosis del coach ocupa el segundo nivel y la acción pasa a relleno naranja: aquí tu toque es la ÚNICA salida. La cinta de ruta no se rellena, porque no hay nada medido con qué rellenarla.',
  },
  {
    id: 'sin-senal',
    titulo: 'El GPS todavía no fija',
    descripcion:
      'Recién salido. Sin fijar no hay metros ni ritmo y no se inventan. Espera unos segundos: al fijar, con CERO metros cubiertos, el sujeto lee 800 m que faltan. Hoy esa misma pantalla dice «sin medir» con el GPS fuerte y la traza dibujándose en el mapa.',
  },
];

function inicial(escenario: string): Estado {
  if (escenario === 'cap-encima') {
    return estado({
      estacion: 6,
      bloqueS: 1_402,
      enEstacionS: 212,
      piernas: FUNDIDO,
      ppm: 176,
      parciales: [209, 168, 221, 118, 236, 174],
    });
  }
  if (escenario === 'estacion-ciega') {
    return estado({ estacion: 1, bloqueS: 283, enEstacionS: 74, ppm: 172, parciales: [209] });
  }
  if (escenario === 'sin-senal') {
    return estado({ estacion: 0, bloqueS: 4, enEstacionS: 4, senal: 'buscando', ppm: 138, parciales: [] });
  }
  return estado();
}

export function Screen({ appearance, escenario, onLog }: TwinScreenProps) {
  const [e, setE] = useState<Estado>(() => inicial(escenario));
  const [pausado, setPausado] = useState(false);
  const [hito, setHito] = useState(0);
  const [fogonazo, setFogonazo] = useState(false);

  // El fogonazo se enciende en el SUCESO (abajo) y se apaga solo. `hito` está
  // en las dependencias para re-armar el temporizador si caen dos cierres
  // seguidos con la luz aún puesta.
  useEffect(() => {
    if (!fogonazo) return;
    const t = setTimeout(() => setFogonazo(false), 260);
    return () => clearTimeout(t);
  }, [fogonazo, hito]);

  const aplicar = ({ estado: nuevo, sucesos }: { estado: Estado; sucesos: Suceso[] }) => {
    setE(nuevo);
    for (const s of sucesos) {
      onLog(mensajeSuceso(s));
      if (s.tipo === 'estacion-cerrada') {
        setHito((n) => n + 1);
        setFogonazo(true);
      }
    }
  };

  useTicker(!pausado, () => aplicar(avanzar(e)));

  const est = estacionDe(e);
  const medida = estadoMedida(e);
  const sujeto = sujetoEscrito(e);
  const cap = capQueda(e);
  const ritmo = ritmoEscrito(e);
  const juicio = juzgar(e);
  const tono = colorJuicio(juicio);
  const delta = deltaSkm(e);
  const palabra = palabraJuicio(juicio);
  const objetivo = objetivoEscrito(e);
  const hechos = metrosHechos(e);
  const ultima = e.parciales[e.parciales.length - 1];
  const anterior = e.estacion > 0 ? RUTA[e.estacion - 1] : undefined;
  const sujetoEsReloj = sujetoDe(e).clase === 'reloj';

  return (
    <div className="twin-screen-safe">
      {/* Sin ancla de FC no hay zona, y sin zona no hay tinte: el lienzo queda
          neutro. Es el 100 % de la base hoy, y es lo mismo que hace la muñeca. */}
      <Ambiente zona={null} appearance={appearance} />
      <Fogonazo activo={fogonazo} />

      {/* El marco compartido: cinco filas y el sujeto SIEMPRE en la tercera, a
          la misma altura óptica que las demás vistas en vivo (§10.3). No se
          reinventa aquí ni se le añade una fila. */}
      <MarcoVivo
        cromo={
          <Cabecera
            /* «Chipper» a secas: el «· 8 estaciones» que llevaba aquí ya lo
               dice la franja de debajo («Estación 3/8»), y repetirlo era lo
               que empujaba el botón de pausa fuera del teléfono. */
            titulo="Chipper"
            pausado={pausado}
            onPausa={() => {
              setPausado((p) => !p);
              onLog(pausado ? 'sigues' : 'en pausa · pausar y terminar los diseña la card 176');
            }}
            chips={
              <>
                <Chip
                  texto={medida === 'buscando' ? 'Buscando GPS' : 'GPS fuerte'}
                  estado={medida === 'buscando' ? 'buscando' : medida === 'nadie' ? 'mudo' : 'ok'}
                />
                {/* Sin reloj puesto el chip NO existe: un hueco sin acción es
                    ruido gris (§6.2 bis), y aquí no hay nada que el atleta
                    pueda hacer corriendo. */}
                {e.ppm !== null && <Chip texto={`${e.ppm} ppm`} estado="ok" />}
              </>
            }
          />
        }
        contexto={
          <FranjaContexto
            posicion={posicion(e)}
            estacion={est.nombre}
            cap={cap === null ? null : fmtClock(cap)}
            bloque={fmtClock(e.bloqueS)}
            urgente={cap !== null && cap <= CAP_URGENTE_S}
            ruta={
              <CintaRuta
                pesos={RUTA.map((x) => x.peso)}
                activo={e.estacion}
                fraccion={fraccionEstacion(e)}
              />
            }
          />
        }
        sujeto={
          <>
            <EtiquetaSujeto>{etiquetaSujeto(e)}</EtiquetaSujeto>
            <Numeral
              unidad={sujeto.unidad}
              tono={cap !== null && cap <= CAP_URGENTE_S ? 'var(--twin-accent-text)' : 'var(--twin-fg)'}
            >
              {sujeto.texto}
            </Numeral>
            <Drenaje fraccion={fraccionEstacion(e)} tono={tono} />

            {/* EL SEGUNDO NIVEL. Medida → el ritmo, que es el único mando que
                un corredor acciona en marcha. Ciega → la dosis, que es lo que
                hay que hacer. Nunca los dos: el trabajo no es una lista. */}
            {ritmo !== null ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.s, marginTop: SP.s }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s }}>
                  <Numeral escala="segundo" tono={tono} unidad="/km">
                    {ritmo}
                  </Numeral>
                  {delta !== null && (
                    <span className="t-readout-s" style={{ color: tono, fontSize: 15, transition: 'color 400ms linear' }}>
                      {`${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)} s/km`}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: SP.s }}>
                  {objetivo && <Pie>{`objetivo ${objetivo}`}</Pie>}
                  {palabra && <Veredicto texto={palabra} tono={tono} />}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.xs, marginTop: SP.s }}>
                <Numeral escala="segundo">{est.dosis}</Numeral>
                {/* Por qué no hay ritmo. «La cierras tú» NO va aquí: lo dice ya
                    la nota del botón, y decirlo dos veces gasta la línea que
                    tenía que explicar la otra mitad. */}
                <Pie>
                  {medida === 'buscando' ? 'Sin señal no hay ritmo ni metros' : 'Nadie mide esta estación'}
                </Pie>
              </div>
            )}
          </>
        }
        apoyos={
          <FilaApoyos>
            {/* El reloj de la estación sólo se gana su celda cuando NO es ya el
                sujeto: en una estación ciega el sujeto ES ese reloj, y
                repetirlo debajo no añade nada. */}
            {sujetoEsReloj ? null : <Apoyo etiqueta="En la estación" valor={fmtClock(e.enEstacionS)} />}
            {/* La distancia CUBIERTA, y aquí está el arreglo: con fuente y cero
                metros se escribe «0 m», no «sin medir». Sin fuente la celda
                dice qué falta, que es otra cosa distinta. */}
            <Apoyo
              etiqueta="Llevas"
              valor={
                hechos !== null
                  ? distanciaMedida(hechos)
                  : medida === 'buscando'
                    ? 'buscando'
                    : 'no se mide'
              }
              tono={hechos !== null ? 'var(--twin-fg)' : 'var(--twin-muted)'}
            />
            {/* El parcial de lo último que tachaste, CON su nombre: «2:48» a
                secas no dice de qué, y en un chipper la anterior puede ser un
                sled o un kilómetro. */}
            <Apoyo
              etiqueta="Anterior"
              valor={ultima === undefined ? 'es la primera' : fmtClock(ultima)}
              tono={ultima === undefined ? 'var(--twin-muted)' : 'var(--twin-fg)'}
              pie={anterior?.nombre}
            />
          </FilaApoyos>
        }
        accion={
          <FranjaAccion
            titulo="ESTACIÓN HECHA"
            /* El relleno naranja se gana SOLO cuando el toque es la única
               salida. Si el GPS puede cruzar los 800, el botón es un atajo y
               va en contorno: el color dice quién gobierna la transición. */
            unicaSalida={tocarEsLaUnicaSalida(e)}
            nota={tocarEsLaUnicaSalida(e) ? 'nadie más puede cerrarla' : 'o la cierran los metros'}
            onClick={() => aplicar(cerrarPorToque(e))}
          />
        }
      />

      {pausado && <VeloPausa onReanudar={() => setPausado(false)} />}
    </div>
  );
}

/**
 * EL SITIO RESERVADO PARA PAUSAR Y TERMINAR.
 *
 * Esta propuesta NO las diseña: son la card 176, y decidirlas aquí sería
 * decidir por esa card. Lo que sí hace es enseñar dónde caen — encima de la
 * vista viva, sin sacarte de ella — para que el hueco esté reconocido en vez
 * de aparecer luego donde quepa.
 */
function VeloPausa({ onReanudar }: { onReanudar: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SP.l,
        padding: SP.xl,
        textAlign: 'center',
        background: 'var(--twin-scrim)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <span style={{ font: 'italic 800 28px/1.1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        En pausa
      </span>
      <Pie>
        Pausar, saltar bloque y terminar viven aquí, y los diseña la card 176. Esta propuesta les
        deja el sitio y no los dibuja.
      </Pie>
      <button type="button" className="tw-btn-primary" onClick={onReanudar}>
        Seguir
      </button>
    </div>
  );
}
