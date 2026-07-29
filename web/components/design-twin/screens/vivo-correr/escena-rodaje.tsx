'use client';

// Rodaje continuo 40:00 en Z2.
//
// Aquí el objetivo NO es un ritmo: es una zona. Por eso el sujeto es la zona y
// no el ritmo, y por eso el lienzo entero se tiñe de su color: a dos metros,
// sudando y sin gafas, el color se lee antes que cualquier número. El ritmo
// baja a la fila de apoyos, que es donde le toca cuando no manda.
//
// Lo que hace que la pantalla esté viva sin que toques nada: el autolap. Cada
// kilómetro salta su parcial, y a mitad el pulso se va a Z3 sin que cambie el
// ritmo (la deriva de cualquier rodaje largo). Ahí la pantalla tiene que
// decirlo sin dramatizar y el ambiente cambia de color solo.

import { useState } from 'react';
import type { TwinAppearance } from '../../types';
import { fmtClock, fmtPaceKm } from '../../sim';
import { SP } from '../../kit';
import { Ambiente, Apoyos, BandaZona, Chip, Cifra, IconoPulso, IconoSenal } from './atoms';
import {
  AccionPrincipal,
  Aviso,
  Cabecera,
  Escena,
  VeloPausa,
  useAnuncio,
  useEventos,
  useRelojPausable,
} from './escena';
import { GUIONES, relojSesion, simular, SIN_TOCAR, type Zona, UMBRAL } from './guion';
import { distanciaMedida } from './formato';

const GUION = GUIONES.rodaje;
const ZONA_OBJETIVO: Zona = GUION.sesion[0].objetivoZona ?? 2;

/** Lo que hay que oír cuando te sales, sin drama y con qué hacer. */
function fraseZona(zona: Zona | null): string {
  if (zona === null) return 'Sin pulso no hay zona que enseñar';
  if (zona === ZONA_OBJETIVO) return 'Estás donde toca';
  if (zona < ZONA_OBJETIVO) return `Vas por debajo. Aprieta un poco para volver a Z${ZONA_OBJETIVO}`;
  return `Te has ido a Z${zona}. Afloja un poco y vuelve a Z${ZONA_OBJETIVO}`;
}

export function EscenaRodaje({
  horizontal,
  appearance,
  onLog,
}: {
  horizontal: boolean;
  appearance: TwinAppearance;
  onLog: (linea: string) => void;
}) {
  const [pausado, setPausado] = useState(false);
  const [anuncio, anunciar] = useAnuncio();

  const t = useRelojPausable(!pausado);
  const { foto, eventos } = simular(GUION, t, SIN_TOCAR);
  const enZona = foto.zona === ZONA_OBJETIVO;

  useEventos(eventos, (ev) => {
    if (ev.tipo !== 'km') return;
    anunciar({ titulo: `Km ${ev.km}`, dato: fmtPaceKm(ev.parcialS), pie: '/km' });
    onLog(`${fmtClock(relojSesion(GUION, t))} · km ${ev.km} en ${fmtPaceKm(ev.parcialS)}`);
  });

  const sujeto = (
    <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.m }}>
      {/* Sin pulso no hay número que pintar: se dice, no se deja el hueco (§7). */}
      {foto.ppm !== null && (
        <Cifra horizontal={horizontal} tono={`var(--twin-z${foto.zona ?? 1})`} unidad="ppm">
          {foto.ppm}
        </Cifra>
      )}
      <BandaZona zona={foto.zona} objetivo={ZONA_OBJETIVO} alto={horizontal ? 10 : 14} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center' }}>
        <span
          style={{
            font: 'italic 800 15px/1.2 var(--twin-font-sans)',
            color: enZona ? 'var(--twin-fg)' : 'var(--twin-warning)',
          }}
        >
          {fraseZona(foto.zona)}
        </span>
        {/* El ancla de las zonas es estimada en toda la base: viaja marcada. */}
        {UMBRAL.estimado && (
          <span style={{ font: '500 11px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {`Tus zonas salen de un umbral estimado de ${UMBRAL.ppm} ppm`}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Ambiente zona={foto.zona} appearance={appearance} />
      <div className="twin-screen-safe">
        <Escena
          horizontal={horizontal}
          cabecera={
            <Cabecera
              titulo="Rodaje"
              detalle={`40:00 en Z${ZONA_OBJETIVO}`}
              pausado={pausado}
              onPausa={() => {
                setPausado((p) => !p);
                onLog(`${fmtClock(relojSesion(GUION, t))} · ${pausado ? 'sigues' : 'en pausa'}`);
              }}
              chips={
                <>
                  <Chip texto="Señal" estado="ok">
                    <IconoSenal size={10} />
                  </Chip>
                  <Chip texto="Reloj" estado={foto.ppm === null ? 'buscando' : 'ok'}>
                    <IconoPulso size={10} />
                  </Chip>
                </>
              }
            />
          }
          sujeto={sujeto}
          apoyos={
            <Apoyos
              horizontal={horizontal}
              items={[
                { etiqueta: 'Ritmo', valor: foto.ritmoSkm ? fmtPaceKm(foto.ritmoSkm) : null, unidad: '/km', ausente: 'buscando señal' },
                { etiqueta: 'Tiempo', valor: fmtClock(foto.tTramo), unidad: 'de 40:00' },
                { etiqueta: 'Distancia', valor: distanciaMedida(foto.mSesion) },
              ]}
            />
          }
          accion={
            <AccionPrincipal
              titulo="TERMINAR RODAJE"
              onClick={() => onLog(`${fmtClock(relojSesion(GUION, t))} · terminas el rodaje`)}
            />
          }
          velo={
            pausado ? (
              <VeloPausa
                nota="El reloj y los metros están parados. Cuando vuelvas, seguimos donde lo dejaste."
                onReanudar={() => setPausado(false)}
              />
            ) : null
          }
          sobreimpreso={<Aviso anuncio={anuncio} />}
        />
      </div>
    </>
  );
}
