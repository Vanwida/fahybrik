'use client';

// Antes de empezar, sin señal todavía.
//
// Es el estado que más veces se ve de esta pantalla y el que peor se trata en
// casi todas las apps: o te dejan empezar y luego el primer kilómetro sale
// inventado, o te enseñan un ritmo a cero como si ya estuvieras corriendo.
//
// Aquí la pantalla ESPERA, y lo dice: sin señal no hay ritmo, así que EMPEZAR
// no se enciende hasta que fija. Mientras tanto el hueco no se desperdicia, se
// gana: lo ocupa lo único que sirve en ese momento, que es qué tienes que hacer
// para que fije y a qué vas a salir en cuanto lo haga.

import { useState } from 'react';
import type { TwinAppearance } from '../../types';
import { fmtClock, useTimeline } from '../../sim';
import { Card, Display, IconClose, Label, Mono, RoundButton, SP } from '../../kit';
import { Ambiente, FranjaAccion } from '../../kit-vivo';
import { Chip, IconoPulso, IconoSenal, Objetivo } from './atoms';
import { Cabecera, CapaVivo, MarcoCorrer, useRelojPausable } from './escena';
import { GUIONES, METROS_SERIE, simular, SIN_TOCAR } from './guion';
import { OBJETIVO_SERIE } from './formato';

const GUION = GUIONES['gps-buscando'];
/** Lo que tarda esta señal en fijar. El resto de la pantalla cuelga de aquí. */
const FIJA_EN_S = 6;
/** El reloj entra antes que la señal: son dos cosas distintas y se ven distintas. */
const RELOJ_EN_S = 3;

/**
 * La acción todavía apagada. `FranjaAccion` no tiene estado inactivo (el §10 no
 * lo previó), así que aquí se apaga por estilo y el toque no hace nada: sin
 * señal no se puede empezar, y encenderla sería prometer una medida que no hay.
 */
const APAGADA = { opacity: 0.45, cursor: 'default' } as const;

export function EscenaBuscando({
  horizontal,
  appearance,
  onLog,
}: {
  horizontal: boolean;
  appearance: TwinAppearance;
  onLog: (linea: string) => void;
}) {
  const [fijada, setFijada] = useState(false);

  // El reloj corre para que el pulso entre en vivo; la sesión no avanza (sin
  // señal no hay metros), así que este guion no produce ningún hito.
  const t = useRelojPausable(true);
  const { foto } = simular(GUION, t, SIN_TOCAR);

  useTimeline([
    { at: RELOJ_EN_S * 1000, run: () => onLog(`${fmtClock(RELOJ_EN_S)} · el reloj ya da pulso`) },
    {
      at: FIJA_EN_S * 1000,
      run: () => {
        setFijada(true);
        onLog(`${fmtClock(FIJA_EN_S)} · señal GPS fijada`);
      },
    },
  ]);

  const sujeto = (
    <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.m, textAlign: 'center' }}>
      <span style={{ color: fijada ? 'var(--twin-ok)' : 'var(--twin-warning)' }}>
        <IconoSenal size={horizontal ? 44 : 58} buscando={!fijada} />
      </span>
      <Display size={horizontal ? 22 : 26}>{fijada ? 'Señal fijada' : 'Buscando señal GPS'}</Display>
      <span style={{ font: '500 14px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        {fijada
          ? 'Ya se puede medir el ritmo. Cuando quieras, sales.'
          : 'Sal a cielo abierto y espera unos segundos. Sin señal no se puede medir el ritmo, y no te lo vamos a inventar.'}
      </span>
    </div>
  );

  return (
    <>
      <Ambiente zona={null} appearance={appearance} acento={fijada} />
      <CapaVivo
        marco={
          <MarcoCorrer
            horizontal={horizontal}
            cromo={
              <Cabecera
                titulo="8×400"
                detalle="Antes de empezar"
                chips={
                  <>
                    <Chip texto={fijada ? 'Señal' : 'Buscando'} estado={fijada ? 'ok' : 'buscando'}>
                      <IconoSenal size={10} buscando={!fijada} />
                    </Chip>
                    {/* Sin reloj conectado no hay pulso que enseñar, y se ve en el chip. */}
                    <Chip texto={foto.ppm === null ? 'Reloj' : `${foto.ppm}`} estado={foto.ppm === null ? 'buscando' : 'ok'}>
                      <IconoPulso size={10} />
                    </Chip>
                  </>
                }
                accion={
                  <RoundButton onClick={() => onLog(`${fmtClock(t)} · sales del entreno sin empezar`)} label="Salir">
                    <IconClose />
                  </RoundButton>
                }
              />
            }
            sujeto={sujeto}
            apoyos={
              <Card padding={SP.m}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s }}>
                    <Label size={10}>Primero</Label>
                    <span style={{ flex: 1 }} />
                    <Mono size={13} color="var(--twin-muted)">
                      1 de 8
                    </Mono>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SP.s, flexWrap: 'wrap' }}>
                    <span style={{ font: 'italic 800 20px/1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
                      {`${METROS_SERIE} m`}
                    </span>
                    <Objetivo>{`${OBJETIVO_SERIE.reloj} el 400`}</Objetivo>
                    <Mono size={12} color="var(--twin-muted)">{`${OBJETIVO_SERIE.ritmo} /km`}</Mono>
                  </div>
                </div>
              </Card>
            }
            accion={
              <FranjaAccion
                titulo={fijada ? 'EMPEZAR' : 'BUSCANDO SEÑAL'}
                /* Aquí nada más puede sacarte de la espera: si no sales tú, no
                   sales. Por eso al fijar la señal el contorno se rellena. */
                unicaSalida={fijada}
                style={fijada ? undefined : APAGADA}
                onClick={fijada ? () => onLog(`${fmtClock(t)} · empiezas la serie 1`) : () => undefined}
              />
            }
          />
        }
      />
    </>
  );
}
