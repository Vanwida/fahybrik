'use client';

// EL CIERRE del tramo. No es uno de los tres escenarios del guion: se llega
// jugando, y existe porque si no la pantalla se quedaría congelada en 1.000 m
// con una cuenta atrás viva al lado, que es exactamente la clase de mentira que
// el §7 prohíbe.
//
// Aquí el sujeto ya no es tu salida ni tus metros: es el TIEMPO de la pieza,
// que es lo que puntúa en dobles. Y debajo, la única frase que hay que leerse
// una vez en la vida: de esos 1.000, tuyos son los tuyos.
//
// El lienzo sigue teñido de tu zona y no de naranja: acabas de soltar el remo y
// tu pulso está donde está. El acento se reserva para el instante en que algo se
// logra, no para una pantalla que se queda puesta hasta que la tocas (§10.1).

import type { TwinAppearance } from '../../types';
import { Apoyo, Delta, EtiquetaSujeto, FilaApoyos, FranjaAccion, MarcoVivo, Numeral } from '../../kit-vivo';
import { reloj } from '../../datos-reales';
import { ApoyoReparto, Cromo, LienzoVivo, MarcadorTramo, pulsoTrasRelevo } from './atoms';
import {
  CAMBIO_S,
  COLOR_TEXTO,
  PAREJA,
  TRAMO,
  metrosPorQuien,
  metrosTexto,
  relojTramoS,
  ritmoCifras,
  type Segmento,
} from './data';

export function EscenaFin({
  hechos,
  actual,
  onSiguiente,
  onLog,
  appearance,
}: {
  hechos: Segmento[];
  actual: Segmento;
  onSiguiente: () => void;
  onLog: (linea: string) => void;
  appearance: TwinAppearance;
}) {
  const metros = TRAMO.totalM;
  const totalS = relojTramoS(hechos, actual, metros);
  const mediaS500 = (totalS / metros) * 500;
  const reparto = metrosPorQuien(hechos, actual, metros);
  const cambios = hechos.length;

  // El marcador va SIN reloj: aquí el reloj del tramo ya es el sujeto de arriba,
  // y el mismo 4:24 dos veces en el mismo lienzo no es contexto, es ruido.
  const marcador = <MarcadorTramo hechos={hechos} actual={actual} metros={metros} />;

  return (
    <LienzoVivo ppm={pulsoTrasRelevo([...hechos, actual])} appearance={appearance}>
      <MarcoVivo
        cromo={
          <Cromo
            relevo={TRAMO.totalM / TRAMO.relevoM}
            relevos={TRAMO.totalM / TRAMO.relevoM}
            onSalir={() => onLog('salir del entreno: el tramo ya está guardado')}
            onPausa={() => onLog('pausar el entreno')}
          />
        }
        contexto={marcador}
        sujeto={
          <>
            <EtiquetaSujeto tono="var(--twin-ok)">Tramo hecho</EtiquetaSujeto>
            <Numeral>{reloj(totalS)}</Numeral>
            <span style={{ font: '500 13px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              {TRAMO.titulo} m a dos, en relevos de {TRAMO.relevoM}
            </span>
            <Delta
              valor={mediaS500 - TRAMO.objetivoS500}
              unidad="s"
              mejorEs="menos"
              sufijo={`vs objetivo ${ritmoCifras(TRAMO.objetivoS500)}/500m`}
              textoNulo="en el objetivo"
            />
          </>
        }
        apoyos={
          <>
            <FilaApoyos>
              <Apoyo etiqueta="De media" valor={ritmoCifras(mediaS500)} pie="/500m" />
              <ApoyoReparto quien="tu" hechos={hechos} actual={actual} metros={metros} />
              <ApoyoReparto quien="pareja" hechos={hechos} actual={actual} metros={metros} />
            </FilaApoyos>

            {/* La media del tramo se come los cambios, y ahí es donde se va el
                tiempo en dobles: son segundos con la máquina parada, que el
                monitor ve tan bien como los que reméis. Sin esta línea el «por
                encima» de arriba parece que os falta ritmo, y no es eso. */}
            {cambios > 0 && (
              <span
                style={{
                  font: '500 12px/1.3 var(--twin-font-sans)',
                  color: 'var(--twin-faint)',
                  textAlign: 'center',
                }}
              >
                {cambios} cambios · {cambios * CAMBIO_S} s parados
              </span>
            )}

            <span
              style={{
                font: '500 12px/1.4 var(--twin-font-sans)',
                color: 'var(--twin-muted)',
                textAlign: 'center',
              }}
            >
              A tu registro van tus{' '}
              <span style={{ color: COLOR_TEXTO.tu, fontWeight: 700 }}>{metrosTexto(reparto.tu)} m</span>. Lo
              que remó {PAREJA} es suyo y no se te apunta.
            </span>
          </>
        }
        accion={<FranjaAccion titulo="Siguiente" nota="del entreno" unicaSalida onClick={onSiguiente} />}
      />
    </LienzoVivo>
  );
}
