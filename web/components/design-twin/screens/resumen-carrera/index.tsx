'use client';

// AL TERMINAR DE CORRER — el resumen honesto de un entreno con contraste.
//
// DE DÓNDE SALE. El reloj de un atleta de Pablo, tras un fartlek de 14,5 km, le
// enseñó cuatro líneas: TOTAL TIME 1:20:12 · TOTAL DISTANCE 14,32 KM · AVERAGE
// PACE 5'36"/KM · AVERAGE CADENCE. Está clarísimo y está mal: **un fartlek no
// tiene un ritmo, tiene dos.** «5:36/km» es la media de los fuertes y los
// suaves, un número que no describe ningún momento de esa carrera.
//
// Apple y Garmin promedian porque no saben qué formato estás haciendo. Nosotros
// sí: lo prescribió el coach. Esta pantalla es esa ventaja gastada.
//
// EL SUJETO — y no es el contraste, que era la hipótesis de partida. Un atleta
// no sale a buscar un contraste ni tiene un contraste objetivo: sale a correr
// ocho fuertes a un ritmo. Lo que pregunta al abrir esto es «¿a cuánto fui?».
// Así que el sujeto es **el ritmo de lo fuerte**, y lo suave va pegado, en el
// segundo peldaño del numeral: es lo que hace que 3:58 signifique algo (3:58
// contra un trote de 5:12 es una sesión de series; contra 4:10 es un tempo
// disfrazado). El par se expresa por jerarquía, y la jerarquía es honesta.
//
// Pero el sujeto no es siempre el mismo, y ESA es la pieza de dominio:
//
//   **La media se gana el derecho a ser el sujeto sólo si la carrera fue UNA
//   SOLA COSA.**
//
// En un rodaje continuo la media describe cada minuto y es el sujeto legítimo
// (escenario `rodaje`). En un fartlek no describe nada (escenario `detectado`).
// Y cuando no se puede decomponer, el sujeto degrada a lo que SÍ se midió —los
// kilómetros— y la media aparece con su etiqueta verdadera (escenario
// `sin-tramos`, que es el peor caso y por eso va primero, §6.3). El reparto lo
// decide `tramos.ts`, que está probado aparte.
//
// ARQUETIPO: Detalle (§6.2). El hueco se gana con lo que da sentido al dato —el
// peine de tramos, el contraste, el aguante, de dónde sale—, nunca con aire.
// Se usa `MarcoVivo` a propósito y no un lienzo nuevo: el atleta viene de mirar
// el numeral en vivo a esa misma altura, y el resumen le recoge el número donde
// lo dejó (§10.3).

import { useEffect } from 'react';
import {
  Ambiente,
  Apoyo,
  EtiquetaSujeto,
  FilaApoyos,
  FranjaAccion,
  MarcoVivo,
  Numeral,
  colorZona,
  zonaDe,
} from '../../kit-vivo';
import { esDecimal, ppm, reloj } from '../../kit-composicion/formato';
import { lecturaDeCarrera, type Lectura } from '../../tramos';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { ESCENAS, type Escena } from './datos';
import { Aguante, NotaCerteza, Peine, SinTramos } from './piezas';

export const meta: TwinMeta = {
  id: 'resumen-carrera',
  titulo: 'Al terminar de correr — el resumen honesto',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  descripcion:
    'Un fartlek no tiene un ritmo, tiene dos. El sujeto es el ritmo de lo fuerte contra lo suave, con el aguante debajo — y cuando no se puede separar, se dice en vez de promediar.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'sin-tramos',
    titulo: 'El peor caso: sin tramos',
    descripcion:
      'El fartlek de 14,32 km tal y como la app lo guarda HOY: un solo ritmo medio. El sujeto pasa a ser lo que sí se midió y la media sale con su etiqueta verdadera.',
  },
  {
    id: 'detectado',
    titulo: 'Fartlek con serie de ritmo',
    descripcion:
      'El mismo tipo de sesión si guardáramos el ritmo: ocho fuertes a 3:58 contra un trote de 5:12, y el peine enseñando que la media no toca ninguna barra.',
  },
  {
    id: 'marcado',
    titulo: 'Ocho vueltas reales',
    descripcion:
      'Datos reales de la carrera 44. Los tramos están marcados y cubren la sesión entera: ahí la media SÍ describe las vueltas, y la lectura es el aguante.',
  },
  {
    id: 'rodaje',
    titulo: 'Rodaje continuo',
    descripcion:
      'La otra mitad de la ley: fue una sola cosa, así que la media es honesta y se queda de sujeto. Prueba que la regla no dispara de más.',
  },
];

