'use client';

// 5×1000 en cinta.
//
// El sujeto cambia de naturaleza aunque el tramo sea el mismo: en la calle el
// atleta gobierna el ritmo, y en la cinta lo gobierna la MÁQUINA. Lo que quiere
// ver, entonces, es la velocidad que hay puesta, en km/h, que es la unidad que
// teclea en la consola. Traducirle el objetivo a 4:48 /km y dejar que él haga
// la cuenta es hacerle trabajo a 12,5 km/h.
//
// Y la parte honesta, que es la que de verdad decide esta pantalla: la app NO
// manda en la cinta, solo la lee. Cuando la máquina deja de compartir la
// velocidad (pasa constantemente en la familia BH/i.Concept), aquí no se
// inventa nada: se para de contar metros, se dice, y se ofrece declararla con
// UN toque. A partir de ahí, todo lo que salga de esa declaración va marcado.

import { useState } from 'react';
import type { TwinAppearance } from '../../types';
import { fmtClock } from '../../sim';
import { Label, Mono, SP } from '../../kit';
import { esDecimal } from '../../datos-reales';
import { Ambiente, FranjaAccion, Numeral, colorZona } from '../../kit-vivo';
import { Apoyos, BotonToque, Chip, Drenaje, IconoCinta, IconoPulso, Objetivo, Pie, Verdad } from './atoms';
import {
  Aviso,
  Cabecera,
  CapaVivo,
  Destello,
  MarcoCorrer,
  VeloPausa,
  useAnuncio,
  useDestello,
  useEventos,
  useRelojPausable,
} from './escena';
import { PulsoQueBaja, Siguiente, SujetoDescanso } from './descanso';
import { CINTA, GUIONES, METROS_CINTA, relojSesion, serieDe, simular, type Toques } from './guion';
import { distanciaMedida, fraccion, kmh, metrosQueQuedan, OBJETIVO_CINTA } from './formato';

const GUION = GUIONES.cinta;
const INCLINACION = esDecimal(CINTA.inclinacionPct, 1);

