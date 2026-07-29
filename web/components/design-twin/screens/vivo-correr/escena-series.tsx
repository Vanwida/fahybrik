'use client';

// 8×400 con 90 s, a 1:32 el 400.
//
// Aquí manda el HITO: cruzar los 400 te saca del tramo, y el botón es solo el
// atajo para el mismo cierre. Por eso el sujeto no es el cronómetro ni la
// distancia recorrida: son los METROS QUE FALTAN, drenando. Es la única lectura
// que contesta lo que preguntas veinte veces por serie («¿cuánto queda?») sin
// que tengas que restar nada de cabeza a 3:50.
//
// Y por eso el descanso es OTRA pantalla, no un hueco: cuando el hito cae, el
// sujeto cambia (cuenta atrás), el ambiente cambia (el pulso baja de zona) y se
// anuncia con un destello, porque a esa altura de la serie no estás mirando.

import { useState } from 'react';
import type { TwinAppearance } from '../../types';
import { fmtClock, fmtPaceKm } from '../../sim';
import { SP } from '../../kit';
import { Ambiente, FranjaAccion, Numeral, colorZona } from '../../kit-vivo';
import { Apoyos, Chip, Drenaje, IconoPulso, IconoSenal, Pie, Veredicto } from './atoms';
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
import { GUIONES, METROS_SERIE, relojSesion, RITMO, serieDe, simular, type Toques } from './guion';
import { colorJuicio, delta, distanciaMedida, fraccion, juzgar, metrosQueQuedan, OBJETIVO_SERIE, palabraJuicio, proyeccion } from './formato';

const GUION = GUIONES['series-calle'];

export function EscenaSeries({
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

  useEventos(eventos, (ev) => {
    if (ev.tipo !== 'cierra') return;
    const { numero } = serieDe(GUION.sesion, ev.idx);
    if (ev.tramo.tipo === 'distancia') {
      destellar({ palabra: 'DESCANSO', tono: 'var(--twin-ok)' });
      anunciar({ titulo: `Serie ${numero}`, dato: fmtClock(ev.tTramo), pie: 'hecha' });
      onLog(`${reloj()} · serie ${numero} hecha en ${fmtClock(ev.tTramo)}`);
    } else {
      destellar({ palabra: `SERIE ${numero}`, tono: 'var(--twin-accent)' });
      onLog(`${reloj()} · descanso hecho, sale la serie ${numero}`);
    }
  });

  const cerrarAMano = () => setToques((v) => ({ ...v, atajos: [...v.atajos, { t, idx: foto.idx }] }));

  const juicio = juzgar(foto.ritmoSkm, foto.tramo.objetivoSkm);
  const tono = colorJuicio(juicio);
  const ultima = foto.parciales[foto.parciales.length - 1];

  const sujetoTrabajo = (
    <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.s }}>
      <span style={{ font: '600 12px/1 var(--twin-font-sans)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--twin-muted)' }}>
        Te quedan
      </span>
      <Numeral horizontal={horizontal} unidad="m">
        {metrosQueQuedan(foto.tramo, foto.mTramo)}
      </Numeral>
      <Drenaje fraccion={fraccion(foto.tramo, foto.tTramo, foto.mTramo)} tono={tono} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s, marginTop: SP.xs }}>
        {/* Sin señal no hay ritmo: se dice, no se inventa un número (§7). */}
        {foto.ritmoSkm === null ? (
          <span style={{ font: '600 14px/1 var(--twin-font-sans)', color: 'var(--twin-warning)' }}>Buscando señal</span>
        ) : (
          <>
            <Numeral horizontal={horizontal} escala="segundo" tono={tono} unidad="/km">
              {fmtPaceKm(foto.ritmoSkm)}
            </Numeral>
            <span className="t-readout-s" style={{ color: tono, fontSize: 15 }}>
              {`${delta(foto.ritmoSkm, foto.tramo.objetivoSkm ?? RITMO.serie400)} s/km`}
            </span>
          </>
        )}
      </div>
      {foto.ritmoSkm !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.s }}>
          <Pie>{`${fmtClock(proyeccion(foto.ritmoSkm, METROS_SERIE))} el 400 · objetivo ${OBJETIVO_SERIE.reloj}`}</Pie>
          {palabraJuicio(juicio) && <Veredicto texto={palabraJuicio(juicio) ?? ''} tono={tono} />}
        </div>
      )}
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
                detalle={descansando ? '90 s entre series' : `8×400 · ${OBJETIVO_SERIE.reloj} el 400`}
                pausado={pausado}
                onPausa={() => {
                  setPausado((p) => !p);
                  onLog(`${reloj()} · ${pausado ? 'sigues' : 'en pausa'}`);
                }}
                chips={
                  <>
                    <Chip texto="Señal" estado="ok">
                      <IconoSenal size={10} />
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
                    objetivo={`400 m a ${OBJETIVO_SERIE.reloj}`}
                  />
                </div>
              ) : (
                <Apoyos
                  horizontal={horizontal}
                  items={[
                    { etiqueta: 'Tiempo', valor: fmtClock(foto.tTramo) },
                    {
                      etiqueta: 'Pulso',
                      valor: foto.ppm === null ? null : `${foto.ppm}`,
                      unidad: 'ppm',
                      tono: colorZona(foto.zona),
                      ausente: 'sin reloj',
                    },
                    { etiqueta: 'Última', valor: ultima === undefined ? null : fmtClock(ultima), ausente: 'es la primera' },
                  ]}
                />
              )
            }
            accion={
              <FranjaAccion
                titulo={descansando ? 'EMPEZAR YA' : 'SERIE HECHA'}
                /* Los 400 los cierra el hito y el descanso lo cierra su cuenta
                   atrás: en las dos el toque adelanta, no es la única salida. */
                unicaSalida={false}
                onClick={() => {
                  onLog(
                    descansando
                      ? `${reloj()} · te saltas lo que queda de descanso`
                      : `${reloj()} · cierras la serie a mano, sin llegar a los ${METROS_SERIE}`,
                  );
                  cerrarAMano();
                }}
              />
            }
          />
        }
        velo={
          pausado ? (
            <VeloPausa
              nota={`Llevas ${distanciaMedida(foto.mSesion)} de sesión. Al reanudar sigues en esta misma serie.`}
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