export function Screen({ escenario, appearance, onLog }: TwinScreenProps) {
  const escena: Escena = ESCENAS[escenario] ?? ESCENAS['sin-tramos']!;
  const lectura = lecturaDeCarrera(escena.carrera);
  const zona = zonaDe(escena.fcMediaPpm);
  // El pulso baja a los apoyos sólo cuando no hay peine que ocupe la fila.
  const fcEnApoyos =
    !lectura.tramosSonLectura && escena.fcMediaPpm != null && escena.fcMaxPpm != null;

  useEffect(() => {
    onLog(`Forma: ${lectura.forma}${lectura.certeza ? ` · tramos ${lectura.certeza}` : ''}`);
    onLog(escena.procedencia);
  }, [escenario]); // eslint-disable-line react-hooks/exhaustive-deps

  // `twin-screen-safe` es el contenedor de todas las vistas del doble: el
  // `Ambiente` baña el lienzo entero —notch incluido, que es lo que pide el
  // §10.1— y el marco vive DENTRO de los safe areas. Sin él el cromo cae encima
  // de la barra de estado y el sujeto sube 80 pt por encima de donde cae en las
  // otras nueve vistas, que es exactamente el baile que prohíbe el §10.3.
  return (
    <div className="twin-screen-safe">
      <Ambiente zona={zona} appearance={appearance} />
      <MarcoVivo
        cromo={<Cromo escena={escena} />}
        contexto={<Totales escena={escena} lectura={lectura} fcEnApoyos={fcEnApoyos} />}
        sujeto={<Sujeto escena={escena} lectura={lectura} />}
        apoyos={<Apoyos escena={escena} lectura={lectura} fcEnApoyos={fcEnApoyos} />}
        accion={
          <FranjaAccion
            titulo="Guardar el entreno"
            unicaSalida
            nota={escena.prescrito}
            onClick={() => onLog('Entreno guardado')}
          />
        }
      />
    </div>
  );
}

/**
 * El cromo se reparte a los lados y NUNCA por el centro: ahí vive la isla
 * dinámica. Centrado, «Fartlek 14 km · sensaciones» sale partido en dos por el
 * recorte del teléfono — se vio a la primera captura.
 */
function Cromo({ escena }: { escena: Escena }) {
  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span
        className="t-readout-label"
        style={{
          color: 'var(--twin-fg)',
          letterSpacing: '0.12em',
          maxWidth: 130,
          textAlign: 'left',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {escena.titulo}
      </span>
      <span className="t-readout-label" style={{ color: 'var(--twin-muted)', letterSpacing: '0.12em' }}>
        Hoy
      </span>
    </div>
  );
}

/**
 * LOS TOTALES, DEGRADADOS A CONTEXTO. Y ese es el movimiento entero: lo que el
 * reloj llamaba «el resumen» —tiempo, distancia, media— es aquí la línea de
 * arriba, la que sitúa. El sujeto está debajo y es otra cosa.
 */
function Totales({ escena, lectura, fcEnApoyos }: { escena: Escena; lectura: Lectura; fcEnApoyos: boolean }) {
  const { distanciaM, duracionS } = escena.carrera;
  const piezas = [
    // La distancia sube al sujeto cuando no hay nada mejor que enseñar; ahí no
    // se repite aquí. Y el pulso sólo aparece si no lo está diciendo ya la fila
    // de apoyos: el mismo número dos veces en la misma pantalla es ruido.
    lectura.forma === 'no-se-sabe' ? null : `${esDecimal(distanciaM / 1000, 2)} km`,
    reloj(duracionS),
    !fcEnApoyos && escena.fcMediaPpm != null ? ppm(escena.fcMediaPpm) : null,
  ].filter((p): p is string => p != null);

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 10 }}>
      {piezas.map((p, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10 }}>
          {i > 0 && <span style={{ color: 'var(--twin-faint)', font: '500 15px/1 var(--twin-font-sans)' }}>·</span>}
          <span className="t-readout-s" style={{ color: 'var(--twin-muted)', fontSize: 19 }}>
            {p}
          </span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El sujeto — uno por forma
// ---------------------------------------------------------------------------

function Sujeto({ escena, lectura }: { escena: Escena; lectura: Lectura }) {
  if (lectura.forma === 'con-contraste' && lectura.fuerte) return <ParDeRitmos lectura={lectura} />;
  if (lectura.forma === 'uniforme') return <MediaHonesta lectura={lectura} />;
  return <LoQueSiSeMidio escena={escena} lectura={lectura} />;
}

/** Fueron dos ritmos: el fuerte manda y el suave va pegado, un peldaño abajo. */
function ParDeRitmos({ lectura }: { lectura: Lectura }) {
  const { fuerte, suave, contrasteSkm } = lectura;
  return (
    <>
      <EtiquetaSujeto>{`${fuerte!.n} ${fuerte!.n === 1 ? 'fuerte' : 'fuertes'}`}</EtiquetaSujeto>
      <Numeral unidad="/km">{reloj(fuerte!.ritmoSkm)}</Numeral>
      {suave ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 10 }}>
          <Numeral escala="segundo" tono="var(--twin-muted)" unidad="/km">
            {reloj(suave.ritmoSkm)}
          </Numeral>
          <span style={{ font: '600 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {`suave · contraste ${reloj(contrasteSkm!)}`}
          </span>
        </div>
      ) : (
        // El motor graba el trabajo y tira la recuperación: hubo contraste, pero
        // no hay contra qué. Se dice; no se rellena con la media (§7).
        <span style={{ font: '600 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)', marginTop: 12 }}>
          No se guardó lo suave: no hay contra qué comparar
        </span>
      )}
    </>
  );
}