export function EscenaCinta({
  horizontal,
  appearance,
  onLog,
}: {
  horizontal: boolean;
  appearance: TwinAppearance;
  onLog: (linea: string) => void;
}) {
  const [pausado, setPausado] = useState(false);
  const [toques, setToques] = useState<Toques>({ declarada: null, atajos: [] });
  const [anuncio, anunciar] = useAnuncio();
  const [hito, destellar] = useDestello();

  const t = useRelojPausable(!pausado);
  const { foto, eventos } = simular(GUION, t, toques);
  const descansando = foto.tramo.tipo === 'descanso';
  const serie = serieDe(GUION.sesion, foto.idx);
  const reloj = () => fmtClock(relojSesion(GUION, t));

  /** La máquina ha dejado de hablar. Lo que se declare no la resucita. */
  const muda = t >= CINTA.silencioT;
  const declarada = toques.declarada !== null;

  useEventos(eventos, (ev) => {
    if (ev.tipo !== 'cierra') return;
    const { numero } = serieDe(GUION.sesion, ev.idx);
    if (ev.tramo.tipo === 'distancia') {
      destellar({ palabra: 'DESCANSO', tono: 'var(--twin-ok)' });
      anunciar({ titulo: `Serie ${numero}`, dato: fmtClock(ev.tTramo), pie: 'hecha' });
      onLog(`${reloj()} · el mil ${numero} en ${fmtClock(ev.tTramo)}`);
    } else {
      destellar({ palabra: `SERIE ${numero}`, tono: 'var(--twin-accent)' });
      onLog(`${reloj()} · descanso hecho, sale el mil ${numero}`);
    }
  });

  const declarar = () => {
    setToques((v) => ({ ...v, declarada: { desdeT: t, kmh: CINTA.objetivoKmh } }));
    onLog(`${reloj()} · declaras ${OBJETIVO_CINTA.velocidad} km/h, y a partir de ahí va marcado`);
  };

  const sujetoTrabajo = (
    <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.s }}>
      <Label size={10}>Velocidad de la cinta</Label>

      {foto.velocidadMs === null ? (
        // Sin dato no hay número. Ni un guion ni un cero: lo que se pinta es la
        // razón y la salida, que cuesta un toque.
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.s, width: '100%' }}>
          <span style={{ font: 'italic 800 20px/1.2 var(--twin-font-sans)', color: 'var(--twin-warning)', textAlign: 'center' }}>
            La cinta ha dejado de compartir la velocidad
          </span>
          <Verdad
            texto="Mientras tanto no se cuentan metros. Si sigues al ritmo de la serie, dilo y seguimos contando."
            accion={<BotonToque titulo={`VOY A ${OBJETIVO_CINTA.velocidad}`} onClick={declarar} />}
          />
        </div>
      ) : (
        <>
          <Numeral horizontal={horizontal} unidad="km/h" tono={foto.estimada ? 'var(--twin-warning)' : 'var(--twin-fg)'}>
            {kmh(foto.velocidadMs)}
          </Numeral>
          {foto.estimada && (
            <span style={{ font: '600 11px/1 var(--twin-font-sans)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--twin-warning)' }}>
              Lo has dicho tú, no la cinta
            </span>
          )}
        </>
      )}

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, marginTop: SP.xs }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s }}>
          <Label size={10}>Te quedan</Label>
          <span style={{ flex: 1 }} />
          <Mono size={16} weight={700}>{`${metrosQueQuedan(foto.tramo, foto.mTramo)} m`}</Mono>
          {foto.mEstimados > 0 && (
            <span style={{ font: '600 9px/1 var(--twin-font-sans)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--twin-warning)' }}>
              estimado
            </span>
          )}
        </div>
        <Drenaje fraccion={fraccion(foto.tramo, foto.tTramo, foto.mTramo)} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, marginTop: SP.xs }}>
        <Objetivo>{`Objetivo ${OBJETIVO_CINTA.velocidad} km/h`}</Objetivo>
        <Pie>{`${OBJETIVO_CINTA.ritmo} /km · la velocidad la pones tú en la cinta`}</Pie>
      </div>
    </div>
  );

  return (
    <>
      <Ambiente zona={foto.zona} appearance={appearance} />
      <CapaVivo
        marco={
          <MarcoCorrer
            horizontal={horizontal}
            cromo={
              <Cabecera
                titulo={descansando ? 'Descanso' : `Serie ${serie.numero} de ${serie.total}`}
                detalle={descansando ? '2:00 entre series' : '5×1.000 en cinta'}
                pausado={pausado}
                onPausa={() => {
                  setPausado((p) => !p);
                  onLog(`${reloj()} · ${pausado ? 'sigues' : 'en pausa'}`);
                }}
                chips={
                  <>
                    <Chip texto={CINTA.nombre} estado={muda ? 'mudo' : 'ok'}>
                      <IconoCinta size={10} />
                    </Chip>
                    <Chip texto={foto.ppm === null ? 'Reloj' : `${foto.ppm}`} estado={foto.ppm === null ? 'buscando' : 'ok'}>
                      <IconoPulso size={10} />
                    </Chip>
                  </>
                }
              />
            }
            sujeto={descansando ? <SujetoDescanso horizontal={horizontal} foto={foto} /> : sujetoTrabajo}
            apoyos={
              descansando ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
                  <PulsoQueBaja horizontal={horizontal} ppm={foto.ppm} zona={foto.zona} />
                  <Siguiente
                    titulo={`Serie ${serie.numero} de ${serie.total}`}
                    objetivo={`1.000 m a ${OBJETIVO_CINTA.velocidad} km/h`}
                  />
                </div>
              ) : (
                <Apoyos
                  horizontal={horizontal}
                  items={[
                    {
                      etiqueta: 'Inclinación',
                      valor: muda ? null : INCLINACION,
                      unidad: '%',
                      ausente: 'sin dato',
                    },
                    { etiqueta: 'Tiempo', valor: fmtClock(foto.tTramo) },
                    {
                      etiqueta: 'Pulso',
                      valor: foto.ppm === null ? null : `${foto.ppm}`,
                      unidad: 'ppm',
                      tono: colorZona(foto.zona),
                      ausente: 'sin reloj',
                    },
                  ]}
                />
              )
            }
            accion={
              <FranjaAccion
                titulo={descansando ? 'EMPEZAR YA' : 'SERIE HECHA'}
                /* El mil lo cierran los metros que canta la cinta; el descanso,
                   su cuenta atrás. El toque adelanta, no es la única salida —
                   ni siquiera cuando la cinta calla, porque lo declarado sigue
                   contando metros y el hito sigue pudiendo llegar. */
                unicaSalida={false}
                onClick={() => {
                  onLog(
                    descansando
                      ? `${reloj()} · te saltas lo que queda de descanso`
                      : `${reloj()} · cierras el mil a mano, con ${distanciaMedida(foto.mTramo)} de ${METROS_CINTA} m`,
                  );
                  setToques((v) => ({ ...v, atajos: [...v.atajos, { t, idx: foto.idx }] }));
                }}
              />
            }
          />
        }
        velo={
          pausado ? (
            <VeloPausa
              nota={
                declarada
                  ? 'La cinta sigue andando: párala tú en la consola. Aquí no se cuentan metros hasta que vuelvas.'
                  : 'La cinta sigue andando: párala tú en la consola.'
              }
              onReanudar={() => setPausado(false)}
            />
          ) : null
        }
        sobreimpreso={
          <>
            <Aviso anuncio={anuncio} />
            <Destello hito={hito} />
          </>
        }
      />
    </>
  );
}