/**
 * Fue una sola cosa, y entonces la media es el sujeto de pleno derecho. Se dice
 * POR QUÉ lo es: sin esa frase el atleta no puede distinguir esta media de la
 * que le enseña el reloj, que es justo la que no vale.
 */
function MediaHonesta({ lectura }: { lectura: Lectura }) {
  const vueltas = lectura.tramos.filter((t) => t.ritmoSkm != null).length;
  return (
    <>
      <EtiquetaSujeto>{vueltas > 1 ? `${vueltas} vueltas` : 'Ritmo medio'}</EtiquetaSujeto>
      <Numeral unidad="/km">{reloj(lectura.mediaSkm!)}</Numeral>
      <span
        style={{
          font: '600 12px/1.35 var(--twin-font-sans)',
          color: 'var(--twin-muted)',
          marginTop: 12,
          maxWidth: 280,
          textAlign: 'center',
        }}
      >
        {vueltas > 1
          ? 'Todas las vueltas fueron al mismo esfuerzo: esta media sí las describe'
          : 'Corriste a una sola intensidad: esta media describe cada kilómetro'}
      </span>
    </>
  );
}

/**
 * EL PEOR CASO, Y EL ÚNICO QUE HOY SE PUEDE ALIMENTAR CON PRODUCCIÓN.
 *
 * No se puede separar la carrera, así que el sujeto degrada a lo que SÍ se
 * midió: los kilómetros, que son reales y son el logro. Y la media aparece —
 * porque esconderla sería tan deshonesto como disfrazarla— con la etiqueta que
 * le corresponde. Apple escribe `AVERAGE PACE 5'36"/KM`. Nosotros escribimos el
 * mismo número y le pegamos la verdad al lado: no es el ritmo de ningún tramo.
 */
function LoQueSiSeMidio({ escena, lectura }: { escena: Escena; lectura: Lectura }) {
  const km = escena.carrera.distanciaM / 1000;
  return (
    <>
      <EtiquetaSujeto>Recorriste</EtiquetaSujeto>
      <Numeral unidad="km">{esDecimal(km, 2)}</Numeral>
      {lectura.mediaSkm != null && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 12 }}>
          <Numeral escala="segundo" tono="var(--twin-muted)" unidad="/km">
            {reloj(lectura.mediaSkm)}
          </Numeral>
          <span
            style={{
              font: '600 12px/1.35 var(--twin-font-sans)',
              color: 'var(--twin-muted)',
              maxWidth: 290,
              textAlign: 'center',
            }}
          >
            {lectura.mediaEsMezcla
              ? 'Media de los fuertes y los suaves — no es el ritmo de ningún tramo'
              : 'Ritmo medio de toda la sesión'}
          </span>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Los apoyos — el hueco del Detalle se gana con lo que da sentido al dato
// ---------------------------------------------------------------------------

function Apoyos({ escena, lectura, fcEnApoyos }: { escena: Escena; lectura: Lectura; fcEnApoyos: boolean }) {
  const zona = zonaDe(escena.fcMediaPpm);
  return (
    <>
      {/*
       * El peine sólo se pinta si los tramos SON una lectura. Un rodaje
       * continuo también se trocea por dentro —hace falta para concluir que no
       * hay frontera—, pero dibujar esos trozos enseñaría una estructura que el
       * atleta no corrió, y encima con la línea de la media flotando sobre una
       * sola barra. Lo mismo con la nota de certeza: no se califica un tramo
       * que no se está enseñando.
       */}
      {lectura.tramosSonLectura && <Peine tramos={lectura.tramos} mediaSkm={lectura.mediaSkm} />}

      {/*
       * El §10.3 manda que el sobrante lo cojan PRIMERO los apoyos. Cuando hay
       * peine, el sobrante ya está cogido; cuando no —el peor caso, que es
       * justo el que más aire deja— el pulso lo llena, y lo llena con dato
       * medido de verdad: `avg_hr` y `max_hr` están rellenos en 156 de los 157
       * segmentos de correr de la base. Dejar ahí un hueco teniendo esto era
       * quedarse corto, no ser honesto.
       */}
      {fcEnApoyos && (
        <FilaApoyos>
          <Apoyo etiqueta="FC media" valor={`${escena.fcMediaPpm}`} tono={colorZona(zona)} pie={`Z${zona}`} />
          <Apoyo etiqueta="FC máx" valor={`${escena.fcMaxPpm}`} pie="ppm" />
        </FilaApoyos>
      )}

      {lectura.aguante ? (
        <Aguante aguante={lectura.aguante} />
      ) : lectura.forma === 'no-se-sabe' ? (
        <SinTramos prescrito={escena.carrera.formaPrescrita === 'con-contraste'} />
      ) : null}

      {lectura.tramosSonLectura && lectura.certeza && <NotaCerteza certeza={lectura.certeza} />}
    </>
  );
}
